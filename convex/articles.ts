import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";

// Get all articles with user's completion stats
export const getArticles = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { articles: [], userCompletedCount: 0 };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return { articles: [], userCompletedCount: 0 };
    }

    // Get all sequences
    const allSequences = await ctx.db.query("paragraphs").collect();

    // Get user's completed paragraphs
    const userPlayers = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.neq(q.field("finishedAt"), undefined))
      .collect();

    const completedParagraphIds = new Set<Id<"paragraphs">>();
    for (const player of userPlayers) {
      const game = await ctx.db.get(player.gameId);
      if (game) {
        completedParagraphIds.add(game.selectedParagraphId);
      }
    }

    // Group sequences by article
    const articleMap = new Map<string, {
      bookTitle: string;
      sequenceTitle: string;
      articleTitle: string;
      articleUrl: string;
      articleOrder: number;
      sequenceOrder: number;
      paragraphs: Array<{
        _id: Id<"paragraphs">;
        indexInArticle: number;
        wordCount: number;
        completed: boolean;
      }>;
    }>();

    for (const seq of allSequences) {
      if (!articleMap.has(seq.articleTitle)) {
        articleMap.set(seq.articleTitle, {
          bookTitle: seq.bookTitle,
          sequenceTitle: seq.sequenceTitle,
          articleTitle: seq.articleTitle,
          articleUrl: seq.articleUrl,
          articleOrder: seq.articleOrder,
          sequenceOrder: seq.sequenceOrder,
          paragraphs: [],
        });
      }

      articleMap.get(seq.articleTitle)!.paragraphs.push({
        _id: seq._id,
        indexInArticle: seq.indexInArticle,
        wordCount: seq.wordCount,
        completed: completedParagraphIds.has(seq._id),
      });
    }

    // Convert to array and calculate stats
    const articles = Array.from(articleMap.values()).map(article => {
      const sortedParagraphs = article.paragraphs.sort((a, b) => a.indexInArticle - b.indexInArticle);
      const completedCount = sortedParagraphs.filter(p => p.completed).length;
      
      return {
        ...article,
        paragraphs: sortedParagraphs,
        totalParagraphs: sortedParagraphs.length,
        completedParagraphs: completedCount,
        percentComplete: Math.round((completedCount / sortedParagraphs.length) * 100),
      };
    });

    // Sort articles by original readthesequences.com order
    articles.sort((a, b) => a.articleOrder - b.articleOrder);

    return {
      articles,
      userCompletedCount: completedParagraphIds.size,
      totalParagraphs: allSequences.length,
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
        const userPlayers = await ctx.db
          .query("players")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .filter((q) => q.neq(q.field("finishedAt"), undefined))
          .collect();

        for (const player of userPlayers) {
          const game = await ctx.db.get(player.gameId);
          if (game) {
            completedIds.add(game.selectedParagraphId);
          }
        }
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

    // Get user's completed paragraphs
    const userPlayers = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.neq(q.field("finishedAt"), undefined))
      .collect();

    const completedParagraphIds = new Set<Id<"paragraphs">>();
    for (const player of userPlayers) {
      const game = await ctx.db.get(player.gameId);
      if (game) {
        completedParagraphIds.add(game.selectedParagraphId);
      }
    }

    // Get all sequences and find the first uncompleted one
    const allSequences = await ctx.db.query("paragraphs").collect();
    
    // Sort by original readthesequences.com order
    allSequences.sort((a, b) => {
      if (a.articleOrder !== b.articleOrder) return a.articleOrder - b.articleOrder;
      return a.indexInArticle - b.indexInArticle;
    });

    // Find first uncompleted paragraph
    for (const seq of allSequences) {
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