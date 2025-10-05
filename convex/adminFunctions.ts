import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { paragraphsByWordCount } from "./aggregates";
import { internal } from "./_generated/api";

export const cleanDatabase = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Delete all test data
    const rooms = await ctx.db.query("rooms").collect();
    for (const room of rooms) {
      await ctx.db.delete(room._id);
    }

    const games = await ctx.db.query("games").collect();
    for (const game of games) {
      await ctx.db.delete(game._id);
    }

    const players = await ctx.db.query("players").collect();
    for (const player of players) {
      await ctx.db.delete(player._id);
    }

    const roomMembers = await ctx.db.query("roomMembers").collect();
    for (const member of roomMembers) {
      await ctx.db.delete(member._id);
    }

    const completions = await ctx.db.query("completions").collect();
    for (const completion of completions) {
      await ctx.db.delete(completion._id);
    }

    // Delete test paragraphs
    const testParagraphs = await ctx.db.query("paragraphs").collect();
    for (const para of testParagraphs) {
      if (
        para.bookTitle === "Test Book" ||
        para.bookTitle === "Test Book - Rationality"
      ) {
        await ctx.db.delete(para._id);
      }
    }

    // Reset scraping progress
    const scrapingProgress = await ctx.db.query("scrapingProgress").collect();
    for (const progress of scrapingProgress) {
      await ctx.db.delete(progress._id);
    }

    // Clear aggregates
    await paragraphsByWordCount.clear(ctx, { namespace: undefined });

    return {
      message: "Database cleaned",
      deleted: {
        rooms: rooms.length,
        games: games.length,
        players: players.length,
        roomMembers: roomMembers.length,
        completions: completions.length,
        testParagraphs: testParagraphs.filter(
          (p) =>
            p.bookTitle === "Test Book" ||
            p.bookTitle === "Test Book - Rationality"
        ).length,
        scrapingProgress: scrapingProgress.length,
      },
    };
  },
});

export const triggerRescrape = internalMutation({
  args: { pageLimit: v.optional(v.number()) },
  handler: async (ctx, { pageLimit }) => {
    // Schedule the scraping action (now uses batch processing)
    await ctx.scheduler.runAfter(
      0,
      internal.scraping.initializeScraping,
      pageLimit ? { pageLimit } : {}
    );

    return { message: "Batch scraping scheduled - will process in chunks of 20 articles" };
  },
});

export const getDatabaseStats = internalQuery({
  args: {},
  handler: async (ctx) => {
    const paragraphs = await ctx.db.query("paragraphs").collect();
    const scrapingProgress = await ctx.db.query("scrapingProgress").collect();

    const statusCounts = scrapingProgress.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      paragraphCount: paragraphs.length,
      scrapingProgressCount: scrapingProgress.length,
      statusCounts,
    };
  },
});

export const migrateArticlesMetadata = internalMutation({
  args: {},
  handler: async (ctx) => {
    console.log("Starting articles metadata migration...");

    // Clear existing articles
    const existingArticles = await ctx.db.query("articles").collect();
    for (const article of existingArticles) {
      await ctx.db.delete(article._id);
    }

    // Group paragraphs by article
    const articleMap = new Map<string, {
      bookTitle: string;
      bookOrder: number;
      sequenceTitle: string;
      sequenceOrder: number;
      articleTitle: string;
      articleUrl: string;
      articleOrder: number;
      paragraphCount: number;
    }>();

    let processedCount = 0;
    for await (const para of ctx.db.query("paragraphs").order("asc")) {
      const key = para.articleTitle;

      if (!articleMap.has(key)) {
        articleMap.set(key, {
          bookTitle: para.bookTitle,
          bookOrder: para.bookOrder,
          sequenceTitle: para.sequenceTitle,
          sequenceOrder: para.sequenceOrder,
          articleTitle: para.articleTitle,
          articleUrl: para.articleUrl,
          articleOrder: para.articleOrder,
          paragraphCount: 0,
        });
      }

      const article = articleMap.get(key)!;
      article.paragraphCount++;
      processedCount++;

      if (processedCount % 1000 === 0) {
        console.log(`Processed ${processedCount} paragraphs...`);
      }
    }

    // Insert all articles
    let insertedCount = 0;
    for (const article of articleMap.values()) {
      await ctx.db.insert("articles", article);
      insertedCount++;
    }

    console.log(`Migration complete: ${insertedCount} articles created from ${processedCount} paragraphs`);

    return {
      paragraphsProcessed: processedCount,
      articlesCreated: insertedCount,
    };
  },
});
