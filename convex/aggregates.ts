import { TableAggregate } from "@convex-dev/aggregate";
import { components } from "./_generated/api";
import { DataModel, Doc } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";

// Aggregate sorted by word count for efficient range queries
export const sequencesByWordCount = new TableAggregate<{
  DataModel: DataModel;
  TableName: "sequences";
  Key: number;
}>(components.sequencesByWordCount, {
  sortKey: (doc: Doc<"sequences">) => doc.wordCount,
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
  
  const count = await sequencesByWordCount.count(ctx, {
    namespace: undefined,
    bounds,
  });
  
  if (count === 0) {
    return null;
  }
  
  const randomIndex = Math.floor(Math.random() * count);
  const result = await sequencesByWordCount.at(ctx, randomIndex, {
    namespace: undefined,
    bounds,
  });
  
  if (!result) {
    return null;
  }
  
  return await ctx.db.get(result.id);
}

export const playerStatsByUser = new TableAggregate<{
  DataModel: DataModel;
  TableName: "players";
  Key: string;
}>(components.playerStats, {
  sortKey: (doc: Doc<"players">) => doc.userId,
});
