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
  typedLength: number,
): "typed-correct" | "typed-incorrect" | "current" | "untyped" => {
  if (position >= typedLength) {
    return position === typedLength ? "current" : "untyped";
  }

  // For now, we assume all typed characters are correct
  // since we validate on input
  return "typed-correct";
};

export default function RaceView({
  room: { roomCode, game, ...room },
}: RaceViewProps) {
  const currentPlayer = game.players.find(
    (p) => p.userId === room.currentUserId,
  );
  const wordsCompleted = currentPlayer?.wordsCompleted ?? 0;

  // Extract typing content (without markdown) for validation
  const typingContent = normalizeQuotes(
    extractTypingContent(game.paragraph.content),
  );
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

  const wpm =
    elapsedSeconds > 0 ? Math.round((wordsCompleted / elapsedSeconds) * 60) : 0;

  // Render a single character with status
  const renderCharacter = (
    char: string,
    status: "typed-correct" | "typed-incorrect" | "current" | "untyped",
    key: number,
    position: number,
  ) => {
    let className = "";

    switch (status) {
      case "typed-correct":
        className = "text-success";
        break;
      case "typed-incorrect":
        className = "bg-error text-error-content";
        break;
      case "current":
        className = "relative";
        break;
      case "untyped":
        className = "text-base-content/50";
        break;
    }

    // Add shake animation for error feedback at specific position
    if (errorPosition === position) {
      className =
        "bg-error text-error-content animate-[shake_0.2s_ease-in-out] font-bold";
    }

    // Special rendering for cursor position
    if (status === "current") {
      // Make spaces visible when they're the current character
      const displayChar = char === " " ? "\u00A0" : char; // Use non-breaking space for visibility
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

  // Token types for parsing
  type Token =
    | {
        type: "text";
        content: string;
        displayStart: number;
        displayEnd: number;
        typingStart: number;
        typingEnd: number;
      }
    | {
        type: "bold";
        tokens: Token[];
        displayStart: number;
        displayEnd: number;
      }
    | {
        type: "italic";
        tokens: Token[];
        displayStart: number;
        displayEnd: number;
      }
    | {
        type: "link";
        tokens: Token[];
        url: string;
        displayStart: number;
        displayEnd: number;
      };

  // Tokenize the markdown text into words and formatting
  const tokenizeMarkdown = (text: string): Token[] => {
    const tokens: Token[] = [];
    let displayPos = 0;
    let typingPos = 0;

    while (displayPos < text.length) {
      // Check for bold
      if (text.substring(displayPos).startsWith("**")) {
        const endIndex = text.indexOf("**", displayPos + 2);
        if (endIndex !== -1) {
          const innerText = text.substring(displayPos + 2, endIndex);
          const innerTokens = tokenizeText(
            innerText,
            displayPos + 2,
            typingPos,
          );
          tokens.push({
            type: "bold",
            tokens: innerTokens,
            displayStart: displayPos,
            displayEnd: endIndex + 2,
          });
          displayPos = endIndex + 2;
          typingPos += innerText.length;
          continue;
        }
      }

      // Check for italic
      if (
        text.substring(displayPos).startsWith("*") &&
        !text.substring(displayPos).startsWith("**")
      ) {
        const endIndex = text.indexOf("*", displayPos + 1);
        if (endIndex !== -1) {
          const innerText = text.substring(displayPos + 1, endIndex);
          const innerTokens = tokenizeText(
            innerText,
            displayPos + 1,
            typingPos,
          );
          tokens.push({
            type: "italic",
            tokens: innerTokens,
            displayStart: displayPos,
            displayEnd: endIndex + 1,
          });
          displayPos = endIndex + 1;
          typingPos += innerText.length;
          continue;
        }
      }

      // Check for link
      if (text.substring(displayPos).startsWith("[")) {
        const linkEndIndex = text.indexOf("](", displayPos);
        if (linkEndIndex !== -1) {
          const urlEndIndex = text.indexOf(")", linkEndIndex);
          if (urlEndIndex !== -1) {
            const linkText = text.substring(displayPos + 1, linkEndIndex);
            const url = text.substring(linkEndIndex + 2, urlEndIndex);
            const innerTokens = tokenizeText(
              linkText,
              displayPos + 1,
              typingPos,
            );
            tokens.push({
              type: "link",
              tokens: innerTokens,
              url,
              displayStart: displayPos,
              displayEnd: urlEndIndex + 1,
            });
            displayPos = urlEndIndex + 1;
            typingPos += linkText.length;
            continue;
          }
        }
      }

      // Regular text - find the next word boundary or formatting marker
      let endPos = displayPos;
      while (
        endPos < text.length &&
        !text.substring(endPos).startsWith("**") &&
        !text.substring(endPos).startsWith("*") &&
        !text.substring(endPos).startsWith("[")
      ) {
        endPos++;
      }

      if (endPos > displayPos) {
        const content = text.substring(displayPos, endPos);
        const textTokens = tokenizeText(content, displayPos, typingPos);
        tokens.push(...textTokens);
        typingPos += content.length;
        displayPos = endPos;
      }
    }

    return tokens;
  };

  // Tokenize plain text into words
  const tokenizeText = (
    text: string,
    displayOffset: number,
    typingOffset: number,
  ): Token[] => {
    const tokens: Token[] = [];
    let pos = 0;

    while (pos < text.length) {
      // Find word boundary (including trailing spaces)
      let wordEnd = pos;
      while (wordEnd < text.length && text[wordEnd] !== " ") {
        wordEnd++;
      }
      // Include trailing spaces with the word
      while (wordEnd < text.length && text[wordEnd] === " ") {
        wordEnd++;
      }

      if (wordEnd > pos) {
        tokens.push({
          type: "text",
          content: text.substring(pos, wordEnd),
          displayStart: displayOffset + pos,
          displayEnd: displayOffset + wordEnd,
          typingStart: typingOffset + pos,
          typingEnd: typingOffset + wordEnd,
        });
        pos = wordEnd;
      }
    }

    return tokens;
  };

  // Render a token with character-level styling
  const renderToken = (token: Token, keyPrefix: string): JSX.Element => {
    switch (token.type) {
      case "text": {
        // Split into actual words and spaces
        const words: JSX.Element[] = [];
        let currentWord: JSX.Element[] = [];
        let wordKey = 0;

        for (let i = 0; i < token.content.length; i++) {
          const char = token.content[i];
          const typingPos = token.typingStart + i;
          const status = getCharacterStatus(typingPos, currentIdx);
          const charElement = renderCharacter(char, status, i, typingPos);

          if (char === " ") {
            // If we have a word, wrap it
            if (currentWord.length > 0) {
              words.push(
                <span key={`word-${wordKey++}`} className="inline-block">
                  {currentWord}
                </span>,
              );
              currentWord = [];
            }
            // Add the space separately
            words.push(charElement);
          } else {
            currentWord.push(charElement);
          }
        }

        // Add any remaining word
        if (currentWord.length > 0) {
          words.push(
            <span key={`word-${wordKey++}`} className="inline-block">
              {currentWord}
            </span>,
          );
        }

        return <span key={keyPrefix}>{words}</span>;
      }

      case "bold": {
        const innerElements = token.tokens.map((t, i) =>
          renderToken(t, `${keyPrefix}-b-${i}`),
        );
        return <strong key={keyPrefix}>{innerElements}</strong>;
      }

      case "italic": {
        const innerElements = token.tokens.map((t, i) =>
          renderToken(t, `${keyPrefix}-i-${i}`),
        );
        return <em key={keyPrefix}>{innerElements}</em>;
      }

      case "link": {
        const innerElements = token.tokens.map((t, i) =>
          renderToken(t, `${keyPrefix}-l-${i}`),
        );
        return <span key={keyPrefix}>{innerElements}</span>;
      }
    }
  };

  // Render the paragraph with proper word boundaries and character status
  const renderFormattedParagraph = () => {
    const displayText = game.paragraph?.content || "";
    const tokens = tokenizeMarkdown(displayText);
    const elements = tokens.map((token, i) => renderToken(token, `t-${i}`));

    // Add cursor at the end if we've typed everything
    if (currentIdx === typingContent.length) {
      elements.push(
        <span key="cursor" className="relative inline-block">
          <span className="absolute -left-[1px] top-0 bottom-0 w-[2px] bg-primary animate-pulse"></span>
          <span>&nbsp;</span>
        </span>,
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
        <h1>Type Harder!</h1>
        <div className="not-prose flex justify-center gap-8 text-lg">
          <div>
            <span className="opacity-70">WPM: </span>
            <span className="font-bold text-primary">{wpm}</span>
          </div>
          <div>
            <span className="opacity-70">Progress: </span>
            <span className="font-bold text-primary">
              {wordsCompleted}/{wordEndIndices.length}
            </span>
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
              {game?.players?.map((player) => {
                const isCurrentUser =
                  currentPlayer && player._id === currentPlayer._id;
                const playerProgress =
                  100 *
                  (isCurrentUser
                    ? currentIdx / typingContent.length
                    : player.wordsCompleted / wordEndIndices.length);
                const playerWpm =
                  elapsedSeconds > 0
                    ? Math.round((player.wordsCompleted / elapsedSeconds) * 60)
                    : 0;

                return (
                  <div key={player._id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span
                        className={`font-medium ${isCurrentUser ? "text-primary" : ""}`}
                      >
                        {player.name} {isCurrentUser && "(You)"}
                      </span>
                      <span className="opacity-70">
                        {player.finishedAt ? "Finished!" : `${playerWpm} WPM`}
                      </span>
                    </div>
                    <progress
                      className={`progress w-full ${
                        player.finishedAt
                          ? "progress-success"
                          : isCurrentUser
                            ? "progress-primary"
                            : "progress-secondary"
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
  return (
    markdown
      // Remove links: [text](url) -> text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Remove bold: **text** -> text
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      // Remove italic: *text* -> text (but not ** patterns)
      .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
      // Normalize multiple spaces to single space
      .replace(/ +/g, " ")
      .trim()
  );
};

const normalizeQuotes = (text: string) => {
  // Only normalize the most common smart quotes
  return text
    .replace(/[\u201C\u201D]/g, '"') // Smart double quotes
    .replace(/[\u2018\u2019]/g, "'"); // Smart single quotes
};

const normalizeChar = (char: string) => {
  // Simple character normalization for comparison
  if (char === "\u201C" || char === "\u201D") return '"';
  if (char === "\u2018" || char === "\u2019") return "'";
  return char;
};
