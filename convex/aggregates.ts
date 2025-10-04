import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import { DataModel, Doc } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

// Aggregate sorted by word count for efficient range queries
export const paragraphsByWordCount = new TableAggregate<{
  DataModel: DataModel;
  TableName: "paragraphs";
  Key: number;
}>(components.paragraphsByWordCount, {
  sortKey: (doc: Doc<"paragraphs">) => doc.wordCount,
});

// O(1) random paragraph selection within word count bounds
export async function getRandomParagraphInRange(
  ctx: QueryCtx | MutationCtx,
  minWordCount: number,
  maxWordCount: number
) {
  const bounds = {
    lower: { key: minWordCount, inclusive: true },
    upper: { key: maxWordCount, inclusive: true },
  };

  const count = await paragraphsByWordCount.count(ctx, {
    namespace: undefined,
    bounds,
  });

  if (count === 0) {
    return null;
  }

  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const randomIndex = Math.floor(Math.random() * count);
    const result = await paragraphsByWordCount.at(ctx, randomIndex, {
      namespace: undefined,
      bounds,
    });

    if (!result) {
      attempts++;
      continue;
    }

    const paragraph = await ctx.db.get(result.id);
    if (paragraph) {
      return result.id;
    }

    attempts++;
  }

  return null;
}

export const playerStatsByUser = new TableAggregate<{
  DataModel: DataModel;
  TableName: "players";
  Key: string;
}>(components.playerStats, {
  sortKey: (doc: Doc<"players">) => doc.userId,
});
