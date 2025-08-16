import { SignInButton } from "@clerk/clerk-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { Keyboard, LogIn } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import { api } from "../../convex/_generated/api";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="text-center max-w-4xl mx-auto">
      <div className="not-prose flex justify-center mb-4">
        <Keyboard className="w-16 h-16 text-primary" />
      </div>
      <h1>Type Harder</h1>
      <p className="text-xl opacity-70">
        Race through The Sequences, one paragraph at a time
      </p>

      <Unauthenticated>
        <div className="not-prose mt-8">
          <SignInButton mode="modal">
            <button className="btn btn-primary btn-lg">
              Sign In to Start Racing
            </button>
          </SignInButton>
        </div>
      </Unauthenticated>

      <Authenticated>
        <GameOptions />
      </Authenticated>
    </div>
  );
}

const joinRoomSchema = z.object({
  roomCode: z
    .string()
    .min(1, "Room code is required")
    .length(6, "Room code must be 6 characters")
    .transform((v) => v.toUpperCase()),
});

function GameOptions() {
  const navigate = useNavigate();
  const createRoom = useMutation(api.games.createRoom);
  const joinRoomMutation = useMutation(api.games.joinRoom);
  const activeRoom = useQuery(api.games.getUserActiveRoom);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  const joinForm = useForm({
    defaultValues: {
      roomCode: "",
    },
    validators: {
      onChange: joinRoomSchema,
    },
    onSubmit: async ({ value }) => {
      setError("");
      try {
        await joinRoomMutation({ roomCode: value.roomCode });
        void navigate({
          to: "/room/$roomCode",
          params: { roomCode: value.roomCode },
        });
      } catch {
        setError("Room not found or game already started");
      }
    },
  });

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError("");
    try {
      const { roomCode } = await createRoom();
      void navigate({ to: "/room/$roomCode", params: { roomCode } });
    } catch {
      setError("Failed to create room");
      setIsCreating(false);
    }
  };

  return (
    <div className="not-prose mt-8 space-y-8">
      {activeRoom && (
        <div className="card bg-warning/20 border-2 border-warning max-w-md mx-auto">
          <div className="card-body">
            <h2 className="card-title justify-center">Active Room</h2>
            <p className="text-center text-sm opacity-70">
              You're already in a room!
            </p>
            <div className="card-actions justify-center mt-4">
              <button
                onClick={() => void navigate({ to: "/room/$roomCode", params: { roomCode: activeRoom.roomCode } })}
                className="btn btn-warning"
              >
                <LogIn className="w-4 h-4" />
                Rejoin Room {activeRoom.roomCode}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card bg-base-200 max-w-md mx-auto">
        <div className="card-body">
          <h2 className="card-title justify-center">Create a New Race</h2>
          <p className="text-center opacity-70">
            Start a typing race and invite your friends
          </p>
          <div className="card-actions justify-center mt-4">
            <button
              className="btn btn-primary btn-lg"
              onClick={() => void handleCreateRoom()}
              disabled={isCreating}
            >
              {isCreating ? "Creating..." : "Create Room"}
            </button>
          </div>
        </div>
      </div>

      <div className="divider">OR</div>

      <div className="card bg-base-200 max-w-md mx-auto">
        <div className="card-body">
          <h2 className="card-title justify-center">Join a Race</h2>
          <p className="text-center opacity-70">
            Enter a room code to join an existing race
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void joinForm.handleSubmit();
            }}
            className="mt-4"
          >
            <joinForm.Field name="roomCode">
              {(field) => (
                <div>
                  <div className="join w-full">
                    <input
                      type="text"
                      placeholder="Enter room code"
                      className={`input input-bordered join-item flex-1 text-center uppercase ${
                        !field.state.meta.isValid ? "input-error" : ""
                      }`}
                      value={field.state.value}
                      onChange={(e) =>
                        field.handleChange(
                          e.target.value.toUpperCase().slice(0, 6),
                        )
                      }
                      onBlur={field.handleBlur}
                      maxLength={6}
                      disabled={joinForm.state.isSubmitting}
                    />
                    <button
                      className="btn btn-primary join-item"
                      type="submit"
                      disabled={
                        !joinForm.state.canSubmit || joinForm.state.isSubmitting
                      }
                    >
                      {joinForm.state.isSubmitting ? "Joining..." : "Join"}
                    </button>
                  </div>
                  {!field.state.meta.isValid &&
                    field.state.meta.errors.length > 0 && (
                      <em className="text-error text-sm mt-1 block">
                        {field.state.meta.errors[0]?.message}
                      </em>
                    )}
                </div>
              )}
            </joinForm.Field>
          </form>
        </div>
      </div>

      {error && (
        <div className="alert alert-error max-w-md mx-auto">
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
