import { customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { paragraphsByWordCount } from "./aggregates";
import { internal } from "./_generated/api";

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
    bookOrder: 99999,
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
      bookOrder: 99999,
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

export const createTestParagraphs = testingMutation(async (ctx) => {
  const testParagraphs = [
    {
      content: "The question isn't whether we can—it's whether we should. Here's the thing: reality doesn't care about our theories. When we face evidence that contradicts our beliefs, we have two choices: update our beliefs or engage in motivated reasoning to explain away the evidence. The rational approach is clear, yet incredibly difficult in practice. Our brains are wired to protect our existing worldview, to seek confirmation rather than truth. This cognitive bias affects everyone, from scientists to philosophers to everyday decision makers. The key is recognizing when we're doing it and consciously choosing the harder path of intellectual honesty.",
      title: "Test Paragraph - Medium Length",
      wordCount: 100
    },
    {
      content: "Consider the nature of belief itself. What does it mean to truly believe something? Is it merely assenting to a proposition, or does genuine belief require action that demonstrates conviction? Many claim beliefs they don't actually hold when tested by reality.",
      title: "Test Paragraph - Short",
      wordCount: 45
    },
    {
      content: "The probability calculus provides us with a framework for reasoning under uncertainty. When we encounter new evidence, we should update our beliefs in proportion to how much that evidence discriminates between hypotheses. This is Bayes' theorem in action. However, human psychology often leads us astray. We overweight vivid examples, underweight base rates, and fail to consider alternative explanations. The solution isn't to abandon our intuitions entirely, but to supplement them with systematic reasoning. By explicitly considering multiple hypotheses and evaluating evidence carefully, we can reduce the impact of cognitive biases. This metacognitive approach—thinking about thinking—is essential for rationality. It requires effort and practice, but the rewards in terms of more accurate beliefs and better decisions are substantial.",
      title: "Test Paragraph - Long",
      wordCount: 120
    },
    {
      content: "Rationality means winning. It's not about following clever argumentation to fascinating but false conclusions. It's about systematically achieving your goals by forming accurate beliefs and making effective decisions. This requires both epistemic rationality—believing what is true—and instrumental rationality—doing what works. The two are deeply interconnected: you can't reliably achieve your goals without accurate beliefs about the world.",
      title: "Test Paragraph - Exact 50 Words",
      wordCount: 50
    }
  ];

  const paragraphIds = [];

  for (const { content, title, wordCount } of testParagraphs) {
    const existing = await ctx.db
      .query("paragraphs")
      .filter((q) => q.eq(q.field("content"), content))
      .first();

    if (existing) {
      paragraphIds.push(existing._id);
    } else {
      const id = await ctx.db.insert("paragraphs", {
        content,
        bookTitle: "Test Book - Rationality",
        sequenceTitle: "Test Sequence - Epistemology",
        articleTitle: title,
        articleUrl: `https://example.com/test-${Date.now()}`,
        indexInArticle: 0,
        wordCount,
        articleOrder: 99999,
        sequenceOrder: 99999,
        bookOrder: 99999,
      });
      paragraphIds.push(id);
    }
  }

  return paragraphIds;
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

export const populateAggregates = testingMutation(async (ctx) => {
  const paragraphs = await ctx.db.query("paragraphs").collect();

  for (const paragraph of paragraphs) {
    await paragraphsByWordCount.insert(ctx, paragraph);
  }

  return { message: `Populated aggregates for ${paragraphs.length} paragraphs` };
});

// Internal mutation to populate aggregates in batches
export const populateAggregatesBatchInternal = internalMutation({
  args: { skip: v.number(), take: v.number() },
  handler: async (ctx, { skip, take }) => {
    const allParagraphs = await ctx.db.query("paragraphs").collect();
    const batch = allParagraphs.slice(skip, skip + take);

    for (const paragraph of batch) {
      await paragraphsByWordCount.insert(ctx, paragraph);
    }

    return batch.length;
  },
});

// Action to populate aggregates in batches
export const populateAggregatesBatched = action({
  args: {},
  handler: async (ctx): Promise<{ message: string; totalPopulated: number }> => {
    const totalParagraphs = 9001; // We know from earlier count
    const batchSize = 500;
    let totalPopulated = 0;

    for (let skip = 0; skip < totalParagraphs; skip += batchSize) {
      const count: number = await ctx.runMutation(
        internal.testingFunctions.populateAggregatesBatchInternal,
        { skip, take: batchSize }
      );
      totalPopulated += count;
    }

    return {
      message: `Populated aggregates in batches`,
      totalPopulated,
    };
  },
});

export const checkAggregateCount = testingQuery(async (ctx) => {
  const count = await paragraphsByWordCount.count(ctx, {
    namespace: undefined,
    bounds: {
      lower: { key: 50, inclusive: true },
      upper: { key: 150, inclusive: true },
    },
  });

  return { count, message: `Found ${count} paragraphs in 50-150 word range` };
});

export const clearAndRepopulateAggregates = testingMutation(async (ctx) => {
  await paragraphsByWordCount.clear(ctx, { namespace: undefined });

  const allParagraphs = await ctx.db.query("paragraphs").collect();

  for (const paragraph of allParagraphs) {
    await paragraphsByWordCount.insert(ctx, paragraph);
  }

  return { message: `Cleared and repopulated aggregates for ${allParagraphs.length} paragraphs` };
});

export const countParagraphs = testingQuery(async (ctx) => {
  const all = await ctx.db.query("paragraphs").collect();
  const in50to150 = all.filter(p => p.wordCount >= 50 && p.wordCount <= 150);

  return {
    totalParagraphs: all.length,
    in50to150Range: in50to150.length,
    aggregateCount: await paragraphsByWordCount.count(ctx, {
      namespace: undefined,
      bounds: {
        lower: { key: 50, inclusive: true },
        upper: { key: 150, inclusive: true },
      },
    }),
  };
});

export const cleanDatabase = testingMutation(async (ctx) => {
  const tables = ["rooms", "games", "players", "roomMembers", "completions", "articleCompletions", "scrapingProgress"] as const;
  const deletedCounts: Record<string, number> = {};

  for (const table of tables) {
    const records = await ctx.db.query(table).collect();
    await Promise.all(records.map(r => ctx.db.delete(r._id)));
    deletedCounts[table] = records.length;
  }

  const testParagraphs = await ctx.db.query("paragraphs").collect();
  const testParagraphsToDelete = testParagraphs.filter(
    p => p.bookTitle === "Test Book" || p.bookTitle === "Test Book - Rationality"
  );
  await Promise.all(testParagraphsToDelete.map(p => ctx.db.delete(p._id)));

  await paragraphsByWordCount.clear(ctx, { namespace: undefined });

  return {
    message: "Database cleaned",
    deleted: {
      ...deletedCounts,
      testParagraphs: testParagraphsToDelete.length,
    },
  };
});

// Internal mutation to deduplicate a single article's paragraphs
export const deduplicateSingleArticleInternal = internalMutation({
  args: { articleTitle: v.string() },
  handler: async (ctx, { articleTitle }) => {
    const paragraphs = await ctx.db
      .query("paragraphs")
      .withIndex("by_article", (q) => q.eq("articleTitle", articleTitle))
      .collect();

    const byIndex = new Map<number, typeof paragraphs>();
    for (const p of paragraphs) {
      const existing = byIndex.get(p.indexInArticle);
      if (!existing) {
        byIndex.set(p.indexInArticle, [p]);
      } else {
        existing.push(p);
      }
    }

    let duplicatesDeleted = 0;

    for (const [_index, paras] of byIndex.entries()) {
      if (paras.length > 1) {
        paras.sort((a, b) => a._creationTime - b._creationTime);
        const toDelete = paras.slice(1);

        for (const p of toDelete) {
          await ctx.db.delete(p._id);
          duplicatesDeleted++;
        }
      }
    }

    // Update article.paragraphCount
    const article = await ctx.db
      .query("articles")
      .withIndex("by_article_title", (q) => q.eq("articleTitle", articleTitle))
      .unique();

    if (article) {
      const correctCount = byIndex.size;
      if (correctCount !== article.paragraphCount) {
        await ctx.db.patch(article._id, { paragraphCount: correctCount });
      }
    }

    return duplicatesDeleted;
  },
});

// Internal mutation to clean up orphaned completions
export const cleanupOrphanedCompletionsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allParagraphs = await ctx.db.query("paragraphs").collect();
    const validIds = new Set(allParagraphs.map(p => p._id));

    const completions = await ctx.db.query("completions").collect();
    let deleted = 0;
    for (const c of completions) {
      if (!validIds.has(c.paragraphId)) {
        await ctx.db.delete(c._id);
        deleted++;
      }
    }

    return deleted;
  },
});

