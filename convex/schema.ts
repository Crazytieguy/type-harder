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

  gameRooms: defineTable({
    roomCode: v.string(),
    hostId: v.id("users"),
    status: v.union(v.literal("waiting"), v.literal("playing"), v.literal("finished")),
    selectedParagraphId: v.optional(v.id("sequences")),
    startTime: v.optional(v.number()),
  }).index("by_roomCode", ["roomCode"]),

  players: defineTable({
    userId: v.id("users"),
    gameRoomId: v.id("gameRooms"),
    wordsCompleted: v.number(),
    finishedAt: v.optional(v.number()),
    isReady: v.boolean(),
  })
    .index("by_gameRoom", ["gameRoomId"])
    .index("by_user_and_room", ["userId", "gameRoomId"]),

  scrapingProgress: defineTable({
    url: v.string(),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
    lastProcessedAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
  }).index("by_url", ["url"]),
});
