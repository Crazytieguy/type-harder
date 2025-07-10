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
        let articleResponse = await fetch(`${url}?action=markdown`);
        
        if (!articleResponse.ok) {
          throw new Error(`Failed to fetch article: ${url}`);
        }
        
        let articleMarkdown = await articleResponse.text();
        let finalUrl = url;
        
        // Extract article title and paragraphs, handling redirects
        let title: string;
        let paragraphs: string[];
        
        try {
          const result = extractArticleContent(articleMarkdown);
          title = result.title;
          paragraphs = result.paragraphs;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "";
          
          // Check if this is a redirect
          if (errorMessage.startsWith("REDIRECT:")) {
            const redirectPath = errorMessage.replace("REDIRECT:", "");
            const redirectUrl = `https://www.readthesequences.com/${redirectPath}`;
            
            console.log(`   ↪️  Following redirect from ${url} to ${redirectUrl}`);
            
            // Fetch the redirect target
            articleResponse = await fetch(`${redirectUrl}?action=markdown`);
            
            if (!articleResponse.ok) {
              throw new Error(`Failed to fetch redirect target: ${redirectUrl}`);
            }
            
            articleMarkdown = await articleResponse.text();
            finalUrl = redirectUrl;
            
            // Try parsing again
            const result = extractArticleContent(articleMarkdown);
            title = result.title;
            paragraphs = result.paragraphs;
          } else {
            // Re-throw if not a redirect
            throw error;
          }
        }
        
        // Save paragraphs to database
        for (let i = 0; i < paragraphs.length; i++) {
          const paragraph = paragraphs[i];
          const wordCount = countWords(paragraph);
          
          // Save all paragraphs (filtering can be done later when selecting)
          await ctx.runMutation(internal.scrapingMutations.saveParagraph, {
            content: paragraph,
            bookTitle,
            sequenceTitle,
            articleTitle: title,
            articleUrl: finalUrl,
            paragraphIndex: i,
            wordCount,
          });
        }
        
        // Mark as completed
        await ctx.runMutation(internal.scrapingMutations.updateScrapingProgress, {
          url,
          status: "completed",
        });
        
        successCount++;
        console.log(`Processed ${successCount}/${urlsToProcess.length}: ${title}`);
        
        // Add a small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        
        // Log detailed error information
        console.error(`\n❌ ERROR processing ${url}:`);
        console.error(`   Message: ${errorMessage}`);
        if (error instanceof Error && error.stack) {
          console.error(`   Stack: ${error.stack.split('\n')[0]}`);
        }
        
        // Special handling for known error types
        if (errorMessage.includes("Failed to fetch redirect target")) {
          console.log(`   ℹ️  Failed to follow redirect - target page may not exist`);
        }
        
        await ctx.runMutation(internal.scrapingMutations.updateScrapingProgress, {
          url,
          status: "failed",
          errorMessage,
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
  
  // Check for redirect pages and extract the redirect target
  const redirectMatch = markdown.match(/\(:redirect\s+([^\s]+)\s+quiet=1\s*:\)/);
  if (redirectMatch) {
    // Extract the redirect target (e.g., "Main.Focus-Your-Uncertainty")
    const redirectTarget = redirectMatch[1];
    // Convert format: Main.Focus-Your-Uncertainty -> Focus-Your-Uncertainty
    const redirectPath = redirectTarget.replace('Main.', '');
    throw new Error(`REDIRECT:${redirectPath}`);
  }
  
  // Step 1: Extract all reference links from the bottom
  const linkRefs: { [key: string]: string } = {};
  for (const line of lines) {
    const refMatch = line.match(/^\s*\[(\d+)\]:\s+(https?:\/\/[^\s]+)/);
    if (refMatch) {
      linkRefs[refMatch[1]] = refMatch[2];
    }
  }
  
  // Step 2: Parse the article structure
  let lineIndex = 0;
  let title = "";
  
  // Find first H1 title
  while (lineIndex < lines.length && !lines[lineIndex].match(/^#\s+(.+)$/)) {
    lineIndex++;
  }
  
  if (lineIndex >= lines.length) {
    throw new Error("Article format error: No H1 title found in the entire document");
  }
  
  title = lines[lineIndex].replace(/^#\s+/, '').trim();
  lineIndex++;
  
  // Check if title continues on next line (for multi-line titles)
  if (lineIndex < lines.length && lines[lineIndex].trim().startsWith('(') && lines[lineIndex].trim().endsWith(')')) {
    title += ' ' + lines[lineIndex].trim();
    lineIndex++;
  }
  
  // Skip navigation links
  while (lineIndex < lines.length && 
         (lines[lineIndex].includes('[Source]') || 
          lines[lineIndex].includes('[Home]') ||
          lines[lineIndex].includes('[Markdown]') ||
          lines[lineIndex].includes('[Talk]') ||
          lines[lineIndex].trim() === '')) {
    lineIndex++;
  }
  
  // Expect second H1 title (might be multi-line)
  if (!lines[lineIndex] || !lines[lineIndex].match(/^#\s+/)) {
    throw new Error(`Article format error: Expected second H1 title at line ${lineIndex + 1}, but found: "${lines[lineIndex] || 'EOF'}"`);
  }
  lineIndex++;
  
  // Skip title continuation if present
  if (lineIndex < lines.length && lines[lineIndex].trim().startsWith('(') && lines[lineIndex].trim().endsWith(')')) {
    lineIndex++;
  }
  
  // Skip empty lines
  while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
    lineIndex++;
  }
  
  // Expect ❦ symbol
  if (!lines[lineIndex] || lines[lineIndex].trim() !== '❦') {
    throw new Error(`Article format error: Expected ❦ symbol at line ${lineIndex + 1}, but found: "${lines[lineIndex] || 'EOF'}"`);
  }
  lineIndex++;
  
  // Skip empty lines
  while (lineIndex < lines.length && lines[lineIndex].trim() === '') {
    lineIndex++;
  }
  
  // Step 3: Extract paragraphs until we hit the end marker
  const paragraphs: string[] = [];
  let currentParagraph: string[] = [];
  let inCodeBlock = false;
  
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    
    // Check for end of article marker: [ ][number]
    if (line.match(/^\[\s*\]\[\d+\]$/)) {
      // Save any remaining paragraph
      if (currentParagraph.length > 0) {
        const paragraph = currentParagraph.join('\n');
        if (paragraph.trim()) {
          paragraphs.push(cleanParagraph(substituteLinks(paragraph, linkRefs)));
        }
      }
      break;
    }
    
    // Track code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      currentParagraph.push(line.trim());
      lineIndex++;
      continue;
    }
    
    // In code blocks, preserve everything
    if (inCodeBlock) {
      currentParagraph.push(line);
      lineIndex++;
      continue;
    }
    
    // Empty line indicates paragraph break
    if (line.trim() === '') {
      if (currentParagraph.length > 0) {
        const paragraph = currentParagraph.join('\n');
        if (paragraph.trim()) {
          paragraphs.push(cleanParagraph(substituteLinks(paragraph, linkRefs)));
        }
        currentParagraph = [];
      }
    } else {
      // Add line to current paragraph, preserving structure but trimming each line
      currentParagraph.push(line.trim());
    }
    
    lineIndex++;
  }
  
  // If we didn't find the end marker, something's wrong
  if (lineIndex >= lines.length && !lines[lineIndex - 1]?.match(/^\[\s*\]\[\d+\]$/)) {
    console.warn("Article format warning: No end marker [ ][number] found");
  }
  
  return { title, paragraphs };
}

function substituteLinks(text: string, linkRefs: { [key: string]: string }): string {
  // Replace [text][number] with [text](url)
  return text.replace(/\[([^\]]+)\]\[(\d+)\]/g, (match, linkText, refNum) => {
    const url = linkRefs[refNum];
    if (url) {
      return `[${linkText}](${url})`;
    }
    return match; // Keep original if no reference found
  });
}

function cleanParagraph(paragraph: string): string {
  return paragraph
    // Remove soft hyphens and other invisible characters
    .replace(/\u00AD/g, '') // soft hyphen
    .replace(/\u200B/g, '') // zero-width space
    .replace(/\u200C/g, '') // zero-width non-joiner
    .replace(/\u200D/g, '') // zero-width joiner
    .replace(/\uFEFF/g, '') // zero-width no-break space
    // Also remove the escaped version of soft hyphens in URLs
    .replace(/­/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(text: string): number {
  // Remove markdown formatting for accurate word count
  const plainText = text
    // Remove links: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bold: **text** -> text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    // Remove italic: *text* -> text (but not ** patterns)
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1');
    
  return plainText.trim().split(/\s+/).filter(word => word.length > 0).length;
}