import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { insertParagraph } from "./dbHelpers";

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
    const urlsToProcess = pageLimit
      ? articleUrls.slice(0, pageLimit)
      : articleUrls;

    let successCount = 0;
    let errorCount = 0;
    let globalArticleOrder = 0;
    const sequenceArticleCounts = new Map<string, number>();
    const bookOrders = new Map<string, number>();
    let currentBookOrderCounter = 0;

    // Process each article
    for (const { url, bookTitle, sequenceTitle } of urlsToProcess) {
      // Track order of books
      if (!bookOrders.has(bookTitle)) {
        bookOrders.set(bookTitle, currentBookOrderCounter++);
      }
      const bookOrder = bookOrders.get(bookTitle)!;

      // Track order within sequence
      const sequenceKey = `${bookTitle}|${sequenceTitle}`;
      const sequenceOrder = (sequenceArticleCounts.get(sequenceKey) || 0) + 1;
      sequenceArticleCounts.set(sequenceKey, sequenceOrder);
      try {
        // Check if already processed
        const existingProgress = await ctx.runQuery(
          internal.scraping.getScrapingProgress,
          { url },
        );

        if (existingProgress?.status === "completed") {
          console.log(`Skipping already processed: ${url}`);
          globalArticleOrder++;
          continue;
        }
        
        globalArticleOrder++;

        // Mark as processing
        await ctx.runMutation(
          internal.scraping.updateScrapingProgress,
          {
            url,
            status: "processing",
          },
        );

        // Fetch the article content with redirect handling
        const { markdown: articleMarkdown, finalUrl } = await fetchArticleWithRedirect(url);

        // Extract article title and paragraphs
        const { title, paragraphs } = extractArticleContent(articleMarkdown);

        // Save paragraphs to database
        for (let i = 0; i < paragraphs.length; i++) {
          const paragraph = paragraphs[i];
          const wordCount = countWords(paragraph);

          // Save all paragraphs (filtering can be done later when selecting)
          await ctx.runMutation(internal.scraping.saveParagraph, {
            content: paragraph,
            bookTitle,
            sequenceTitle,
            articleTitle: title,
            articleUrl: finalUrl,
            indexInArticle: i,
            wordCount,
            articleOrder: globalArticleOrder,
            sequenceOrder,
            bookOrder,
          });
        }

        // Mark as completed
        await ctx.runMutation(
          internal.scraping.updateScrapingProgress,
          {
            url,
            status: "completed",
          },
        );

        successCount++;
        console.log(
          `Processed ${successCount}/${urlsToProcess.length}: ${title}`,
        );

        // Add a small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        errorCount++;
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";

        // Log detailed error information
        console.error(`\n❌ ERROR processing ${url}:`);
        console.error(`   Message: ${errorMessage}`);
        if (error instanceof Error && error.stack) {
          console.error(`   Stack: ${error.stack.split("\n")[0]}`);
        }

        await ctx.runMutation(
          internal.scraping.updateScrapingProgress,
          {
            url,
            status: "failed",
            errorMessage,
          },
        );
      }
    }

    console.log(
      `Scraping completed: ${successCount} success, ${errorCount} errors`,
    );
    return { successCount, errorCount, total: urlsToProcess.length };
  },
});

