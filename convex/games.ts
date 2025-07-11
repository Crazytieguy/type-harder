import { ConvexError, v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";

// Generate a random 6-character room code
function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const createRoom = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError("User not found");
    }

    // Generate a unique room code
    let roomCode: string;
    let attempts = 0;
    let existingRoom = true;
    do {
      roomCode = generateRoomCode();
      const existing = await ctx.db
        .query("rooms")
        .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
        .unique();

      existingRoom = !!existing;

      attempts++;
      if (attempts > 10) {
        throw new ConvexError("Failed to generate unique room code");
      }
    } while (existingRoom);

    // Create the room
    const roomId = await ctx.db.insert("rooms", {
      roomCode,
      hostId: user._id,
    });

    // Add the host as a room member
    await ctx.db.insert("roomMembers", {
      userId: user._id,
      roomId,
      isReady: false,
    });

    return { roomCode, roomId };
  },
});

export const joinRoom = mutation({
  args: {
    roomCode: v.string(),
  },
  handler: async (ctx, { roomCode }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError("User not found");
    }

    // Find the room
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      throw new ConvexError("Room not found");
    }

    // Check if there's an active game in this room
    const activeGame = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.neq(q.field("status"), "finished"))
      .first();

    if (activeGame && activeGame.status === "playing") {
      throw new ConvexError("Game has already started");
    }

    // Check if already in the room
    const existingMember = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", user._id).eq("roomId", room._id),
      )
      .unique();

    if (existingMember) {
      return { roomId: room._id };
    }

    // Add as a room member
    await ctx.db.insert("roomMembers", {
      userId: user._id,
      roomId: room._id,
      isReady: false,
    });

    return { roomId: room._id };
  },
});

export const getRoom = query({
  args: {
    roomCode: v.string(),
  },
  handler: async (ctx, { roomCode }) => {
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      return null;
    }

    // Get current user's ID if authenticated
    let currentUserId = null;
    const identity = await ctx.auth.getUserIdentity();
    if (identity) {
      const currentUser = await ctx.db
        .query("users")
        .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
        .unique();
      if (currentUser) {
        currentUserId = currentUser._id;
      }
    }

    // Get the current game (if any)
    const activeGame = room.hasActiveGame
      ? await ctx.db
          .query("games")
          .withIndex("by_room", (q) => q.eq("roomId", room._id))
          .order("desc")
          .first()
      : null;

    // Get room members
    const roomMembers = await ctx.db
      .query("roomMembers")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    const members = await Promise.all(
      roomMembers.map(async (member) => {
        const user = await ctx.db.get(member.userId);
        return {
          _id: member._id,
          userId: member.userId,
          name: user?.name || "Unknown",
          avatarUrl: user?.avatarUrl,
          isReady: member.isReady,
        };
      }),
    );

    // If there's an active game, get the game data
    let game = null;
    if (activeGame) {
      // Get paragraph details
      const paragraph = await ctx.db.get(activeGame.selectedParagraphId);
      if (!paragraph) {
        throw new ConvexError("Paragraph not found");
      }

      // Get game players
      const gamePlayers = await ctx.db
        .query("players")
        .withIndex("by_game", (q) => q.eq("gameId", activeGame._id))
        .collect();

      const players = await Promise.all(
        gamePlayers.map(async (player) => {
          const user = await ctx.db.get(player.userId);
          return {
            ...player,
            name: user?.name || "Unknown",
            avatarUrl: user?.avatarUrl,
          };
        }),
      );

      game = {
        ...activeGame,
        players,
        paragraph,
      };
    }

    return {
      _id: room._id,
      roomCode: room.roomCode,
      hostId: room.hostId,
      members,
      game,
      hasActiveGame: room.hasActiveGame,
      status: activeGame
        ? activeGame.status
        : ("waiting" as "waiting" | "playing" | "finished"),
      currentUserId,
    };
  },
});

export const toggleReady = mutation({
  args: {
    roomCode: v.string(),
  },
  handler: async (ctx, { roomCode }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError("User not found");
    }

    // Find the room
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      throw new ConvexError("Room not found");
    }

    // Check if there's an active game
    const activeGame = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("status"), "playing"))
      .first();

    if (activeGame) {
      throw new ConvexError("Game has already started");
    }

    // Find the room member
    const roomMember = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", user._id).eq("roomId", room._id),
      )
      .unique();

    if (!roomMember) {
      throw new ConvexError("Not in this room");
    }

    // Toggle ready status
    await ctx.db.patch(roomMember._id, {
      isReady: !roomMember.isReady,
    });
  },
});

