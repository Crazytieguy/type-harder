import { query } from "./_generated/server";
import { ConvexError } from "convex/values";

export const getUserStats = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError("User not found");
    }

    // Get all player records for this user
    const playerRecords = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Filter to only finished races
    const finishedRaces = playerRecords.filter((p) => p.finishedAt && p.wpm);

    if (finishedRaces.length === 0) {
      return {
        user: {
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
        stats: {
          totalRaces: 0,
          averageWpm: 0,
          bestWpm: 0,
          recentRaces: [],
        },
      };
    }

    // Calculate stats
    const totalRaces = finishedRaces.length;
    const totalWpm = finishedRaces.reduce((sum, p) => sum + (p.wpm || 0), 0);
    const averageWpm = Math.round(totalWpm / totalRaces);
    const bestWpm = Math.max(...finishedRaces.map((p) => p.wpm || 0));

    // Get recent races with game details
    const recentRaces = await Promise.all(
      finishedRaces
        .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
        .slice(0, 10)
        .map(async (player) => {
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

          const rank =
            finishedPlayers.findIndex((p) => p._id === player._id) + 1;

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
        }),
    );

    return {
      user: {
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      stats: {
        totalRaces,
        averageWpm,
        bestWpm,
        recentRaces: recentRaces.filter((r) => r !== null),
      },
    };
  },
});