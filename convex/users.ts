import { mutation, query } from "./_generated/server";

export const ensureUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Check if user already exists
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (existingUser) {
      // Update name and avatar if they have changed in Clerk
      const clerkName = identity.name ?? "Anonymous";
      const clerkAvatarUrl = identity.pictureUrl;

      if (
        existingUser.name !== clerkName ||
        existingUser.avatarUrl !== clerkAvatarUrl
      ) {
        await ctx.db.patch(existingUser._id, {
          name: clerkName,
          avatarUrl: clerkAvatarUrl,
        });
        return await ctx.db.get(existingUser._id);
      }
      return existingUser;
    }

    // Create new user
    const userId = await ctx.db.insert("users", {
      clerkId: identity.subject,
      name: identity.name ?? "Anonymous",
      avatarUrl: identity.pictureUrl,
    });

    return await ctx.db.get(userId);
  },
});

export const listUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users;
  },
});
