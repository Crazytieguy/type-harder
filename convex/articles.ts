import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

// Get books with sequences and articles hierarchy (cacheable - no user data)
export const getBooksHierarchy = query({
  args: {},
  handler: async (ctx) => {
    const allArticles = await ctx.db
      .query("articles")
      .withIndex("by_book_sequence")
      .collect();

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
        };
      }).sort((a, b) => a.sequenceOrder - b.sequenceOrder),
    })).sort((a, b) => a.bookOrder - b.bookOrder);

    const totalParagraphs = allArticles.reduce((sum, a) => sum + a.paragraphCount, 0);

    return {
      books,
      totalParagraphs,
    };
  },
});

// Get user's completion counts per article (separate for caching)
export const getUserArticleCompletions = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { completionsByArticle: {}, totalCompleted: 0 };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return { completionsByArticle: {}, totalCompleted: 0 };
    }

    const userArticleCompletions = await ctx.db
      .query("articleCompletions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const completionsByArticle: Record<string, number> = {};
    let totalCompleted = 0;

    for (const articleCompletion of userArticleCompletions) {
      completionsByArticle[articleCompletion.articleTitle] = articleCompletion.completedCount;
      totalCompleted += articleCompletion.completedCount;
    }

    return { completionsByArticle, totalCompleted };
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
          .withIndex("by_user_and_article", (q) =>
            q.eq("userId", user._id).eq("articleTitle", articleTitle)
          )
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

    // O(327 max) - load all article completions for user
    const userArticleCompletions = await ctx.db
      .query("articleCompletions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const articleCompletionMap = new Map(
      userArticleCompletions.map(ac => [ac.articleTitle, ac.completedCount])
    );

    // O(327 max with early return) - find first incomplete article
    const articlesQuery = ctx.db
      .query("articles")
      .withIndex("by_book_sequence")
      .order("asc");

    for await (const article of articlesQuery) {
      const completedCount = articleCompletionMap.get(article.articleTitle) || 0;

      if (completedCount < article.paragraphCount) {
        // Found incomplete article! Now find specific paragraph
        const paragraphs = await ctx.db
          .query("paragraphs")
          .withIndex("by_article", (q) => q.eq("articleTitle", article.articleTitle))
          .order("asc")
          .collect();

        // Get user's completions for this article
        const completionsInArticle = await ctx.db
          .query("completions")
          .withIndex("by_user_and_article", (q) =>
            q.eq("userId", user._id).eq("articleTitle", article.articleTitle)
          )
          .collect();

        const completedParagraphIds = new Set(
          completionsInArticle.map(c => c.paragraphId)
        );

        // Find first uncompleted paragraph
        for (const paragraph of paragraphs) {
          if (!completedParagraphIds.has(paragraph._id)) {
            return { paragraphId: paragraph._id, paragraph };
          }
        }
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