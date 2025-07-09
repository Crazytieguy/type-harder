"use node";

import { ConvexError, v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

export const scrapeSequences = internalAction({
  args: {
    pageLimit: v.optional(v.number()),
  },
  handler: async (ctx, { pageLimit }) => {
    console.log("Starting to scrape The Sequences...");
    
    // First, get the table of contents
    const tocUrl = "https://www.readthesequences.com/Contents?action=markdown";
    const tocResponse = await fetch(tocUrl);
    
    if (!tocResponse.ok) {
      throw new ConvexError("Failed to fetch table of contents");
    }
    
    const tocMarkdown = await tocResponse.text();
    
    // Parse the TOC to extract article URLs
    const articleUrls = extractArticleUrls(tocMarkdown);
    console.log(`Found ${articleUrls.length} articles to scrape`);
    
    // Apply page limit if specified
    const urlsToProcess = pageLimit ? articleUrls.slice(0, pageLimit) : articleUrls;
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process each article
    for (const { url, bookTitle, sequenceTitle } of urlsToProcess) {
      try {
        // Check if already processed
        const existingProgress = await ctx.runQuery(internal.scrapingQueries.getScrapingProgress, { url });
        
        if (existingProgress?.status === "completed") {
          console.log(`Skipping already processed: ${url}`);
          continue;
        }
        
        // Mark as processing
        await ctx.runMutation(internal.scrapingMutations.updateScrapingProgress, {
          url,
          status: "processing",
        });
        
        // Fetch the article content
        const articleResponse = await fetch(`${url}?action=markdown`);
        
        if (!articleResponse.ok) {
          throw new Error(`Failed to fetch article: ${url}`);
        }
        
        const articleMarkdown = await articleResponse.text();
        
        // Extract article title and paragraphs
        const { title, paragraphs } = extractArticleContent(articleMarkdown);
        
        // Save paragraphs to database
        for (let i = 0; i < paragraphs.length; i++) {
          const paragraph = paragraphs[i];
          const wordCount = countWords(paragraph);
          
          // Only save paragraphs with meaningful content (at least 10 words)
          if (wordCount >= 10) {
            await ctx.runMutation(internal.scrapingMutations.saveParagraph, {
              content: paragraph,
              bookTitle,
              sequenceTitle,
              articleTitle: title,
              articleUrl: url,
              paragraphIndex: i,
              wordCount,
            });
          }
        }
        
        // Mark as completed
        await ctx.runMutation(internal.scrapingMutations.updateScrapingProgress, {
          url,
          status: "completed",
        });
        
        successCount++;
        console.log(`Processed ${successCount}/${urlsToProcess.length}: ${title}`);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        errorCount++;
        console.error(`Error processing ${url}:`, error);
        
        await ctx.runMutation(internal.scrapingMutations.updateScrapingProgress, {
          url,
          status: "failed",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
    
    console.log(`Scraping completed: ${successCount} success, ${errorCount} errors`);
    return { successCount, errorCount, total: urlsToProcess.length };
  },
});

function extractArticleUrls(tocMarkdown: string): Array<{ url: string; bookTitle: string; sequenceTitle: string }> {
  const urls: Array<{ url: string; bookTitle: string; sequenceTitle: string }> = [];
  const lines = tocMarkdown.split('\n');
  
  // First, extract all reference links at the bottom
  const linkRefs: { [key: string]: string } = {};
  for (const line of lines) {
    const refMatch = line.match(/^\s*\[(\d+)\]:\s+(https:\/\/www\.readthesequences\.com\/[^\s]+)/);
    if (refMatch) {
      linkRefs[refMatch[1]] = refMatch[2];
    }
  }
  
  console.log(`Found ${Object.keys(linkRefs).length} reference links`);
  
  let currentBook = "";
  let currentSequence = "";
  
  for (const line of lines) {
    // Match book titles (e.g., "*   [Book I: Map and Territory][5]")
    const bookMatch = line.match(/^\*\s+\[Book\s+[IVX]+:\s+(.+)\]\[(\d+)\]/);
    if (bookMatch) {
      currentBook = bookMatch[1].trim();
      continue;
    }
    
    // Match sequence titles with numbering (e.g., "    1.  [Predictably Wrong][6]")
    // These have exactly 4 spaces of indentation
    const sequenceMatch = line.match(/^\s{4}\d+\.\s+\[([^\]]+)\]\[(\d+)\]/);
    if (sequenceMatch && currentBook) {
      currentSequence = sequenceMatch[1].trim();
      continue;
    }
    
    // Match article links with numbering (e.g., "        1.  [What Do I Mean By "Rationality"?][7]")
    // These have 8 or more spaces of indentation
    const articleMatch = line.match(/^\s{8,}\d+\.\s+\[([^\]]+)\]\[(\d+)\]/);
    if (articleMatch && currentBook && currentSequence) {
      const refNum = articleMatch[2];
      const url = linkRefs[refNum];
      if (url) {
        urls.push({
          url,
          bookTitle: currentBook,
          sequenceTitle: currentSequence,
        });
      }
    }
  }
  
  console.log(`Extracted ${urls.length} article URLs`);
  return urls;
}

function extractArticleContent(markdown: string): { title: string; paragraphs: string[] } {
  const lines = markdown.split('\n');
  let title = "";
  const paragraphs: string[] = [];
  let currentParagraph = "";
  let inBlockquote = false;
  let inCodeBlock = false;
  
  for (const line of lines) {
    // Extract title from first h1
    if (!title && line.match(/^#\s+(.+)$/)) {
      title = line.replace(/^#\s+/, '').trim();
      continue;
    }
    
    // Skip other headings
    if (line.match(/^#+\s+/)) {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = "";
      }
      continue;
    }
    
    // Track blockquotes
    if (line.startsWith('>')) {
      inBlockquote = true;
      continue;
    } else if (inBlockquote && line.trim() === '') {
      inBlockquote = false;
      continue;
    }
    
    // Track code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    
    // Skip if in blockquote or code block
    if (inBlockquote || inCodeBlock) {
      continue;
    }
    
    // Empty line indicates paragraph break
    if (line.trim() === '') {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = "";
      }
    } else {
      // Add line to current paragraph
      currentParagraph += (currentParagraph ? " " : "") + line.trim();
    }
  }
  
  // Don't forget the last paragraph
  if (currentParagraph.trim()) {
    paragraphs.push(currentParagraph.trim());
  }
  
  return { title, paragraphs };
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(word => word.length > 0).length;
}