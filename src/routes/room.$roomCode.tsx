import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import RaceView from "../components/room/RaceView";
import ResultsView from "../components/room/ResultsView";
import RoomLobby from "../components/room/RoomLobby";
import { hasGame } from "../types/room";

export const Route = createFileRoute("/room/$roomCode")({
  loader: async ({ context: { queryClient }, params: { roomCode } }) => {
    const roomQueryOptions = convexQuery(api.games.getRoom, { roomCode });
    return await queryClient.ensureQueryData(roomQueryOptions);
  },
  component: RoomPage,
});

function RoomPage() {
  const { roomCode } = Route.useParams();
  
  const roomQueryOptions = convexQuery(api.games.getRoom, { roomCode });
  const { data: room } = useSuspenseQuery(roomQueryOptions);

  if (!room) {
    return (
      <div className="text-center">
        <h1>Room Not Found</h1>
        <p>The room code "{roomCode}" doesn't exist.</p>
        <Link to="/" className="btn btn-primary mt-4">Back to Home</Link>
      </div>
    );
  }

  // Determine which view to show based on state
  if (!hasGame(room)) {
    return <RoomLobby room={room} />;
  } else if (room.game.status === "playing") {
    return <RaceView room={room} />;
  } else {
    return <ResultsView room={room} />;
  }
}