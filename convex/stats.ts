import { query } from "./_generated/server";
import { ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { playerStatsByUser } from "./aggregates";

// Get aggregate stats using the player stats aggregate
export const getUserStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError("User not found");
    }

    // Use aggregate to get total count efficiently
    const totalRaces = await playerStatsByUser.count(ctx, {
      namespace: undefined,
      bounds: {
        lower: { key: user._id, inclusive: true },
        upper: { key: user._id, inclusive: true },
      },
    });

    if (totalRaces === 0) {
      return {
        user: {
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
        stats: {
          totalRaces: 0,
          averageWpm: 0,
          bestWpm: 0,
        },
      };
    }

    // Get finished races for stats calculation
    const finishedRaces = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.neq(q.field("finishedAt"), undefined))
      .collect();

    const totalWpm = finishedRaces.reduce((sum, p) => sum + (p.wpm || 0), 0);
    const averageWpm = finishedRaces.length > 0 ? Math.round(totalWpm / finishedRaces.length) : 0;
    const bestWpm = finishedRaces.length > 0 ? Math.max(...finishedRaces.map((p) => p.wpm || 0)) : 0;

    return {
      user: {
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      stats: {
        totalRaces: finishedRaces.length,
        averageWpm,
        bestWpm,
      },
    };
  },
});

// Paginated query for recent races
export const getUserRecentRaces = query({
  args: { 
    paginationOpts: paginationOptsValidator 
  },
  handler: async (ctx, { paginationOpts }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError("User not found");
    }

    // Get paginated player records, sorted by finish time
    const results = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.neq(q.field("finishedAt"), undefined))
      .order("desc")
      .paginate(paginationOpts);

    // Transform the page data with game details
    const enrichedPage = await Promise.all(
      results.page.map(async (player) => {
        const game = await ctx.db.get(player.gameId);
        if (!game) return null;

        const paragraph = await ctx.db.get(game.selectedParagraphId);
        if (!paragraph) return null;

        // Get all players in this game to determine rank
        const allGamePlayers = await ctx.db
          .query("players")
          .withIndex("by_game", (q) => q.eq("gameId", game._id))
          .collect();

        const finishedPlayers = allGamePlayers
          .filter((p) => p.finishedAt)
          .sort((a, b) => (a.finishedAt || 0) - (b.finishedAt || 0));

        const rank = finishedPlayers.findIndex((p) => p._id === player._id) + 1;

        return {
          wpm: player.wpm || 0,
          finishedAt: player.finishedAt || 0,
          rank,
          totalPlayers: allGamePlayers.length,
          wordCount: paragraph.wordCount,
          articleTitle: paragraph.articleTitle,
          articleUrl: paragraph.articleUrl,
          paragraphContent: paragraph.content,
          sequenceTitle: paragraph.sequenceTitle,
          bookTitle: paragraph.bookTitle,
        };
      })
    );

    return {
      ...results,
      page: enrichedPage.filter((r) => r !== null),
    };
  },
});