export const startGame = mutation({
  args: {
    roomCode: v.string(),
    minWordCount: v.optional(v.number()),
    maxWordCount: v.optional(v.number()),
  },
  handler: async (ctx, { roomCode, minWordCount = 50, maxWordCount = 150 }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError("User not found");
    }

    // Find the room
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      throw new ConvexError("Room not found");
    }

    // Check if user is the host
    if (room.hostId !== user._id) {
      throw new ConvexError("Only the host can start the game");
    }

    // Check if there's already an active game
    const activeGame = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.neq(q.field("status"), "finished"))
      .first();

    if (activeGame) {
      throw new ConvexError("Game has already started");
    }

    // Check if all players (except host) are ready
    const roomMembers = await ctx.db
      .query("roomMembers")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    const allReady = roomMembers.every(
      (m) => m.userId === room.hostId || m.isReady,
    );
    if (!allReady) {
      throw new ConvexError("Not all players are ready");
    }

    // Select a random paragraph using the provided word count settings
    const paragraphs = await ctx.db
      .query("sequences")
      .withIndex("by_random", (q) =>
        q.gte("wordCount", minWordCount).lte("wordCount", maxWordCount),
      )
      .collect();

    if (paragraphs.length === 0) {
      throw new ConvexError(
        "No paragraphs available. Please run the scraper first.",
      );
    }

    const selectedParagraph =
      paragraphs[Math.floor(Math.random() * paragraphs.length)];

    // Create a new game
    const gameId = await ctx.db.insert("games", {
      roomId: room._id,
      status: "playing",
      selectedParagraphId: selectedParagraph._id,
      startTime: Date.now(),
    });

    // Mark room as having an active game
    await ctx.db.patch(room._id, {
      hasActiveGame: true,
    });

    // Create player entries for all room members
    for (const member of roomMembers) {
      await ctx.db.insert("players", {
        userId: member.userId,
        gameId,
        wordsCompleted: 0,
      });
    }
  },
});

export const updateProgress = mutation({
  args: {
    roomCode: v.string(),
    wordsCompleted: v.number(),
  },
  handler: async (ctx, { roomCode, wordsCompleted }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError("User not found");
    }

    // Find the room
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      throw new ConvexError("Room not found");
    }

    // Find the active game
    const activeGame = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("status"), "playing"))
      .unique();

    if (!activeGame) {
      throw new ConvexError("No active game found");
    }

    // Find the player in this game
    const player = await ctx.db
      .query("players")
      .withIndex("by_user_and_game", (q) =>
        q.eq("userId", user._id).eq("gameId", activeGame._id),
      )
      .unique();

    if (!player) {
      throw new ConvexError("Not in this game");
    }

    // Get the paragraph to check if finished
    const paragraph = await ctx.db.get(activeGame.selectedParagraphId);
    if (!paragraph) {
      throw new ConvexError("Paragraph not found");
    }

    // Update progress
    const updates: Partial<Doc<"players">> = {
      wordsCompleted,
    };

    // Check if finished
    if (wordsCompleted >= paragraph.wordCount && !player.finishedAt) {
      updates.finishedAt = Date.now();

      // Check if all players have finished
      const allPlayers = await ctx.db
        .query("players")
        .withIndex("by_game", (q) => q.eq("gameId", activeGame._id))
        .collect();

      const allFinished = allPlayers.every((p) =>
        p._id === player._id ? true : p.finishedAt !== undefined,
      );

      if (allFinished) {
        await ctx.db.patch(activeGame._id, {
          status: "finished",
        });
      }
    }

    await ctx.db.patch(player._id, updates);
  },
});

export const playAgain = mutation({
  args: {
    roomCode: v.string(),
  },
  handler: async (ctx, { roomCode }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    // Get the user
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError("User not found");
    }

    // Find the room
    const room = await ctx.db
      .query("rooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      throw new ConvexError("Room not found");
    }

    // Check if user is the host
    if (room.hostId !== user._id) {
      throw new ConvexError("Only the host can restart the game");
    }

    // Find the current finished game
    const finishedGame = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("status"), "finished"))
      .order("desc")
      .first();

    if (!finishedGame) {
      throw new ConvexError("No finished game found");
    }

    // Reset all room members' ready status
    const roomMembers = await ctx.db
      .query("roomMembers")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .collect();

    for (const member of roomMembers) {
      await ctx.db.patch(member._id, {
        isReady: false,
      });
    }

    // Clear the active game flag
    await ctx.db.patch(room._id, {
      hasActiveGame: undefined,
    });

    // The room is now ready for a new game to be started
    // No need to create a new game here - that happens when host clicks "Start Game"
  },
});
