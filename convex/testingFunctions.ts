import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const testingMutation = customMutation(mutation, {
  args: {},
  input: async (_ctx, _args) => {
    if (process.env.IS_TEST !== "true") {
      throw new Error("Calling a test-only function in non-test environment");
    }
    return { ctx: {}, args: {} };
  },
});

const testingQuery = customQuery(query, {
  args: {},
  input: async (_ctx, _args) => {
    if (process.env.IS_TEST !== "true") {
      throw new Error("Calling a test-only function in non-test environment");
    }
    return { ctx: {}, args: {} };
  },
});

export const TEST_PARAGRAPH_UNICODE = "The question isn\u2019t whether we can\u2014it\u2019s whether we should. Here\u2019s the thing: \u201Creality\u201D doesn\u2019t care about our theories.";

export const TEST_PARAGRAPH_ELLIPSIS = "Wait\u2026 what if we\u2019re wrong? The evidence suggests\u2026 well, it\u2019s complicated.";

export const TEST_PARAGRAPH_ENDASH = "The range 1\u201310 includes everything. From 2010\u20132025, much changed.";

export const TEST_PARAGRAPH_MINUS = "The equation is 10\u22125 = 5. Negative numbers use the minus sign: \u22123.";

export const TEST_PARAGRAPH_MULTIPLY = "The formula is P(H|E) \u00d7 P(E) for probability calculations.";

export const TEST_PARAGRAPH_LOGICAL_NOT = "In logic, \u00acA means NOT A. If \u00acB then something else.";

export const TEST_PARAGRAPH_DOUBLE_ARROW = "If A is true, then A \u21d2 B implies B. Also C \u21d2 D.";

export const TEST_PARAGRAPH_UMLAUT = "The philosopher G\u00f6del proved important theorems. Schr\u00f6dinger studied quantum mechanics.";

export const TEST_PARAGRAPH_MAPS_TO = "The function maps x \u21a6 y for each element. Also a \u21a6 b.";

export const ensureUnicodeParagraph = testingMutation(async (ctx) => {
  const existing = await ctx.db
    .query("paragraphs")
    .filter((q) => q.eq(q.field("content"), TEST_PARAGRAPH_UNICODE))
    .first();

  const wordCount = TEST_PARAGRAPH_UNICODE.split(/\s+/).length;

  if (existing) {
    if (existing.wordCount !== wordCount) {
      await ctx.db.patch(existing._id, { wordCount });
    }
    return existing._id;
  }

  const paragraphId = await ctx.db.insert("paragraphs", {
    content: TEST_PARAGRAPH_UNICODE,
    bookTitle: "Test Book",
    sequenceTitle: "Test Sequence",
    articleTitle: "Test Article - Unicode Characters",
    articleUrl: "https://example.com/test-unicode",
    indexInArticle: 0,
    wordCount,
    articleOrder: 99999,
    sequenceOrder: 99999,
  });

  return paragraphId;
});

export const getUnicodeParagraph = testingQuery(async (ctx) => {
  const paragraph = await ctx.db
    .query("paragraphs")
    .filter((q) => q.eq(q.field("content"), TEST_PARAGRAPH_UNICODE))
    .first();

  return paragraph;
});

export const ensureTestParagraph = testingMutation({
  args: { content: v.string(), title: v.string() },
  handler: async (ctx, { content, title }) => {
    const existing = await ctx.db
      .query("paragraphs")
      .filter((q) => q.eq(q.field("content"), content))
      .first();

    const wordCount = content.split(/\s+/).length;

    if (existing) {
      if (existing.wordCount !== wordCount) {
        await ctx.db.patch(existing._id, { wordCount });
      }
      return existing._id;
    }

    return await ctx.db.insert("paragraphs", {
      content,
      bookTitle: "Test Book",
      sequenceTitle: "Test Sequence",
      articleTitle: title,
      articleUrl: `https://example.com/test-${Date.now()}`,
      indexInArticle: 0,
      wordCount,
      articleOrder: 99999,
      sequenceOrder: 99999,
    });
  },
});

export const deleteTestParagraph = testingMutation({
  args: { paragraphId: v.id("paragraphs") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.paragraphId);
  },
});

export const deleteTestUser = testingMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const players = await ctx.db
      .query("players")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    await Promise.all(players.map((p) => ctx.db.delete(p._id)));

    const roomMembers = await ctx.db
      .query("roomMembers")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .collect();
    await Promise.all(roomMembers.map((rm) => ctx.db.delete(rm._id)));

    const completions = await ctx.db
      .query("completions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    await Promise.all(completions.map((c) => ctx.db.delete(c._id)));

    await ctx.db.delete(args.userId);
  },
});

export const deleteTestRoom = testingMutation({
  args: { roomId: v.id("rooms") },
  handler: async (ctx, args) => {
    const games = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();

    for (const game of games) {
      const players = await ctx.db
        .query("players")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect();
      await Promise.all(players.map((p) => ctx.db.delete(p._id)));
      await ctx.db.delete(game._id);
    }

    const roomMembers = await ctx.db
      .query("roomMembers")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    await Promise.all(roomMembers.map((rm) => ctx.db.delete(rm._id)));

    await ctx.db.delete(args.roomId);
  },
});

export const startTestGame = testingMutation({
  args: {
    roomCode: v.string(),
    specificParagraphId: v.id("paragraphs"),
  },
  handler: async (ctx, { roomCode, specificParagraphId }) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      throw new Error("Room not found");
    }

    const paragraph = await ctx.db.get(specificParagraphId);
    if (!paragraph) {
      throw new Error("Paragraph not found");
    }

    const gameId = await ctx.db.insert("games", {
      roomId: room._id,
      status: "playing",
      selectedParagraphId: specificParagraphId,
      startTime: Date.now(),
    });

    const roomMembers = await ctx.db
      .query("roomMembers")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    for (const member of roomMembers) {
      await ctx.db.insert("players", {
        userId: member.userId,
        gameId,
        wordsCompleted: 0,
      });
    }

    await ctx.db.patch(room._id, {
      hasActiveGame: true,
    });

    return gameId;
  },
});