// Internal mutation to clear all articleCompletions
export const clearArticleCompletionsInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    const articleCompletions = await ctx.db.query("articleCompletions").collect();
    for (const ac of articleCompletions) {
      await ctx.db.delete(ac._id);
    }
    return articleCompletions.length;
  },
});

// Action to orchestrate the full deduplication process
export const deduplicateParagraphs = action({
  args: {},
  handler: async (ctx): Promise<{
    message: string;
    duplicatesDeleted: number;
    invalidCompletionsDeleted: number;
    articleCompletionsCleared: number;
    articlesProcessed: number;
  }> => {
    // Get all articles
    const articles: Array<{ articleTitle: string }> = await ctx.runMutation(internal.testingFunctions.getAllArticlesInternal, {});

    let totalDuplicatesDeleted = 0;

    // Process each article one at a time
    for (const article of articles) {
      const deleted: number = await ctx.runMutation(
        internal.testingFunctions.deduplicateSingleArticleInternal,
        { articleTitle: article.articleTitle }
      );
      totalDuplicatesDeleted += deleted;
    }

    // Clean up orphaned completions
    const invalidCompletionsDeleted: number = await ctx.runMutation(
      internal.testingFunctions.cleanupOrphanedCompletionsInternal,
      {}
    );

    // Clear articleCompletions
    const articleCompletionsCleared: number = await ctx.runMutation(
      internal.testingFunctions.clearArticleCompletionsInternal,
      {}
    );

    return {
      message: "Deduplication complete",
      duplicatesDeleted: totalDuplicatesDeleted,
      invalidCompletionsDeleted,
      articleCompletionsCleared,
      articlesProcessed: articles.length,
    };
  },
});

// Internal mutation to get all articles
export const getAllArticlesInternal = internalMutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("articles").collect();
  },
});
