import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const saveParagraph = internalMutation({
  args: {
    content: v.string(),
    bookTitle: v.string(),
    sequenceTitle: v.string(),
    articleTitle: v.string(),
    articleUrl: v.string(),
    paragraphIndex: v.number(),
    wordCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("sequences", args);
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
