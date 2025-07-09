import { SignInButton } from "@clerk/clerk-react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Authenticated, Unauthenticated, useMutation } from "convex/react";
import { Keyboard } from "lucide-react";
import { useState } from "react";
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
      <p className="text-xl opacity-70">Race through The Sequences, one paragraph at a time</p>

      <Unauthenticated>
        <div className="not-prose mt-8">
          <SignInButton mode="modal">
            <button className="btn btn-primary btn-lg">Sign In to Start Racing</button>
          </SignInButton>
        </div>
      </Unauthenticated>

      <Authenticated>
        <GameOptions />
      </Authenticated>
    </div>
  );
}

function GameOptions() {
  const navigate = useNavigate();
  const createRoom = useMutation(api.games.createRoom);
  const joinRoom = useMutation(api.games.joinRoom);
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");

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

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;

    setIsJoining(true);
    setError("");
    try {
      await joinRoom({ roomCode: joinCode.toUpperCase() });
      void navigate({ to: "/room/$roomCode", params: { roomCode: joinCode.toUpperCase() } });
    } catch {
      setError("Room not found or game already started");
      setIsJoining(false);
    }
  };

  return (
    <div className="not-prose mt-8 space-y-8">
      <div className="card bg-base-200 max-w-md mx-auto">
        <div className="card-body">
          <h2 className="card-title justify-center">Create a New Race</h2>
          <p className="text-center opacity-70">Start a typing race and invite your friends</p>
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
          <p className="text-center opacity-70">Enter a room code to join an existing race</p>
          
          <form onSubmit={(e) => void handleJoinRoom(e)} className="mt-4">
            <div className="join w-full">
              <input
                type="text"
                placeholder="Enter room code"
                className="input input-bordered join-item flex-1 text-center uppercase"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                maxLength={6}
                disabled={isJoining}
              />
              <button 
                className="btn btn-primary join-item"
                type="submit"
                disabled={isJoining || !joinCode.trim()}
              >
                {isJoining ? "Joining..." : "Join"}
              </button>
            </div>
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
