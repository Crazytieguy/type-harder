import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx } from "./_generated/server";
import { paragraphsByWordCount, playerStatsByUser } from "./aggregates";

// Paragraphs table operations
export async function insertParagraph(
  ctx: MutationCtx,
  args: Omit<Doc<"paragraphs">, "_id" | "_creationTime">
) {
  const id = await ctx.db.insert("paragraphs", args);
  const doc = await ctx.db.get(id);
  if (doc) {
    await paragraphsByWordCount.insert(ctx, doc);
  }
  return id;
}

export async function deleteParagraph(ctx: MutationCtx, id: Id<"paragraphs">) {
  const doc = await ctx.db.get(id);
  if (doc) {
    await ctx.db.delete(id);
    await paragraphsByWordCount.delete(ctx, doc);
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