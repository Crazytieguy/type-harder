import { useForm } from "@tanstack/react-form";
import { useMutation } from "convex/react";
import {
  CheckCircle,
  Circle,
  Copy,
  Crown,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { Room } from "../../types/room";
import DualRangeSlider from "../ui/DualRangeSlider";
import KickButton from "../ui/KickButton";

const wordCountSchema = z
  .object({
    minWordCount: z
      .number()
      .min(10, "Minimum must be at least 10")
      .max(500, "Minimum cannot exceed 500"),
    maxWordCount: z
      .number()
      .min(10, "Maximum must be at least 10")
      .max(500, "Maximum cannot exceed 500"),
  })
  .refine((data) => data.maxWordCount >= data.minWordCount, {
    message: "Maximum must be greater than minimum",
    path: ["maxWordCount"],
  });

interface RoomLobbyProps {
  room: Room;
}

export default function RoomLobby({
  room: { roomCode, ...room },
}: RoomLobbyProps) {
  const [copied, setCopied] = useState(false);
  const toggleReady = useMutation(api.games.toggleReady);
  const startGame = useMutation(api.games.startGame);
  const joinRoom = useMutation(api.games.joinRoom);
  const leaveRoom = useMutation(api.games.leaveRoom);
  const kickPlayer = useMutation(api.games.kickPlayer);
  const navigate = useNavigate();

  const wordCountForm = useForm({
    defaultValues: {
      minWordCount: room.minWordCount ?? 50,
      maxWordCount: room.maxWordCount ?? 150,
    },
    validators: {
      onChange: wordCountSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await startGame({
          roomCode,
          minWordCount: value.minWordCount,
          maxWordCount: value.maxWordCount,
        });
      } catch (err) {
        console.error("Failed to start game:", err);
      }
    },
  });

  const isHost = room.currentUserId === room.hostId;
  const currentMember = room.members.find(
    (m) => m.userId === room.currentUserId,
  );
  const isSoloRoom = room.members.length === 1 && isHost;
  const allReady = room.members.every(
    (m) => m.userId === room.hostId || m.isReady,
  );

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

  const handleJoinRoom = async () => {
    try {
      await joinRoom({ roomCode });
    } catch (err) {
      console.error("Failed to join room:", err);
    }
  };

  const handleLeaveRoom = async () => {
    try {
      await leaveRoom({ roomCode });
      void navigate({ to: "/" });
    } catch (err) {
      console.error("Failed to leave room:", err);
    }
  };

  const handleKickPlayer = async (playerId: Id<"users">) => {
    try {
      await kickPlayer({ roomCode, playerUserId: playerId });
    } catch (err) {
      console.error("Failed to kick player:", err);
    }
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
              <div className="text-3xl font-mono font-bold tracking-wider">
                {roomCode}
              </div>
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
              Players ({room.members.length})
            </h2>

            <div className="space-y-2 mt-4">
              {room.members.map((member) => (
                <div
                  key={member._id}
                  className="flex items-center justify-between p-3 bg-base-100 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium">{member.name}</span>
                    {member.userId === room.hostId && (
                      <Crown className="w-4 h-4 text-warning" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {member.userId !== room.hostId &&
                      (member.isReady ? (
                        <>
                          <CheckCircle className="w-5 h-5 text-success" />
                          <span className="text-sm text-success">Ready</span>
                        </>
                      ) : (
                        <>
                          <Circle className="w-5 h-5 text-base-content/50" />
                          <span className="text-sm opacity-50">Not Ready</span>
                        </>
                      ))}
                    {isHost && member.userId !== room.hostId && (
                      <KickButton
                        onClick={() => void handleKickPlayer(member.userId)}
                        size="sm"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="divider"></div>

            {isHost && (
              <form
                id="game-settings-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void wordCountForm.handleSubmit();
                }}
                className="mb-4"
              >
                <div className="p-4 bg-base-100 rounded-lg">
                  <h3 className="flex items-center gap-2 font-medium mb-3">
                    <Settings className="w-4 h-4" />
                    Word Count Range
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="px-2 mt-8">
                        <wordCountForm.Field name="minWordCount">
                          {(minField) => (
                            <wordCountForm.Field name="maxWordCount">
                              {(maxField) => (
                                <DualRangeSlider
                                  min={10}
                                  max={500}
                                  step={10}
                                  minValue={minField.state.value}
                                  maxValue={maxField.state.value}
                                  onMinChange={minField.handleChange}
                                  onMaxChange={maxField.handleChange}
                                />
                              )}
                            </wordCountForm.Field>
                          )}
                        </wordCountForm.Field>
                        <div className="h-5 mt-1">
                          <wordCountForm.Field name="minWordCount">
                            {(field) => (
                              <>
                                {!field.state.meta.isValid &&
                                  field.state.meta.errors.length > 0 && (
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
                                {!field.state.meta.isValid &&
                                  field.state.meta.errors.length > 0 && (
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
              </form>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {!currentMember && (
                <button
                  className="btn btn-primary"
                  onClick={() => void handleJoinRoom()}
                >
                  Join Room
                </button>
              )}

              {currentMember && !isHost && (
                <button
                  className={`btn ${currentMember.isReady ? "btn-outline" : "btn-primary"}`}
                  onClick={() => void handleToggleReady()}
                >
                  {currentMember.isReady ? "Not Ready" : "Ready"}
                </button>
              )}

              {isHost && (
                <button
                  type="submit"
                  form="game-settings-form"
                  className="btn btn-success"
                  disabled={
                    (!allReady && !isSoloRoom) ||
                    !wordCountForm.state.canSubmit ||
                    wordCountForm.state.isSubmitting
                  }
                >
                  {isSoloRoom ? "Start Solo Race" : "Start Game"}
                </button>
              )}

              {currentMember && (
                <button
                  className="btn btn-outline btn-error"
                  onClick={() => void handleLeaveRoom()}
                >
                  <LogOut className="w-4 h-4" />
                  Leave Room
                </button>
              )}
            </div>

            {isHost && !allReady && !isSoloRoom && (
              <p className="text-center text-sm opacity-70 mt-2">
                Waiting for other players to be ready
              </p>
            )}

            {isSoloRoom && (
              <p className="text-center text-sm opacity-70 mt-2">
                Ready to start your solo race!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
