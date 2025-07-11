import { api } from "../../convex/_generated/api";

export type Room = NonNullable<typeof api.games.getRoom._returnType>;
export type RoomWithGame = Room & { game: NonNullable<Room["game"]> };

// Type guard to check if room has a game
export function hasGame(room: Room): room is RoomWithGame {
  return room.hasActiveGame === true && room.game !== null;
}
