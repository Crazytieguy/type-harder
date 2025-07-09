import { useUser } from "@clerk/clerk-react";
import { convexQuery } from "@convex-dev/react-query";
import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { CheckCircle, Circle, Copy, Crown, Settings, Users } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/room/$roomCode")({
  loader: async ({ context: { queryClient }, params: { roomCode } }) => {
    const queryOptions = convexQuery(api.games.getRoom, { roomCode });
    return await queryClient.ensureQueryData(queryOptions);
  },
  component: RoomPage,
});

const wordCountSchema = z.object({
  minWordCount: z.number()
    .min(10, "Minimum must be at least 10")
    .max(500, "Minimum cannot exceed 500"),
  maxWordCount: z.number()
    .min(10, "Maximum must be at least 10")
    .max(500, "Maximum cannot exceed 500"),
}).refine(
  (data) => data.maxWordCount >= data.minWordCount,
  {
    message: "Maximum must be greater than minimum",
    path: ["maxWordCount"],
  }
);

function RoomPage() {
  const { roomCode } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const [copied, setCopied] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  const roomQueryOptions = convexQuery(api.games.getRoom, { roomCode });
  const { data: room } = useSuspenseQuery(roomQueryOptions);
  
  const toggleReady = useMutation(api.games.toggleReady);
  const startGame = useMutation(api.games.startGame);
  
  const wordCountForm = useForm({
    defaultValues: {
      minWordCount: 50,
      maxWordCount: 150,
    },
    validators: {
      onChange: wordCountSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await startGame({ 
          roomCode, 
          minWordCount: value.minWordCount, 
          maxWordCount: value.maxWordCount
        });
      } catch (err) {
        console.error("Failed to start game:", err);
      }
    },
  });

  if (!room) {
    return (
      <div className="text-center">
        <h1>Room Not Found</h1>
        <p>The room code "{roomCode}" doesn't exist.</p>
        <Link to="/" className="btn btn-primary mt-4">Back to Home</Link>
      </div>
    );
  }

  // Navigate to race if game has started
  if (room.status === "playing" && room.startTime) {
    void navigate({ to: "/race/$roomCode", params: { roomCode } });
    return null;
  }

  // Navigate to results if game is finished
  if (room.status === "finished") {
    void navigate({ to: "/results/$roomCode", params: { roomCode } });
    return null;
  }

  const currentUserId = room.players.find(p => 
    room._id === p.gameRoomId && user?.id
  )?.userId;

  const isHost = currentUserId === room.hostId;
  const currentPlayer = room.players.find(p => p.userId === currentUserId);
  const allReady = room.players.every(p => p.isReady);

  const handleCopyCode = () => {
    void navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleReady = async () => {
    try {
      await toggleReady({ roomCode });
    } catch (err) {
      console.error("Failed to toggle ready:", err);
    }
  };

  const handleStartGame = () => {
    void wordCountForm.handleSubmit();
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <h1>Game Lobby</h1>
        <p className="text-xl opacity-70">Waiting for players to join...</p>
        
        <div className="not-prose mt-6">
          <div className="card bg-base-200 max-w-md mx-auto">
            <div className="card-body">
              <div className="text-sm opacity-70 mb-2">Room Code</div>
              <div className="text-3xl font-mono font-bold tracking-wider">{roomCode}</div>
              <button 
                className="btn btn-sm btn-ghost mt-2"
                onClick={handleCopyCode}
              >
                <Copy className="w-4 h-4 mr-1" />
                {copied ? "Copied!" : "Copy Code"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="not-prose">
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title">
              <Users className="w-5 h-5" />
              Players ({room.players.length})
            </h2>
            
            <div className="space-y-2 mt-4">
              {room.players.map((player) => (
                <div 
                  key={player._id} 
                  className="flex items-center justify-between p-3 bg-base-100 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{player.name}</span>
                    {player.userId === room.hostId && (
                      <Crown className="w-4 h-4 text-warning" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {player.isReady ? (
                      <>
                        <CheckCircle className="w-5 h-5 text-success" />
                        <span className="text-sm text-success">Ready</span>
                      </>
                    ) : (
                      <>
                        <Circle className="w-5 h-5 text-base-content/50" />
                        <span className="text-sm opacity-50">Not Ready</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="divider"></div>

            {isHost && (
              <div className="mb-4">
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setShowSettings(!showSettings)}
                >
                  <Settings className="w-4 h-4 mr-1" />
                  Game Settings
                </button>
                
                {showSettings && (
                  <div className="mt-4 p-4 bg-base-100 rounded-lg">
                    <div className="space-y-4">
                      <div>
                        <label className="label">
                          <span className="label-text">Word Count Range</span>
                        </label>
                        <div>
                          <div className="flex gap-2 items-center">
                            <wordCountForm.Field name="minWordCount">
                              {(field) => (
                                <input
                                  type="number"
                                  value={field.state.value}
                                  onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                  className={`input input-bordered w-20 text-center ${
                                    !field.state.meta.isValid ? "input-error" : ""
                                  }`}
                                  min="10"
                                  max="500"
                                />
                              )}
                            </wordCountForm.Field>
                            <span>to</span>
                            <wordCountForm.Field name="maxWordCount">
                              {(field) => (
                                <input
                                  type="number"
                                  value={field.state.value}
                                  onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                                  className={`input input-bordered w-20 text-center ${
                                    !field.state.meta.isValid ? "input-error" : ""
                                  }`}
                                  min="10"
                                  max="500"
                                />
                              )}
                            </wordCountForm.Field>
                            <span className="text-sm opacity-70">words</span>
                          </div>
                          <div className="h-5 mt-1">
                            <wordCountForm.Field name="minWordCount">
                              {(field) => (
                                <>
                                  {!field.state.meta.isValid && field.state.meta.errors.length > 0 && (
                                    <em className="text-error text-xs">
                                      {field.state.meta.errors[0]?.message}
                                    </em>
                                  )}
                                </>
                              )}
                            </wordCountForm.Field>
                            <wordCountForm.Field name="maxWordCount">
                              {(field) => (
                                <>
                                  {!field.state.meta.isValid && field.state.meta.errors.length > 0 && (
                                    <em className="text-error text-xs">
                                      {field.state.meta.errors[0]?.message}
                                    </em>
                                  )}
                                </>
                              )}
                            </wordCountForm.Field>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {currentPlayer && (
                <button 
                  className={`btn ${currentPlayer.isReady ? "btn-outline" : "btn-primary"}`}
                  onClick={() => void handleToggleReady()}
                >
                  {currentPlayer.isReady ? "Not Ready" : "Ready"}
                </button>
              )}
              
              {isHost && (
                <button 
                  className="btn btn-success"
                  onClick={() => void handleStartGame()}
                  disabled={!allReady || room.players.length < 2}
                >
                  Start Game
                </button>
              )}
            </div>

            {isHost && !allReady && (
              <p className="text-center text-sm opacity-70 mt-2">
                All players must be ready to start
              </p>
            )}
            
            {isHost && room.players.length < 2 && (
              <p className="text-center text-sm opacity-70 mt-2">
                Need at least 2 players to start
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}