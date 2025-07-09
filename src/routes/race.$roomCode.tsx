import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { useUser } from "@clerk/clerk-react";

export const Route = createFileRoute("/race/$roomCode")({
  loader: async ({ context: { queryClient }, params: { roomCode } }) => {
    const queryOptions = convexQuery(api.games.getRoom, { roomCode });
    return await queryClient.ensureQueryData(queryOptions);
  },
  component: RacePage,
});

function RacePage() {
  const { roomCode } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  
  const roomQueryOptions = convexQuery(api.games.getRoom, { roomCode });
  const { data: room } = useSuspenseQuery(roomQueryOptions);
  
  // Polling for real-time updates
  const roomLive = useQuery(api.games.getRoom, { roomCode });
  
  const updateProgress = useMutation(api.games.updateProgress);
  
  const [currentInput, setCurrentInput] = useState("");
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Navigate to results if game is finished
  useEffect(() => {
    if (roomLive?.status === "finished") {
      void navigate({ to: "/results/$roomCode", params: { roomCode } });
    }
  }, [roomLive?.status, navigate, roomCode]);

  if (!room || room.status !== "playing" || !room.paragraph) {
    return (
      <div className="text-center">
        <h1>Race Not Active</h1>
        <p>This race hasn't started yet or has already finished.</p>
      </div>
    );
  }

  const words = room.paragraph.content.split(" ");
  const currentWord = words[currentWordIndex];
  const isLastWord = currentWordIndex === words.length - 1;
  
  const currentPlayer = room.players.find(p => {
    const playerUser = roomLive?.players.find(rp => rp._id === p._id);
    return playerUser && user && playerUser.name === user.fullName;
  });

  const elapsedSeconds = roomLive?.startTime 
    ? (Date.now() - roomLive.startTime) / 1000 
    : 0;
  
  const wpm = elapsedSeconds > 0 
    ? Math.round((wordsCompleted / elapsedSeconds) * 60) 
    : 0;

  const normalizeQuotes = (text: string) => {
    // Replace curly/smart quotes with regular quotes
    return text
      .replace(/[""]/g, '"')  // Replace smart double quotes
      .replace(/['']/g, "'"); // Replace smart single quotes
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Prevent typing spaces at the beginning
    if (value.startsWith(" ")) {
      return;
    }
    
    setCurrentInput(value);
    
    // Check if the current word (with space for non-last words) is typed correctly
    const expectedInput = isLastWord ? currentWord : currentWord + " ";
    
    // Normalize quotes for comparison
    if (normalizeQuotes(value) === normalizeQuotes(expectedInput)) {
      // Word completed correctly
      const newWordsCompleted = wordsCompleted + 1;
      setWordsCompleted(newWordsCompleted);
      
      // Update backend
      try {
        await updateProgress({ roomCode, wordsCompleted: newWordsCompleted });
      } catch (err) {
        console.error("Failed to update progress:", err);
      }
      
      if (!isLastWord) {
        // Move to next word
        setCurrentWordIndex(currentWordIndex + 1);
        setCurrentInput("");
      } else {
        // Race finished!
        setCurrentInput(value); // Keep the final word visible
      }
    }
  };

  const expectedInput = isLastWord ? currentWord : currentWord + " ";
  const isCorrectSoFar = normalizeQuotes(expectedInput)?.startsWith(normalizeQuotes(currentInput)) || false;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <h1>Type the Paragraph!</h1>
        <div className="not-prose flex justify-center gap-8 text-lg">
          <div>
            <span className="opacity-70">WPM: </span>
            <span className="font-bold text-primary">{wpm}</span>
          </div>
          <div>
            <span className="opacity-70">Progress: </span>
            <span className="font-bold text-primary">{wordsCompleted}/{words.length}</span>
          </div>
        </div>
      </div>

      <div className="not-prose">
        {/* Paragraph Display */}
        <div className="card bg-base-200 mb-6">
          <div className="card-body">
            <div className="text-lg leading-relaxed font-mono">
              {words.map((word, index) => {
                const isCompleted = index < currentWordIndex;
                const isCurrent = index === currentWordIndex;
                const isTyped = isCurrent && currentInput.length > 0;
                
                return (
                  <span key={index}>
                    <span
                      className={`
                        ${isCompleted ? "text-success" : ""}
                        ${isCurrent && !isCorrectSoFar ? "bg-error/20" : ""}
                        ${isCurrent && isCorrectSoFar && isTyped ? "bg-primary/20" : ""}
                        ${isCurrent && !isTyped ? "bg-base-content/10" : ""}
                      `}
                    >
                      {word}
                    </span>
                    {index < words.length - 1 && " "}
                  </span>
                );
              })}
            </div>
            
            <div className="text-sm opacity-70 mt-4">
              <div className="flex flex-col gap-1">
                <div className="flex gap-2">
                  <span className="font-semibold">Source:</span>
                  <span>{room.paragraph.bookTitle} → {room.paragraph.sequenceTitle} → {room.paragraph.articleTitle}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold">Article:</span>
                  <a href={room.paragraph.articleUrl} target="_blank" rel="noopener noreferrer" className="link link-primary">
                    View original article
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Input Field */}
        <div className="card bg-base-100 border border-base-300 mb-6">
          <div className="card-body">
            <input
              ref={inputRef}
              type="text"
              value={currentInput}
              onChange={(e) => void handleInputChange(e)}
              className={`input input-lg font-mono w-full ${
                !isCorrectSoFar && currentInput ? "input-error" : ""
              }`}
              placeholder="Type the current word..."
              disabled={wordsCompleted === words.length}
              autoFocus
            />
          </div>
        </div>

        {/* Progress Bars */}
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title mb-4">Race Progress</h2>
            <div className="space-y-3">
              {roomLive?.players.map((player) => {
                const playerProgress = (player.wordsCompleted / words.length) * 100;
                const playerWpm = elapsedSeconds > 0 
                  ? Math.round((player.wordsCompleted / elapsedSeconds) * 60) 
                  : 0;
                const isCurrentUser = currentPlayer && player._id === currentPlayer._id;
                
                return (
                  <div key={player._id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className={`font-medium ${isCurrentUser ? "text-primary" : ""}`}>
                        {player.name} {isCurrentUser && "(You)"}
                      </span>
                      <span className="opacity-70">
                        {player.finishedAt ? "Finished!" : `${playerWpm} WPM`}
                      </span>
                    </div>
                    <progress 
                      className={`progress w-full ${
                        player.finishedAt ? "progress-success" : 
                        isCurrentUser ? "progress-primary" : "progress-secondary"
                      }`} 
                      value={playerProgress} 
                      max="100"
                    ></progress>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}