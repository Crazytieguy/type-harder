import { ConvexError, v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getRandomParagraphInRange } from "./aggregates";
import { insertPlayer, updatePlayer } from "./dbHelpers";

function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const getUserActiveRoom = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      return null;
    }

    const membership = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) => q.eq("userId", user._id))
      .unique();

    if (membership) {
      const room = await ctx.db.get(membership.roomId);
      if (room) {
        return {
          roomCode: room.roomCode,
          roomId: room._id,
        };
      }
    }

    return null;
  },
});

export const createRoom = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) {
      throw new ConvexError("User not found");
    }

    const existingMemberships = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) => q.eq("userId", user._id))
      .collect();

    for (const membership of existingMemberships) {
      await ctx.db.delete(membership._id);
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
    // Allow joining during a race as a spectator (no longer blocking)

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

    // Leave any other rooms the user is in
    const otherMemberships = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) => q.eq("userId", user._id))
      .collect();

    for (const membership of otherMemberships) {
      if (membership.roomId !== room._id) {
        await ctx.db.delete(membership._id);
      }
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

export const leaveRoom = mutation({
  args: {
    roomCode: v.string(),
  },
  handler: async (ctx, { roomCode }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

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

    // Check if user is in the room
    const membership = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", user._id).eq("roomId", room._id),
      )
      .unique();

    if (!membership) {
      throw new ConvexError("Not a member of this room");
    }

    // Remove the membership first
    await ctx.db.delete(membership._id);

    // Check if there's an active game and if we should end it
    const activeGame = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("status"), "playing"))
      .unique();

    if (activeGame) {
      // Get all players in the game
      const gamePlayers = await ctx.db
        .query("players")
        .withIndex("by_game", (q) => q.eq("gameId", activeGame._id))
        .collect();

      // Get remaining room members (after we've left)
      const remainingMembers = await ctx.db
        .query("roomMembers")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();
      
      const remainingUserIds = new Set(remainingMembers.map(m => m.userId));
      
      // Check if all remaining players have finished
      const allRemainingFinished = gamePlayers
        .filter(p => remainingUserIds.has(p.userId))
        .every(p => p.finishedAt !== undefined);

      if (allRemainingFinished && remainingMembers.length > 0) {
        // End the game if all remaining players have finished
        await ctx.db.patch(activeGame._id, {
          status: "finished",
        });
      }
    }

    // If host is leaving, transfer host to another member
    if (room.hostId === user._id) {
      // Get all remaining members (after we've left)
      const remainingMembers = await ctx.db
        .query("roomMembers")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();
      
      if (remainingMembers.length > 0) {
        // Transfer host to the first remaining member
        await ctx.db.patch(room._id, {
          hostId: remainingMembers[0].userId,
        });
      } else {
        // No other members, delete the room
        await ctx.db.delete(room._id);
      }
    }

    return { success: true };
  },
});

export const kickPlayer = mutation({
  args: {
    roomCode: v.string(),
    playerUserId: v.id("users"),
  },
  handler: async (ctx, { roomCode, playerUserId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Not authenticated");
    }

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
      throw new ConvexError("Only the host can kick players");
    }

    // Can't kick yourself
    if (playerUserId === user._id) {
      throw new ConvexError("Cannot kick yourself");
    }

    // Find the player's membership
    const membership = await ctx.db
      .query("roomMembers")
      .withIndex("by_user_and_room", (q) =>
        q.eq("userId", playerUserId).eq("roomId", room._id),
      )
      .unique();

    if (!membership) {
      throw new ConvexError("Player not in this room");
    }

    // Remove the membership
    await ctx.db.delete(membership._id);

    // Check if there's an active game and if we should end it
    const activeGame = await ctx.db
      .query("games")
      .withIndex("by_room", (q) => q.eq("roomId", room._id))
      .filter((q) => q.eq(q.field("status"), "playing"))
      .unique();

    if (activeGame) {
      // Get all players in the game
      const gamePlayers = await ctx.db
        .query("players")
        .withIndex("by_game", (q) => q.eq("gameId", activeGame._id))
        .collect();

      // Get remaining room members (after kick)
      const remainingMembers = await ctx.db
        .query("roomMembers")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();
      
      const remainingUserIds = new Set(remainingMembers.map(m => m.userId));
      
      // Check if all remaining players have finished
      const allRemainingFinished = gamePlayers
        .filter(p => remainingUserIds.has(p.userId))
        .every(p => p.finishedAt !== undefined);

      if (allRemainingFinished && remainingMembers.length > 0) {
        // End the game if all remaining players have finished
        await ctx.db.patch(activeGame._id, {
          status: "finished",
        });
      }
    }

    return { success: true };
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
          // Check if player is still in the room
          const membership = await ctx.db
            .query("roomMembers")
            .withIndex("by_user_and_room", (q) =>
              q.eq("userId", player.userId).eq("roomId", room._id),
            )
            .unique();
          return {
            ...player,
            name: user?.name || "Unknown",
            avatarUrl: user?.avatarUrl,
            hasLeft: !membership,
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
      minWordCount: room.minWordCount,
      maxWordCount: room.maxWordCount,
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

    // Allow solo races (when there's only one member who is also the host)
    const isSoloRace = roomMembers.length === 1 && roomMembers[0].userId === room.hostId;
    
    if (!isSoloRace) {
      const allReady = roomMembers.every(
        (m) => m.userId === room.hostId || m.isReady,
      );
      if (!allReady) {
        throw new ConvexError("Not all players are ready");
      }
    }

    await ctx.db.patch(room._id, {
      minWordCount,
      maxWordCount,
    });

    const selectedParagraphId = await getRandomParagraphInRange(
      ctx,
      minWordCount,
      maxWordCount
    );

    if (!selectedParagraphId) {
      throw new ConvexError(
        "No paragraphs available in the specified word count range. Please run the scraper first.",
      );
    }

    // Create a new game
    const gameId = await ctx.db.insert("games", {
      roomId: room._id,
      status: "playing",
      selectedParagraphId,
      startTime: Date.now(),
    });

    // Mark room as having an active game
    await ctx.db.patch(room._id, {
      hasActiveGame: true,
    });

    // Create player entries for all room members
    for (const member of roomMembers) {
      await insertPlayer(ctx, {
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
      const finishedAt = Date.now();
      updates.finishedAt = finishedAt;
      
      // Calculate WPM
      const raceDuration = (finishedAt - activeGame.startTime) / 1000; // in seconds
      const wpm = Math.round((paragraph.wordCount / raceDuration) * 60);
      updates.wpm = wpm;

      // Check if all players still in the room have finished
      const allPlayers = await ctx.db
        .query("players")
        .withIndex("by_game", (q) => q.eq("gameId", activeGame._id))
        .collect();
      
      // Get current room members to check who's still in the room
      const currentRoomMembers = await ctx.db
        .query("roomMembers")
        .withIndex("by_room", (q) => q.eq("roomId", room._id))
        .collect();
      
      const memberUserIds = new Set(currentRoomMembers.map(m => m.userId));
      
      // Check if all players still in the room have finished
      const allRemainingFinished = allPlayers
        .filter(p => memberUserIds.has(p.userId))
        .every((p) =>
          p._id === player._id ? true : p.finishedAt !== undefined,
        );

      if (allRemainingFinished) {
        await ctx.db.patch(activeGame._id, {
          status: "finished",
        });
      }
    }

    await updatePlayer(ctx, player._id, updates);
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
