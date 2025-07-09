import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

export const getScrapingProgress = internalQuery({
  args: {
    url: v.string(),
  },
  handler: async (ctx, { url }) => {
    return await ctx.db
      .query("scrapingProgress")
      .withIndex("by_url", q => q.eq("url", url))
      .unique();
  },
});