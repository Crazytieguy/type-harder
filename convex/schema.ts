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

  paragraphs: defineTable({
    content: v.string(),
    bookTitle: v.string(),
    sequenceTitle: v.string(),
    articleTitle: v.string(),
    articleUrl: v.string(),
    indexInArticle: v.number(), // Paragraph index within the article (0-based)
    wordCount: v.number(),
    articleOrder: v.number(), // Global article order from readthesequences.com
    sequenceOrder: v.number(), // Order of article within its sequence
    bookOrder: v.number(), // Order of book (0 for Mere Reality, 1 for Map and Territory, etc.)
  })
    .index("by_article", ["articleTitle", "indexInArticle"]) // For article queries
    .index("by_word_count", ["wordCount"]) // For random selection with filtering
    .index("by_global_order", ["articleOrder", "indexInArticle"]) // For sequential progression
    .index("by_book", ["bookOrder", "sequenceOrder", "articleOrder"]) // For book/sequence navigation
    .index("by_sequence", ["bookTitle", "sequenceTitle", "articleOrder"]), // For sequence browsing

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
    selectedParagraphId: v.id("paragraphs"),
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
    bookTitle: v.optional(v.string()),
    sequenceTitle: v.optional(v.string()),
    articleOrder: v.optional(v.number()),
    sequenceOrder: v.optional(v.number()),
    bookOrder: v.optional(v.number()),
  })
    .index("by_url", ["url"])
    .index("by_status", ["status"]),

  completions: defineTable({
    userId: v.id("users"),
    paragraphId: v.id("paragraphs"),
    completedAt: v.number(),
  })
    .index("by_user_and_paragraph", ["userId", "paragraphId"])
    .index("by_user", ["userId"]),
});