function extractArticleUrls(
  tocMarkdown: string,
): Array<{ url: string; bookTitle: string; sequenceTitle: string }> {
  const urls: Array<{ url: string; bookTitle: string; sequenceTitle: string }> =
    [];
  const lines = tocMarkdown.split("\n");

  // First, extract all reference links at the bottom
  const linkRefs: { [key: string]: string } = {};
  for (const line of lines) {
    const refMatch = line.match(
      /^\s*\[(\d+)\]:\s+(https:\/\/www\.readthesequences\.com\/[^\s]+)/,
    );
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

async function fetchArticleWithRedirect(url: string): Promise<{
  markdown: string;
  finalUrl: string;
}> {
  let articleResponse = await fetch(`${url}?action=markdown`);
  
  if (!articleResponse.ok) {
    throw new Error(`Failed to fetch article: ${url}`);
  }
  
  let articleMarkdown = await articleResponse.text();
  let finalUrl = url;
  
  // Check if this is a redirect
  const redirectMatch = articleMarkdown.match(
    /\(:redirect\s+([^\s]+)\s+quiet=1\s*:\)/,
  );
  
  if (redirectMatch) {
    // Extract the redirect target (e.g., "Main.Focus-Your-Uncertainty")
    const redirectTarget = redirectMatch[1];
    // Convert format: Main.Focus-Your-Uncertainty -> Focus-Your-Uncertainty
    const redirectPath = redirectTarget.replace("Main.", "");
    const redirectUrl = `https://www.readthesequences.com/${redirectPath}`;
    
    console.log(`   ↪️  Following redirect from ${url} to ${redirectUrl}`);
    
    // Fetch the redirect target
    articleResponse = await fetch(`${redirectUrl}?action=markdown`);
    
    if (!articleResponse.ok) {
      throw new Error(`Failed to fetch redirect target: ${redirectUrl}`);
    }
    
    articleMarkdown = await articleResponse.text();
    finalUrl = redirectUrl;
  }
  
  return { markdown: articleMarkdown, finalUrl };
}

function extractArticleContent(markdown: string): {
  title: string;
  paragraphs: string[];
} {
  const lines = markdown.split("\n");

  // Step 1: Extract all reference links from the bottom
  const linkRefs: { [key: string]: string } = {};
  for (const line of lines) {
    // Match both external URLs and internal anchors
    const refMatch = line.match(/^\s*\[(\d+)\]:\s+([#\w][\w:/.\-?=&#]*)/);
    if (refMatch) {
      // If it's an internal anchor, convert to full URL
      if (refMatch[2].startsWith('#')) {
        // For internal footnotes, we'll just remove them from typing
        // but keep them in display without a link
        linkRefs[refMatch[1]] = refMatch[2];
      } else {
        linkRefs[refMatch[1]] = refMatch[2];
      }
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
    throw new Error(
      "Article format error: No H1 title found in the entire document",
    );
  }

  title = lines[lineIndex].replace(/^#\s+/, "").trim();
  lineIndex++;

  // Check if title continues on next line (for multi-line titles)
  if (
    lineIndex < lines.length &&
    lines[lineIndex].trim().startsWith("(") &&
    lines[lineIndex].trim().endsWith(")")
  ) {
    title += " " + lines[lineIndex].trim();
    lineIndex++;
  }

  // Skip navigation links
  while (
    lineIndex < lines.length &&
    (lines[lineIndex].includes("[Source]") ||
      lines[lineIndex].includes("[Home]") ||
      lines[lineIndex].includes("[Markdown]") ||
      lines[lineIndex].includes("[Talk]") ||
      lines[lineIndex].trim() === "")
  ) {
    lineIndex++;
  }

  // Expect second H1 title (might be multi-line)
  if (!lines[lineIndex] || !lines[lineIndex].match(/^#\s+/)) {
    throw new Error(
      `Article format error: Expected second H1 title at line ${lineIndex + 1}, but found: "${lines[lineIndex] || "EOF"}"`,
    );
  }
  lineIndex++;

  // Skip title continuation if present
  if (
    lineIndex < lines.length &&
    lines[lineIndex].trim().startsWith("(") &&
    lines[lineIndex].trim().endsWith(")")
  ) {
    lineIndex++;
  }

  // Skip empty lines
  while (lineIndex < lines.length && lines[lineIndex].trim() === "") {
    lineIndex++;
  }

  // Expect ❦ symbol
  if (!lines[lineIndex] || lines[lineIndex].trim() !== "❦") {
    throw new Error(
      `Article format error: Expected ❦ symbol at line ${lineIndex + 1}, but found: "${lines[lineIndex] || "EOF"}"`,
    );
  }
  lineIndex++;

  // Skip empty lines
  while (lineIndex < lines.length && lines[lineIndex].trim() === "") {
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
        const paragraph = currentParagraph.join("\n");
        if (paragraph.trim()) {
          paragraphs.push(cleanParagraph(substituteLinks(paragraph, linkRefs)));
        }
      }
      break;
    }

    // Track code blocks
    if (line.startsWith("```")) {
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
    if (line.trim() === "") {
      if (currentParagraph.length > 0) {
        const paragraph = currentParagraph.join("\n");
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
  if (
    lineIndex >= lines.length &&
    !lines[lineIndex - 1]?.match(/^\[\s*\]\[\d+\]$/)
  ) {
    console.warn("Article format warning: No end marker [ ][number] found");
  }

  return { title, paragraphs };
}

function substituteLinks(
  text: string,
  linkRefs: { [key: string]: string },
): string {
  // First, replace [text][number] with [text](url) for regular links
  text = text.replace(/\[([^\]]+)\]\[(\d+)\]/g, (_match, linkText, refNum) => {
    const url = linkRefs[refNum];
    if (url && !url.startsWith('#')) {
      return `[${linkText}](${url})`;
    }
    // For internal anchors or missing refs, just return the text without the reference
    return linkText;
  });
  
  // Then, handle standalone [number] footnotes
  text = text.replace(/\[(\d+)\]/g, (match, refNum) => {
    const url = linkRefs[refNum];
    if (url && !url.startsWith('#')) {
      // External URL - create a link
      return `[${refNum}](${url})`;
    }
    // For internal anchors, just keep the footnote marker without a link
    // It will be removed from typing but shown in display
    return match;
  });
  
  return text;
}

function cleanParagraph(paragraph: string): string {
  return (
    paragraph
      // Remove soft hyphens and other invisible characters
      .replace(/\u00AD/g, "") // soft hyphen
      .replace(/\u200B/g, "") // zero-width space
      .replace(/\u200C/g, "") // zero-width non-joiner
      .replace(/\u200D/g, "") // zero-width joiner
      .replace(/\uFEFF/g, "") // zero-width no-break space
      // Also remove the escaped version of soft hyphens in URLs
      .replace(/­/g, "")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

function countWords(text: string): number {
  // Remove markdown formatting for accurate word count
  const plainText = text
    // Remove links: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove footnote references: [1], [2], etc.
    .replace(/\[\d+\]/g, "")
    // Remove bold: **text** -> text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // Remove italic: *text* -> text (but not ** patterns)
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1");

  return plainText
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
}

// Internal queries
export const getScrapingProgress = internalQuery({
  args: {
    url: v.string(),
  },
  handler: async (ctx, { url }) => {
    return await ctx.db
      .query("scrapingProgress")
      .withIndex("by_url", (q) => q.eq("url", url))
      .unique();
  },
});

// Internal mutations
export const saveParagraph = internalMutation({
  args: {
    content: v.string(),
    bookTitle: v.string(),
    sequenceTitle: v.string(),
    articleTitle: v.string(),
    articleUrl: v.string(),
    indexInArticle: v.number(),
    wordCount: v.number(),
    articleOrder: v.number(),
    sequenceOrder: v.number(),
    bookOrder: v.number(),
  },
  handler: async (ctx, args) => {
    await insertParagraph(ctx, args);
  },
});

// Mutation to update existing paragraph or create new one
export const updateOrCreateParagraph = internalMutation({
  args: {
    existingId: v.optional(v.id("paragraphs")),
    content: v.string(),
    bookTitle: v.string(),
    sequenceTitle: v.string(),
    articleTitle: v.string(),
    articleUrl: v.string(),
    indexInArticle: v.number(),
    wordCount: v.number(),
    articleOrder: v.number(),
    sequenceOrder: v.number(),
    bookOrder: v.number(),
  },
  handler: async (ctx, { existingId, ...data }) => {
    if (existingId) {
      await ctx.db.replace(existingId, data);
    } else {
      await insertParagraph(ctx, data);
    }
  },
});

// Mutation to delete a paragraph
export const deleteParagraph = internalMutation({
  args: {
    id: v.id("paragraphs"),
  },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const updateScrapingProgress = internalMutation({
  args: {
    url: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, { url, status, errorMessage }) => {
    const existing = await ctx.db
      .query("scrapingProgress")
      .withIndex("by_url", (q) => q.eq("url", url))
      .unique();

    const data = {
      url,
      status,
      lastProcessedAt: Date.now(),
      errorMessage,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("scrapingProgress", data);
    }
  },
});

// Public mutation to rescrape a specific article
export const rescrapeArticle = internalMutation({
  args: {
    articleTitle: v.string(),
  },
  handler: async (ctx, { articleTitle }) => {
    // Find existing paragraphs from this article
    const existingParagraphs = await ctx.db
      .query("paragraphs")
      .withIndex("by_article", (q) => q.eq("articleTitle", articleTitle))
      .collect();
    
    if (existingParagraphs.length === 0) {
      throw new ConvexError(`Article "${articleTitle}" not found`);
    }
    
    // Get the article URL and order info from the first paragraph
    const articleUrl = existingParagraphs[0].articleUrl;
    const bookTitle = existingParagraphs[0].bookTitle;
    const sequenceTitle = existingParagraphs[0].sequenceTitle;
    const articleOrder = existingParagraphs[0].articleOrder;
    const sequenceOrder = existingParagraphs[0].sequenceOrder;
    const bookOrder = existingParagraphs[0].bookOrder;
    
    // Reset scraping progress for this URL
    const progress = await ctx.db
      .query("scrapingProgress")
      .withIndex("by_url", (q) => q.eq("url", articleUrl))
      .unique();
    
    if (progress) {
      await ctx.db.patch(progress._id, { status: "pending" });
    }
    
    // Store existing paragraph IDs by index for reuse
    const existingIdsByIndex = Object.fromEntries(
      existingParagraphs.map(p => [p.indexInArticle, p._id])
    );
    
    console.log(`Found ${existingParagraphs.length} existing paragraphs from "${articleTitle}"`);
    
    // Trigger rescraping by calling the action
    await ctx.scheduler.runAfter(0, internal.scraping.rescrapeArticleAction, {
      url: articleUrl,
      bookTitle,
      sequenceTitle,
      existingIdsByIndex,
      articleOrder,
      sequenceOrder,
      bookOrder,
    });
    
    return { 
      message: `Rescraping "${articleTitle}" scheduled`, 
      deletedCount: existingParagraphs.length 
    };
  },
});

// Internal action to rescrape a single article
export const rescrapeArticleAction = internalAction({
  args: {
    url: v.string(),
    bookTitle: v.string(),
    sequenceTitle: v.string(),
    existingIdsByIndex: v.optional(v.record(v.string(), v.id("paragraphs"))),
    articleOrder: v.number(),
    sequenceOrder: v.number(),
    bookOrder: v.number(),
  },
  handler: async (ctx, { url, bookTitle, sequenceTitle, existingIdsByIndex, articleOrder, sequenceOrder, bookOrder }) => {
    console.log(`Rescraping article: ${url}`);
    
    try {
      // Mark as processing
      await ctx.runMutation(internal.scraping.updateScrapingProgress, {
        url,
        status: "processing",
      });
      
      // Fetch the article content with redirect handling
      const { markdown: articleMarkdown, finalUrl } = await fetchArticleWithRedirect(url);
      
      // Extract article title and paragraphs
      const { title, paragraphs } = extractArticleContent(articleMarkdown);
      
      // Track which existing paragraphs were updated
      const processedIndices = new Set<number>();
      
      // Save paragraphs to database
      for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        const wordCount = countWords(paragraph);
        
        // Check if we have an existing ID for this index
        const existingId = existingIdsByIndex?.[String(i)];
        
        await ctx.runMutation(internal.scraping.updateOrCreateParagraph, {
          existingId,
          content: paragraph,
          bookTitle,
          sequenceTitle,
          articleTitle: title,
          articleUrl: finalUrl,
          indexInArticle: i,
          wordCount,
          articleOrder,
          sequenceOrder,
          bookOrder,
        });
        
        processedIndices.add(i);
      }
      
      // Delete any existing paragraphs that weren't updated (e.g., if article got shorter)
      if (existingIdsByIndex) {
        for (const [index, id] of Object.entries(existingIdsByIndex)) {
          if (!processedIndices.has(Number(index))) {
            await ctx.runMutation(internal.scraping.deleteParagraph, {
              id,
            });
          }
        }
      }
      
      // Mark as completed
      await ctx.runMutation(internal.scraping.updateScrapingProgress, {
        url,
        status: "completed",
      });
      
      console.log(`Successfully rescraped "${title}" with ${paragraphs.length} paragraphs`);
      return { success: true, paragraphCount: paragraphs.length };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error(`Failed to rescrape ${url}: ${errorMessage}`);
      
      await ctx.runMutation(internal.scraping.updateScrapingProgress, {
        url,
        status: "failed",
        errorMessage,
      });
      
      throw error;
    }
  },
});
