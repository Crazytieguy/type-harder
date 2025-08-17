import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { sequencesByWordCount, playerStatsByUser } from "./aggregates";

// Sequences table operations
export async function insertSequence(
  ctx: MutationCtx,
  args: Omit<Doc<"sequences">, "_id" | "_creationTime">
) {
  const id = await ctx.db.insert("sequences", args);
  const doc = await ctx.db.get(id);
  if (doc) {
    await sequencesByWordCount.insert(ctx, doc);
  }
  return id;
}

export async function deleteSequence(ctx: MutationCtx, id: Id<"sequences">) {
  const doc = await ctx.db.get(id);
  if (doc) {
    await ctx.db.delete(id);
    await sequencesByWordCount.delete(ctx, doc);
  }
}

// Players table operations
export async function insertPlayer(
  ctx: MutationCtx,
  args: Omit<Doc<"players">, "_id" | "_creationTime">
) {
  const id = await ctx.db.insert("players", args);
  const doc = await ctx.db.get(id);
  if (doc) {
    await playerStatsByUser.insert(ctx, doc);
  }
  return id;
}

export async function updatePlayer(
  ctx: MutationCtx,
  id: Id<"players">,
  updates: Partial<Omit<Doc<"players">, "_id" | "_creationTime">>
) {
  const oldDoc = await ctx.db.get(id);
  if (!oldDoc) return;
  
  await ctx.db.patch(id, updates);
  const newDoc = await ctx.db.get(id);
  
  if (newDoc && (updates.finishedAt || updates.wpm)) {
    await playerStatsByUser.replace(ctx, oldDoc, newDoc);
  }
}

export async function deletePlayer(ctx: MutationCtx, id: Id<"players">) {
  const doc = await ctx.db.get(id);
  if (doc) {
    await ctx.db.delete(id);
    await playerStatsByUser.delete(ctx, doc);
  }
}