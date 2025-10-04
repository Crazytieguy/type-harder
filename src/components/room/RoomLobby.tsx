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
import ParagraphSelector from "./ParagraphSelector";

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
  const [selectedParagraphId, setSelectedParagraphId] = useState<Id<"paragraphs"> | null>(null);
  const [paragraphMode, setParagraphMode] = useState<"random" | "next" | "choose">("random");
  const [error, setError] = useState<string | null>(null);
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
        setError(null);
        await startGame({
          roomCode,
          minWordCount: value.minWordCount,
          maxWordCount: value.maxWordCount,
          specificParagraphId: selectedParagraphId || undefined,
        });
      } catch (err) {
        console.error("Failed to start game:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to start game. Please try again.";
        setError(errorMessage);
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
    <div className="max-w-6xl mx-auto px-4">
      <div className="text-center mb-8">
        <h1 className="mt-0">Game Lobby</h1>

        <div className="not-prose mt-6">
          <div className="card bg-base-300 border border-base-content/10 max-w-sm mx-auto">
            <div className="card-body p-6">
              <div className="text-sm font-medium opacity-70 mb-2">Room Code</div>
              <div className="text-4xl font-mono font-bold text-base-content">
                {roomCode}
              </div>
              <button
                className="btn btn-sm btn-primary mt-4"
                onClick={handleCopyCode}
              >
                <Copy className="w-4 h-4 mr-2" />
                {copied ? "Copied!" : "Copy Code"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="not-prose grid lg:grid-cols-2 gap-6">
        <div className="card bg-base-200 shadow-lg">
          <div className="card-body">
            <h2 className="card-title mb-4">
              <Users className="w-5 h-5" />
              Players
              <div className="badge badge-neutral ml-auto">{room.members.length}</div>
            </h2>

            <div className="space-y-2">
              {room.members.map((member) => (
                <div
                  key={member._id}
                  className="card bg-base-100 transition-all duration-200 hover:shadow-md hover:scale-[1.01]"
                >
                  <div className="card-body p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`avatar avatar-placeholder ${member.isReady ? "avatar-online" : ""}`}>
                          <div className="bg-neutral text-neutral-content w-10 rounded-full">
                            <span className="text-lg">{member.name[0]?.toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{member.name}</span>
                            {member.userId === room.hostId && (
                              <Crown className="w-4 h-4 text-warning flex-shrink-0" />
                            )}
                          </div>
                          {member.userId !== room.hostId && (
                            <div className="text-xs opacity-60 mt-0.5">
                              {member.isReady ? "Ready to race" : "Getting ready..."}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {member.userId !== room.hostId &&
                          (member.isReady ? (
                            <div className="badge badge-success badge-sm gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Ready
                            </div>
                          ) : (
                            <div className="badge badge-ghost badge-sm gap-1">
                              <Circle className="w-3 h-3" />
                              Waiting
                            </div>
                          ))}
                        {isHost && member.userId !== room.hostId && (
                          <KickButton
                            onClick={() => void handleKickPlayer(member.userId)}
                            size="sm"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-auto pt-4">
              <div className="flex flex-col gap-2">
                {!currentMember && (
                  <button
                    className="btn btn-primary btn-lg w-full"
                    onClick={() => void handleJoinRoom()}
                  >
                    Join Room
                  </button>
                )}

                {currentMember && !isHost && (
                  <button
                    className={`btn btn-lg w-full ${currentMember.isReady ? "btn-outline" : "btn-primary"}`}
                    onClick={() => void handleToggleReady()}
                  >
                    {currentMember.isReady ? (
                      <>
                        <Circle className="w-5 h-5" />
                        Mark as Not Ready
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        I'm Ready!
                      </>
                    )}
                  </button>
                )}

                {currentMember && (
                  <button
                    className="btn btn-outline btn-error w-full"
                    onClick={() => void handleLeaveRoom()}
                  >
                    <LogOut className="w-4 h-4" />
                    Leave Room
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-lg">
          <div className="card-body">
            <h2 className="card-title mb-4">
              <Settings className="w-5 h-5" />
              Game Settings
            </h2>

            {isHost ? (
              <form
                id="game-settings-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void wordCountForm.handleSubmit();
                }}
                className="flex-1 flex flex-col"
              >
                <div className="flex-1">
                  <ParagraphSelector
                    selectedParagraphId={selectedParagraphId}
                    onSelectParagraph={setSelectedParagraphId}
                    onModeChange={setParagraphMode}
                  />

                  {paragraphMode === "random" && (
                    <div className="mt-6 p-4 bg-base-100 rounded-lg">
                      <div className="text-sm font-medium mb-4">Word Count Range</div>
                      <div className="px-2 mt-6">
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
                  )}
                </div>

                <div className="mt-6">
                  <button
                    type="submit"
                    className={`btn btn-success btn-lg w-full transition-all ${
                      (allReady || isSoloRoom) &&
                      wordCountForm.state.canSubmit &&
                      !wordCountForm.state.isSubmitting
                        ? "animate-pulse"
                        : ""
                    }`}
                    disabled={
                      (!allReady && !isSoloRoom) ||
                      !wordCountForm.state.canSubmit ||
                      wordCountForm.state.isSubmitting
                    }
                  >
                    {isSoloRoom ? "Start Solo Race" : "Start Game"}
                  </button>

                  {!allReady && !isSoloRoom && (
                    <p className="text-center text-sm opacity-70 mt-3">
                      Waiting for all players to be ready...
                    </p>
                  )}

                  {error && (
                    <div className="alert alert-error mt-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              </form>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <div className="w-16 h-16 bg-base-300 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Settings className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="text-lg font-medium mb-2">Host is Configuring</p>
                  <p className="text-sm opacity-60">
                    The host is setting up the game parameters. Get ready to race!
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
