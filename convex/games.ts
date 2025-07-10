import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";

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
        .query("gameRooms")
        .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
        .unique();
      
      existingRoom = !!existing;
      
      attempts++;
      if (attempts > 10) {
        throw new ConvexError("Failed to generate unique room code");
      }
    } while (existingRoom);

    // Create the game room
    const roomId = await ctx.db.insert("gameRooms", {
      roomCode,
      hostId: user._id,
      status: "waiting",
    });

    // Add the host as a player
    await ctx.db.insert("players", {
      userId: user._id,
      gameRoomId: roomId,
      wordsCompleted: 0,
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
      .query("gameRooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      throw new ConvexError("Room not found");
    }

    if (room.status !== "waiting") {
      throw new ConvexError("Game has already started");
    }

    // Check if already in the room
    const existingPlayer = await ctx.db
      .query("players")
      .withIndex("by_user_and_room", (q) => 
        q.eq("userId", user._id).eq("gameRoomId", room._id)
      )
      .unique();

    if (existingPlayer) {
      return { roomId: room._id };
    }

    // Add as a player
    await ctx.db.insert("players", {
      userId: user._id,
      gameRoomId: room._id,
      wordsCompleted: 0,
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
      .query("gameRooms")
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

    // Get all players
    const players = await ctx.db
      .query("players")
      .withIndex("by_gameRoom", (q) => q.eq("gameRoomId", room._id))
      .collect();

    // Get user details for each player
    const playersWithDetails = await Promise.all(
      players.map(async (player) => {
        const user = await ctx.db.get(player.userId);
        return {
          ...player,
          name: user?.name || "Unknown",
          avatarUrl: user?.avatarUrl,
        };
      })
    );

    // Get paragraph details if game has started
    let paragraph = null;
    if (room.selectedParagraphId) {
      paragraph = await ctx.db.get(room.selectedParagraphId);
    }

    return {
      ...room,
      players: playersWithDetails,
      paragraph,
      currentUserId, // Include the current user's ID
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
      .query("gameRooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      throw new ConvexError("Room not found");
    }

    if (room.status !== "waiting") {
      throw new ConvexError("Game has already started");
    }

    // Find the player
    const player = await ctx.db
      .query("players")
      .withIndex("by_user_and_room", (q) => 
        q.eq("userId", user._id).eq("gameRoomId", room._id)
      )
      .unique();

    if (!player) {
      throw new ConvexError("Not in this room");
    }

    // Toggle ready status
    await ctx.db.patch(player._id, {
      isReady: !player.isReady,
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
      .query("gameRooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      throw new ConvexError("Room not found");
    }

    // Check if user is the host
    if (room.hostId !== user._id) {
      throw new ConvexError("Only the host can start the game");
    }

    if (room.status !== "waiting") {
      throw new ConvexError("Game has already started");
    }

    // Check if all players are ready
    const players = await ctx.db
      .query("players")
      .withIndex("by_gameRoom", (q) => q.eq("gameRoomId", room._id))
      .collect();

    const allReady = players.every(p => p.isReady);
    if (!allReady) {
      throw new ConvexError("Not all players are ready");
    }

    // Select a random paragraph using the provided word count settings
    const paragraphs = await ctx.db
      .query("sequences")
      .withIndex("by_random", (q) => q.gte("wordCount", minWordCount).lte("wordCount", maxWordCount))
      .collect();

    if (paragraphs.length === 0) {
      throw new ConvexError("No paragraphs available. Please run the scraper first.");
    }

    const selectedParagraph = paragraphs[Math.floor(Math.random() * paragraphs.length)];

    // Update room status
    await ctx.db.patch(room._id, {
      status: "playing",
      selectedParagraphId: selectedParagraph._id,
      startTime: Date.now(),
    });
  },
});


export const updateProgress = mutation({
  args: {
    roomCode: v.string(),
    wordsCompleted: v.number(),
    typedText: v.string(),
  },
  handler: async (ctx, { roomCode, wordsCompleted, typedText }) => {
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
      .query("gameRooms")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", roomCode))
      .unique();

    if (!room) {
      throw new ConvexError("Room not found");
    }

    if (room.status !== "playing") {
      throw new ConvexError("Game is not active");
    }

    // Find the player
    const player = await ctx.db
      .query("players")
      .withIndex("by_user_and_room", (q) => 
        q.eq("userId", user._id).eq("gameRoomId", room._id)
      )
      .unique();

    if (!player) {
      throw new ConvexError("Not in this room");
    }

    // Get the paragraph to check if finished
    const paragraph = await ctx.db.get(room.selectedParagraphId!);
    if (!paragraph) {
      throw new ConvexError("Paragraph not found");
    }

    // Update progress
    const updates: Partial<Doc<"players">> = {
      wordsCompleted,
      typedText,
    };

    // Check if finished
    if (wordsCompleted >= paragraph.wordCount && !player.finishedAt) {
      updates.finishedAt = Date.now();

      // Check if all players have finished
      const allPlayers = await ctx.db
        .query("players")
        .withIndex("by_gameRoom", (q) => q.eq("gameRoomId", room._id))
        .collect();

      const allFinished = allPlayers.every(p => 
        p._id === player._id ? true : p.finishedAt !== undefined
      );

      if (allFinished) {
        await ctx.db.patch(room._id, {
          status: "finished",
        });
      }
    }

    await ctx.db.patch(player._id, updates);
  },
});