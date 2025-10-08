import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

// Get books with sequences and articles hierarchy (optimized - uses articles metadata table)
export const getBooksHierarchy = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    const allArticles = await ctx.db
      .query("articles")
      .withIndex("by_book_sequence")
      .collect();

    // Count completions per article for this user
    const completionCountsByArticle = new Map<string, number>();
    let totalCompletedParagraphs = 0;

    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (user) {
        const userCompletions = await ctx.db
          .query("completions")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

        const paragraphs = await Promise.all(
          userCompletions.map(c => ctx.db.get(c.paragraphId))
        );

        for (const paragraph of paragraphs) {
          if (paragraph) {
            const count = completionCountsByArticle.get(paragraph.articleTitle) || 0;
            completionCountsByArticle.set(paragraph.articleTitle, count + 1);
            totalCompletedParagraphs++;
          }
        }
      }
    }

    // Build hierarchy from articles metadata
    const bookMap = new Map<string, {
      bookTitle: string;
      bookOrder: number;
      sequences: Map<string, {
        sequenceTitle: string;
        sequenceOrder: number;
        articles: Array<{
          articleTitle: string;
          articleUrl: string;
          articleOrder: number;
          paragraphCount: number;
          completedCount: number;
        }>;
      }>;
    }>();

    for (const article of allArticles) {
      if (!bookMap.has(article.bookTitle)) {
        bookMap.set(article.bookTitle, {
          bookTitle: article.bookTitle,
          bookOrder: article.bookOrder,
          sequences: new Map(),
        });
      }

      const book = bookMap.get(article.bookTitle)!;
      if (!book.sequences.has(article.sequenceTitle)) {
        book.sequences.set(article.sequenceTitle, {
          sequenceTitle: article.sequenceTitle,
          sequenceOrder: article.sequenceOrder,
          articles: [],
        });
      }

      const sequence = book.sequences.get(article.sequenceTitle)!;
      sequence.articles.push({
        articleTitle: article.articleTitle,
        articleUrl: article.articleUrl,
        articleOrder: article.articleOrder,
        paragraphCount: article.paragraphCount,
        completedCount: completionCountsByArticle.get(article.articleTitle) || 0,
      });
    }

    const books = Array.from(bookMap.values()).map(book => ({
      bookTitle: book.bookTitle,
      bookOrder: book.bookOrder,
      sequences: Array.from(book.sequences.values()).map(seq => {
        const sortedArticles = seq.articles.sort((a, b) => a.articleOrder - b.articleOrder);
        return {
          sequenceTitle: seq.sequenceTitle,
          sequenceOrder: seq.sequenceOrder,
          articles: sortedArticles,
          totalParagraphs: sortedArticles.reduce((sum, a) => sum + a.paragraphCount, 0),
          completedParagraphs: sortedArticles.reduce((sum, a) => sum + a.completedCount, 0),
        };
      }).sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    })).sort((a, b) => a.bookOrder - b.bookOrder);

    const totalParagraphs = allArticles.reduce((sum, a) => sum + a.paragraphCount, 0);

    return {
      books,
      totalParagraphs,
      completedParagraphs: totalCompletedParagraphs,
    };
  },
});

// Get paragraphs for a specific article with completion status
export const getArticleParagraphs = query({
  args: {
    articleTitle: v.string(),
  },
  handler: async (ctx, { articleTitle }) => {
    const identity = await ctx.auth.getUserIdentity();
    
    // Get all paragraphs for this article
    const paragraphs = await ctx.db
      .query("paragraphs")
      .withIndex("by_article", (q) => q.eq("articleTitle", articleTitle))
      .collect();

    if (paragraphs.length === 0) {
      return { paragraphs: [], articleInfo: null };
    }

    // Get user's completed paragraphs if authenticated
    const completedIds = new Set<Id<"paragraphs">>();
    if (identity) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
        .unique();

      if (user) {
        const userCompletions = await ctx.db
          .query("completions")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .collect();

        userCompletions.forEach(c => completedIds.add(c.paragraphId));
      }
    }

    // Sort paragraphs and add completion status
    const sortedParagraphs = paragraphs
      .sort((a, b) => a.indexInArticle - b.indexInArticle)
      .map(p => ({
        _id: p._id,
        indexInArticle: p.indexInArticle,
        wordCount: p.wordCount,
        content: p.content,
        completed: completedIds.has(p._id),
      }));

    const firstParagraph = paragraphs[0];
    return {
      paragraphs: sortedParagraphs,
      articleInfo: {
        bookTitle: firstParagraph.bookTitle,
        sequenceTitle: firstParagraph.sequenceTitle,
        articleTitle: firstParagraph.articleTitle,
        articleUrl: firstParagraph.articleUrl,
      },
    };
  },
});

// Get the next uncompleted paragraph across all content
export const getNextUncompletedParagraph = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      // If not authenticated, just return the first paragraph
      const firstParagraph = await ctx.db
        .query("paragraphs")
        .order("asc")
        .first();
      return firstParagraph ? { paragraphId: firstParagraph._id, paragraph: firstParagraph } : null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      const firstParagraph = await ctx.db
        .query("paragraphs")
        .order("asc")
        .first();
      return firstParagraph ? { paragraphId: firstParagraph._id, paragraph: firstParagraph } : null;
    }

    // Get user's completions from completions table
    const userCompletions = await ctx.db
      .query("completions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const completedParagraphIds = new Set<Id<"paragraphs">>(
      userCompletions.map(c => c.paragraphId)
    );

    // Use indexed query to iterate through paragraphs in global order
    // This avoids loading all paragraphs into memory
    const paragraphsQuery = ctx.db
      .query("paragraphs")
      .withIndex("by_global_order")
      .order("asc");

    for await (const seq of paragraphsQuery) {
      if (!completedParagraphIds.has(seq._id)) {
        return { paragraphId: seq._id, paragraph: seq };
      }
    }

    // All paragraphs completed!
    return null;
  },
});

// Get a specific paragraph by ID
export const getParagraphById = query({
  args: {
    paragraphId: v.id("paragraphs"),
  },
  handler: async (ctx, { paragraphId }) => {
    return await ctx.db.get(paragraphId);
  },
});