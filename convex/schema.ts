import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// The schema defines your data model for the database.
// For more information, see https://docs.convex.dev/database/schema
export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  }).index("by_clerkId", ["clerkId"]),

  sequences: defineTable({
    content: v.string(),
    bookTitle: v.string(),
    sequenceTitle: v.string(),
    articleTitle: v.string(),
    articleUrl: v.string(),
    paragraphIndex: v.number(),
    wordCount: v.number(),
  })
    .index("by_book", ["bookTitle"])
    .index("by_random", ["wordCount"]), // For random selection with word count filtering

  rooms: defineTable({
    roomCode: v.string(),
    hostId: v.id("users"),
    hasActiveGame: v.optional(v.literal(true)),
    minWordCount: v.optional(v.number()),
    maxWordCount: v.optional(v.number()),
  }).index("by_roomCode", ["roomCode"]),

  games: defineTable({
    roomId: v.id("rooms"),
    status: v.union(v.literal("playing"), v.literal("finished")),
    selectedParagraphId: v.id("sequences"),
    startTime: v.number(),
  }).index("by_room", ["roomId"]),

  roomMembers: defineTable({
    userId: v.id("users"),
    roomId: v.id("rooms"),
    isReady: v.boolean(),
  })
    .index("by_room", ["roomId"])
    .index("by_user_and_room", ["userId", "roomId"]),

  players: defineTable({
    userId: v.id("users"),
    gameId: v.id("games"),
    wordsCompleted: v.number(),
    finishedAt: v.optional(v.number()),
    wpm: v.optional(v.number()),
  })
    .index("by_game", ["gameId"])
    .index("by_user_and_game", ["userId", "gameId"])
    .index("by_user", ["userId"]),

  scrapingProgress: defineTable({
    url: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    lastProcessedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  }).index("by_url", ["url"]),
});
