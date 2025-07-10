import { useConvexMutation } from "@convex-dev/react-query";
import { useMutation } from "@tanstack/react-query";
import type { JSX } from "react";
import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import type { RoomWithGame } from "../../types/room";

interface RaceViewProps {
  room: RoomWithGame;
}

// Character status helper
const getCharacterStatus = (
  position: number,
  typedLength: number
): 'typed-correct' | 'typed-incorrect' | 'current' | 'untyped' => {
  if (position >= typedLength) {
    return position === typedLength ? 'current' : 'untyped';
  }
  
  // For now, we assume all typed characters are correct
  // since we validate on input
  return 'typed-correct';
};

export default function RaceView({ room: { roomCode, game, ...room } }: RaceViewProps) {
  const currentPlayer = game.players.find((p) => p.userId === room.currentUserId);
  const wordsCompleted = currentPlayer?.wordsCompleted ?? 0;
  
  // Extract typing content (without markdown) for validation
  const typingContent = normalizeQuotes(extractTypingContent(game.paragraph.content));
  const wordEndIndices: number[] = [];
  const matches = typingContent.matchAll(/\s(?=\S)/g);
  for (const match of matches) {
    wordEndIndices.push(match.index + 1);
  }
  wordEndIndices.push(typingContent.length);
  const completedIdx = wordEndIndices[wordsCompleted - 1] ?? 0;
  const completedText = typingContent.slice(0, completedIdx);

  const [currentIdx, setCurrentIdx] = useState(completedIdx);
  const [errorPosition, setErrorPosition] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const currentWordProgress = typingContent.slice(completedIdx, currentIdx);

  const { mutate: updateProgress } = useMutation({
    mutationFn: useConvexMutation(
      api.games.updateProgress,
    ).withOptimisticUpdate((localStore, args) => {
      const currentRoom = localStore.getQuery(api.games.getRoom, { roomCode });
      if (currentRoom && currentRoom.game) {
        const updatedPlayers = currentRoom.game.players.map((player) => {
          if (player.userId === room.currentUserId) {
            return { ...player, wordsCompleted: args.wordsCompleted };
          }
          return player;
        });
        localStore.setQuery(
          api.games.getRoom,
          { roomCode },
          {
            ...currentRoom,
            game: {
              ...currentRoom.game,
              players: updatedPlayers,
            },
          },
        );
      }
    }),
  });

  const elapsedSeconds = game?.startTime 
    ? (Date.now() - game.startTime) / 1000 
    : 0;
  
  const wpm = elapsedSeconds > 0 
    ? Math.round((wordsCompleted / elapsedSeconds) * 60) 
    : 0;


  // Render a single character with status
  const renderCharacter = (char: string, status: 'typed-correct' | 'typed-incorrect' | 'current' | 'untyped', key: number, position: number) => {
    let className = "";
    
    switch (status) {
      case 'typed-correct':
        className = "text-success";
        break;
      case 'typed-incorrect':
        className = "bg-error text-error-content";
        break;
      case 'current':
        className = "relative";
        break;
      case 'untyped':
        className = "text-base-content/50";
        break;
    }
    
    // Add shake animation for error feedback at specific position
    if (errorPosition === position) {
      className = "bg-error text-error-content animate-[shake_0.2s_ease-in-out] font-bold";
    }
    
    // Special rendering for cursor position
    if (status === 'current') {
      // Make spaces visible when they're the current character
      const displayChar = char === ' ' ? '\u00A0' : char; // Use non-breaking space for visibility
      return (
        <span key={key} className="relative inline-block">
          <span className="absolute -left-[1px] top-0 bottom-0 w-[2px] bg-primary animate-pulse"></span>
          <span className={className}>{displayChar}</span>
        </span>
      );
    }
    
    return (
      <span key={key} className={className}>
        {char}
      </span>
    );
  };

  // Render the paragraph with markdown formatting and character status
  const renderFormattedParagraph = () => {
    const displayText = game.paragraph?.content || "";
    const elements: JSX.Element[] = [];
    
    let displayPos = 0;
    let typingPos = 0;
    let key = 0;
    
    // Parse and render the markdown while tracking positions
    while (displayPos < displayText.length) {
      // Check for bold at current position
      if (displayText.substring(displayPos).startsWith('**')) {
        const endIndex = displayText.indexOf('**', displayPos + 2);
        if (endIndex !== -1) {
          // Skip the opening **
          displayPos += 2;
          const boldContent: JSX.Element[] = [];
          
          // Process characters inside bold
          while (displayPos < endIndex) {
            const char = displayText[displayPos];
            const status = getCharacterStatus(typingPos, currentIdx);
            boldContent.push(renderCharacter(char, status, key++, typingPos));
            displayPos++;
            typingPos++;
          }
          
          elements.push(<strong key={`bold-${key++}`}>{boldContent}</strong>);
          displayPos += 2; // Skip closing **
          continue;
        }
      }
      
      // Check for italic at current position
      if (displayText.substring(displayPos).startsWith('*') && 
          !displayText.substring(displayPos).startsWith('**')) {
        const endIndex = displayText.indexOf('*', displayPos + 1);
        if (endIndex !== -1) {
          // Skip the opening *
          displayPos += 1;
          const italicContent: JSX.Element[] = [];
          
          // Process characters inside italic
          while (displayPos < endIndex) {
            const char = displayText[displayPos];
            const status = getCharacterStatus(typingPos, currentIdx);
            italicContent.push(renderCharacter(char, status, key++, typingPos));
            displayPos++;
            typingPos++;
          }
          
          elements.push(<em key={`italic-${key++}`}>{italicContent}</em>);
          displayPos += 1; // Skip closing *
          continue;
        }
      }
      
      // Check for link at current position
      if (displayText.substring(displayPos).startsWith('[')) {
        const linkEndIndex = displayText.indexOf('](', displayPos);
        if (linkEndIndex !== -1) {
          const urlEndIndex = displayText.indexOf(')', linkEndIndex);
          if (urlEndIndex !== -1) {
            // Process link text
            displayPos += 1; // Skip [
            const linkContent: JSX.Element[] = [];
            
            while (displayPos < linkEndIndex) {
              const char = displayText[displayPos];
              const status = getCharacterStatus(typingPos, currentIdx);
              linkContent.push(renderCharacter(char, status, key++, typingPos));
              displayPos++;
              typingPos++;
            }
            
            elements.push(<span key={`link-${key++}`}>{linkContent}</span>);
            
            // Skip the ](url) part
            displayPos = urlEndIndex + 1;
            continue;
          }
        }
      }
      
      // Regular character
      const char = displayText[displayPos];
      const status = getCharacterStatus(typingPos, currentIdx);
      elements.push(renderCharacter(char, status, key++, typingPos));
      displayPos++;
      typingPos++;
    }
    
    // Add cursor at the end if we've typed everything
    if (currentIdx === typingContent.length) {
      elements.push(
        <span key={`cursor-${key++}`} className="relative inline-block">
          <span className="absolute -left-[1px] top-0 bottom-0 w-[2px] bg-primary animate-pulse"></span>
          <span>&nbsp;</span>
        </span>
      );
    }
    
    return elements;
  };

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newInput = normalizeQuotes(e.target.value);
    
    // Clear error feedback
    setErrorPosition(null);
    
    // Calculate the full typed text (what was completed + new input)
    const potentialFullText = completedText + newInput;

    // Block all deletion - only allow forward typing
    if (potentialFullText.length < currentIdx) {
      return;
    }
    
    // Don't allow typing beyond the paragraph
    if (potentialFullText.length > typingContent.length) {
      return;
    }
    
    // Check if what they're typing matches what's expected
    let matches = true;
    for (let i = currentIdx; i < potentialFullText.length; i++) {
      const expectedChar = normalizeChar(typingContent[i]);
      const typedChar = normalizeChar(potentialFullText[i]);
      if (expectedChar !== typedChar) {
        matches = false;
        break;
      }
    }
    
    if (!matches) {
      // Show error feedback at the position they're trying to type
      setErrorPosition(currentIdx);
      setTimeout(() => setErrorPosition(null), 300);
      return;
    }
    
    // Update current word progress - this is everything after completed text
    setCurrentIdx(potentialFullText.length);
    
    if (potentialFullText.length >= wordEndIndices[wordsCompleted]) {
      try {
        updateProgress({ roomCode, wordsCompleted: wordsCompleted + 1 });
      } catch (err) {
        console.error("Failed to update progress:", err);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent default behavior for certain keys if at the end
    if (currentIdx === typingContent.length && e.key !== "Backspace") {
      e.preventDefault();
    }
  };

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
            <span className="font-bold text-primary">{wordsCompleted}/{wordEndIndices.length - 1}</span>
          </div>
        </div>
      </div>

      <div className="not-prose">
        {/* Paragraph Display */}
        <div className="card bg-base-200 mb-6">
          <div className="card-body">
            <div 
              className="text-lg leading-relaxed font-mono cursor-text select-none"
              onClick={() => inputRef.current?.focus()}
            >
              {renderFormattedParagraph()}
            </div>
            
            <div className="text-sm opacity-70 mt-4">
              <div className="flex flex-col gap-1">
                <div className="flex gap-2">
                  <span className="font-semibold">Source:</span>
                  <span>{game.paragraph.bookTitle} → {game.paragraph.sequenceTitle} → {game.paragraph.articleTitle}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold">Article:</span>
                  <a href={game.paragraph.articleUrl} target="_blank" rel="noopener noreferrer" className="link link-primary">
                    View original article
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Hidden Input Field for capturing keystrokes */}
        <input
          ref={inputRef}
          type="text"
          value={currentWordProgress}
          onChange={(e) => void handleInputChange(e)}
          onKeyDown={handleKeyDown}
          className="absolute -left-[10000px] top-0 w-1 h-1"
          disabled={currentIdx === typingContent.length}
          autoFocus
          aria-label="Type the paragraph"
        />
        
        {/* Helpful hint */}
        <div className="text-center text-sm opacity-70 mb-6">
          {currentIdx === typingContent.length ? (
            <span className="text-success">Race completed! 🎉</span>
          ) : (
            <span>Click on the paragraph above and start typing</span>
          )}
        </div>

        {/* Progress Bars */}
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title mb-4">Race Progress</h2>
            <div className="space-y-3">
              {game?.players?.map((player: any) => {
                const playerProgress = (player.wordsCompleted / (wordEndIndices.length - 1)) * 100;
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

// Extract plain text from markdown for typing (removes formatting and links)
const extractTypingContent = (markdown: string) => {
  return markdown
    // Remove links: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove bold: **text** -> text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    // Remove italic: *text* -> text (but not ** patterns)
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '$1')
    // Normalize multiple spaces to single space
    .replace(/ +/g, ' ')
    .trim();
};

const normalizeQuotes = (text: string) => {
  // Only normalize the most common smart quotes
  return text
    .replace(/[\u201C\u201D]/g, '"')  // Smart double quotes
    .replace(/[\u2018\u2019]/g, "'"); // Smart single quotes
};

const normalizeChar = (char: string) => {
  // Simple character normalization for comparison
  if (char === '\u201C' || char === '\u201D') return '"';
  if (char === '\u2018' || char === '\u2019') return "'";
  return char;
};
