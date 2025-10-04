import { internalMutation } from "./_generated/server";

export const clearAllParagraphs = internalMutation({
  args: {},
  handler: async (ctx) => {
    const paragraphs = await ctx.db.query("paragraphs").take(1000);
    for (const p of paragraphs) {
      await ctx.db.delete(p._id);
    }
    return { deleted: paragraphs.length, hasMore: paragraphs.length === 1000 };
  },
});

export const clearAllCompletions = internalMutation({
  args: {},
  handler: async (ctx) => {
    const completions = await ctx.db.query("completions").take(1000);
    for (const c of completions) {
      await ctx.db.delete(c._id);
    }
    return { deleted: completions.length };
  },
});

export const clearScrapingProgress = internalMutation({
  args: {},
  handler: async (ctx) => {
    const progress = await ctx.db.query("scrapingProgress").take(1000);
    for (const p of progress) {
      await ctx.db.delete(p._id);
    }
    return { deleted: progress.length };
  },
});
