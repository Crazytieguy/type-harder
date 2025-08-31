import { useConvexMutation } from "@convex-dev/react-query";
import { useMutation } from "@tanstack/react-query";
import { useMutation as useConvexMutationDirect } from "convex/react";
import type { JSX } from "react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, LogOut } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { RoomWithGame } from "../../types/room";
import SpecialCharacterHints from "./SpecialCharacterHints";
import KickButton from "../ui/KickButton";

interface RaceViewProps {
  room: RoomWithGame;
}

// Character status helper
const getCharacterStatus = (
  position: number,
  typedLength: number,
  partialPos: number | null = null,
): "typed-correct" | "typed-incorrect" | "current" | "untyped" | "partial-accent" => {
  if (position === partialPos) {
    return "partial-accent";
  }
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
  const navigate = useNavigate();
  const leaveRoom = useConvexMutationDirect(api.games.leaveRoom);
  const kickPlayer = useConvexMutationDirect(api.games.kickPlayer);
  const currentPlayer = game.players.find(
    (p) => p.userId === room.currentUserId,
  );
  const wordsCompleted = currentPlayer?.wordsCompleted ?? 0;
  const isHost = room.currentUserId === room.hostId;
  const isParticipating = !!currentPlayer;

  // Extract typing content (without markdown) for validation
  const typingContent = extractTypingContent(game.paragraph.content);
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
  const [partialAccentPosition, setPartialAccentPosition] = useState<number | null>(null);
  const [isFocused, setIsFocused] = useState(true);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [inputValue, setInputValue] = useState(""); // Track actual input value
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear currentWordProgress since we're using inputValue instead
  // const currentWordProgress = typingContent.slice(completedIdx, currentIdx);

  // Detect caps lock
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const isCapsLock = e.getModifierState && e.getModifierState("CapsLock");
      setCapsLockOn(isCapsLock);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const isCapsLock = e.getModifierState && e.getModifierState("CapsLock");
      setCapsLockOn(isCapsLock);
    };

    window.addEventListener("keydown", handleKeyPress);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyPress);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

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
    status: "typed-correct" | "typed-incorrect" | "current" | "untyped" | "partial-accent",
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
      case "partial-accent":
        className = "text-warning bg-warning/20 animate-pulse";
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

    // Always use non-breaking space for spaces to prevent layout shifts
    const displayChar = char === " " ? "\u00A0" : char;
    
    return (
      <span key={key} className={className}>
        {displayChar}
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

  // Helper function for recursive markdown tokenization
  const tokenizeMarkdownInner = (
    text: string,
    displayOffset: number,
    typingOffset: number,
  ): Token[] => {
    const tokens: Token[] = [];
    let displayPos = 0;
    let typingPos = 0;

    while (displayPos < text.length) {
      // Check for link
      if (text.substring(displayPos).startsWith("[")) {
        const linkEndIndex = text.indexOf("](", displayPos);
        if (linkEndIndex !== -1 && linkEndIndex > displayPos) {
          const urlEndIndex = text.indexOf(")", linkEndIndex);
          if (urlEndIndex !== -1) {
            const linkText = text.substring(displayPos + 1, linkEndIndex);
            const url = text.substring(linkEndIndex + 2, urlEndIndex);
            const innerTokens = tokenizeText(
              linkText,
              displayOffset + displayPos + 1,
              typingOffset + typingPos,
            );
            tokens.push({
              type: "link",
              tokens: innerTokens,
              url,
              displayStart: displayOffset + displayPos,
              displayEnd: displayOffset + urlEndIndex + 1,
            });
            displayPos = urlEndIndex + 1;
            typingPos += linkText.length;
            continue;
          }
        }
      }

      // Regular text - find the next formatting marker
      let endPos = displayPos;
      while (
        endPos < text.length &&
        !(text.substring(endPos).startsWith("[") && text.indexOf("](", endPos) > endPos)
      ) {
        endPos++;
      }

      if (endPos > displayPos) {
        const content = text.substring(displayPos, endPos);
        const textTokens = tokenizeText(content, displayOffset + displayPos, typingOffset + typingPos);
        tokens.push(...textTokens);
        typingPos += content.length;
        displayPos = endPos;
      } else {
        // Skip unhandled character
        displayPos++;
      }
    }

    return tokens;
  };

  // Tokenize the markdown text into words and formatting
  const tokenizeMarkdown = (text: string): Token[] => {
    // Normalize the text to NFC to ensure consistent character positions
    const normalizedText = text.normalize('NFC');
    const tokens: Token[] = [];
    let displayPos = 0;
    let typingPos = 0;
    let loopCount = 0;
    const maxLoops = 10000; // Prevent infinite loops

    while (displayPos < normalizedText.length) {
      loopCount++;
      if (loopCount > maxLoops) {
        console.error("Infinite loop detected in tokenizeMarkdown!", {
          displayPos,
          typingPos,
          textLength: normalizedText.length,
          lastChars: normalizedText.substring(displayPos, displayPos + 20)
        });
        break;
      }
      // Check for bold
      if (normalizedText.substring(displayPos).startsWith("**")) {
        const endIndex = normalizedText.indexOf("**", displayPos + 2);
        if (endIndex !== -1) {
          const innerText = normalizedText.substring(displayPos + 2, endIndex);
          // Recursively tokenize markdown within bold text
          const innerTokens = tokenizeMarkdownInner(
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
        normalizedText.substring(displayPos).startsWith("*") &&
        !normalizedText.substring(displayPos).startsWith("**")
      ) {
        const endIndex = normalizedText.indexOf("*", displayPos + 1);
        if (endIndex !== -1) {
          const innerText = normalizedText.substring(displayPos + 1, endIndex);
          // Recursively tokenize markdown within italic text
          const innerTokens = tokenizeMarkdownInner(
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
      if (normalizedText.substring(displayPos).startsWith("[")) {
        const linkEndIndex = normalizedText.indexOf("](", displayPos);
        if (linkEndIndex !== -1 && linkEndIndex > displayPos) {
          const urlEndIndex = normalizedText.indexOf(")", linkEndIndex);
          if (urlEndIndex !== -1) {
            const linkText = normalizedText.substring(displayPos + 1, linkEndIndex);
            const url = normalizedText.substring(linkEndIndex + 2, urlEndIndex);
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
        // Not a link, just a bracket (like a footnote [2])
        // Treat it as regular text
      }

      // Regular text - find the next word boundary or formatting marker
      let endPos = displayPos;
      while (
        endPos < normalizedText.length &&
        !normalizedText.substring(endPos).startsWith("**") &&
        !(normalizedText.substring(endPos).startsWith("*") && !normalizedText.substring(endPos).startsWith("**")) &&
        !(normalizedText.substring(endPos).startsWith("[") && normalizedText.indexOf("](", endPos) > endPos)
      ) {
        endPos++;
      }

      if (endPos > displayPos) {
        const content = normalizedText.substring(displayPos, endPos);
        const textTokens = tokenizeText(content, displayPos, typingPos);
        tokens.push(...textTokens);
        typingPos += content.length;
        displayPos = endPos;
      } else {
        // If no progress was made, we have an unhandled character
        // Skip it to prevent infinite loop
        console.warn("Unhandled character in tokenizeMarkdown at position", displayPos, "char:", normalizedText[displayPos]);
        displayPos++;
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
        // Split into words with their trailing spaces
        const words: JSX.Element[] = [];
        let currentWordChars: JSX.Element[] = [];
        let wordKey = 0;

        for (let i = 0; i < token.content.length; i++) {
          const char = token.content[i];
          const typingPos = token.typingStart + i;
          const status = getCharacterStatus(typingPos, currentIdx, partialAccentPosition);
          const charElement = renderCharacter(char, status, i, typingPos);

          currentWordChars.push(charElement);

          // Check if this is the end of a word (space or last character)
          const isSpace = char === " ";
          const isLastChar = i === token.content.length - 1;
          const nextIsSpace = i < token.content.length - 1 && token.content[i + 1] === " ";
          
          // Wrap word group when:
          // - We hit a space and the next char is not a space (end of word + trailing spaces)
          // - We're at the last character
          if ((isSpace && !nextIsSpace) || isLastChar) {
            if (currentWordChars.length > 0) {
              words.push(
                <span key={`word-${wordKey++}`} className="inline-block">
                  {currentWordChars}
                </span>,
              );
              currentWordChars = [];
            }
          }
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
        return <span key={keyPrefix} className="text-primary">{innerElements}</span>;
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
    const newInput = e.target.value;
    
    // Update input value state
    setInputValue(newInput);

    // Clear error and partial accent feedback
    setErrorPosition(null);
    setPartialAccentPosition(null);

    // Calculate the full typed text (what was completed + new input)
    const potentialFullText = completedText + newInput;

    // Block all deletion - only allow forward typing  
    // Use the current input value length to check for deletions
    if (newInput.length < inputValue.length) {
      return;
    }

    // Don't allow typing beyond the paragraph
    if (potentialFullText.length > typingContent.length) {
      return;
    }

    // We need to map the typed text to expected text accounting for two-char sequences
    // The typed text is just the new input (not including completed text)
    const typed = newInput;
    const expected = typingContent.slice(currentIdx);
    
    let typedIndex = 0;
    let expectedIndex = 0;
    let matches = true;
    
    while (typedIndex < typed.length && expectedIndex < expected.length) {
      const expectedChar = expected[expectedIndex];
      const typedChar = typed[typedIndex];
      
      // Check if we have a two-character sequence for special characters
      if (typedIndex + 1 < typed.length) {
        const twoChar = typed[typedIndex] + typed[typedIndex + 1];
        
        // Accented characters
        if (twoChar === '´e' && expectedChar === 'é') {
          // Accept ´e for é (acute accent + e)
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        } else if (twoChar === '`e' && expectedChar === 'è') {
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        } else if (twoChar === '`a' && expectedChar === 'à') {
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        } else if (twoChar === '`u' && expectedChar === 'ù') {
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        } else if (twoChar === '^o' && expectedChar === 'ô') {
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        } else if (twoChar === '^i' && expectedChar === 'î') {
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        } else if ((twoChar === ',c' || twoChar === 'çc') && expectedChar === 'ç') {
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        }
      }
      
      // Check for three-character sequences first (before two-char)
      if (typedIndex + 2 < typed.length) {
        const threeChar = typed.substring(typedIndex, typedIndex + 3);
        
        if (threeChar === '...' && expectedChar === '\u2026') {
          // Three dots for ellipsis
          typedIndex += 3;
          expectedIndex += 1;
          continue;
        } else if (threeChar === '---' && expectedChar === '\u2014') {
          // Three dashes for em dash
          typedIndex += 3;
          expectedIndex += 1;
          continue;
        }
      }
      
      // Check for two-character sequences for other symbols
      if (typedIndex + 1 < typed.length) {
        const twoChar = typed[typedIndex] + typed[typedIndex + 1];
        
        // Math comparisons
        if (twoChar === '<=' && expectedChar === '\u2264') {
          // <= for less than or equal
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        } else if (twoChar === '>=' && expectedChar === '\u2265') {
          // >= for greater than or equal
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        } else if (twoChar === '!=' && expectedChar === '\u2260') {
          // != for not equal
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        }
        // Arrows
        else if (twoChar === '->' && expectedChar === '\u2192') {
          // -> for right arrow
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        } else if (twoChar === '<-' && expectedChar === '\u2190') {
          // <- for left arrow
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        }
        // Dashes - but don't match -- for en dash if we're expecting em dash
        else if (twoChar === '--' && expectedChar === '\u2013') {
          // Two dashes for en dash
          typedIndex += 2;
          expectedIndex += 1;
          continue;
        }
      }
      
      // Special cases for partial matches - show warning indicator while waiting for completion
      if (typedIndex === typed.length - 1) {
        // Accented characters
        if (expectedChar === 'é' && typedChar === '´') {
          setPartialAccentPosition(currentIdx + expectedIndex);
          return; // Keep the ´ in the input buffer
        }
        // Ellipsis - first dot
        else if (expectedChar === '\u2026' && typedChar === '.') {
          setPartialAccentPosition(currentIdx + expectedIndex);
          return;
        }
        // Math symbols
        else if (expectedChar === '\u2264' && typedChar === '<') {
          setPartialAccentPosition(currentIdx + expectedIndex);
          return;
        }
        else if (expectedChar === '\u2265' && typedChar === '>') {
          setPartialAccentPosition(currentIdx + expectedIndex);
          return;
        }
        else if (expectedChar === '\u2260' && typedChar === '!') {
          setPartialAccentPosition(currentIdx + expectedIndex);
          return;
        }
        // Arrows and dashes
        else if ((expectedChar === '\u2192' || expectedChar === '\u2190') && typedChar === '-') {
          setPartialAccentPosition(currentIdx + expectedIndex);
          return;
        }
        // En dash - only first dash
        else if (expectedChar === '\u2013' && typedChar === '-') {
          setPartialAccentPosition(currentIdx + expectedIndex);
          return;
        }
        // Em dash - first dash (but not if it could be en dash)
        else if (expectedChar === '\u2014' && typedChar === '-') {
          setPartialAccentPosition(currentIdx + expectedIndex);
          return;
        }
      }
      
      // Special case for ellipsis - second dot
      if (typedIndex + 1 === typed.length && expectedChar === '\u2026' && typed === '..') {
        setPartialAccentPosition(currentIdx + expectedIndex);
        return;
      }
      
      // Special case for em dash - check for partial -- (two dashes waiting for third)
      if (typedIndex === 0 && typed === '--' && expectedChar === '\u2014') {
        setPartialAccentPosition(currentIdx + expectedIndex);
        return;
      }
      
      // Single character comparison
      // const typedChar = typed[typedIndex];  // Already defined above
      
      // Normalize both characters to handle decomposed Unicode
      const normalizedExpected = expectedChar.normalize('NFC');
      const normalizedTypedChar = typedChar.normalize('NFC');
      
      // Normalize quotes - allow typing regular quotes for smart quotes
      let normalizedTyped = normalizedTypedChar;
      if (typedChar === '"' && (expectedChar === '\u201C' || expectedChar === '\u201D' || expectedChar === '"')) {
        normalizedTyped = expectedChar;
      } else if (typedChar === "'" && (expectedChar === '\u2018' || expectedChar === '\u2019' || expectedChar === "'")) {
        normalizedTyped = expectedChar;
      }
      
      if (normalizedExpected !== normalizedTyped) {
        matches = false;
        break;
      }
      
      typedIndex++;
      expectedIndex++;
    }
    
    // Check if we've consumed all typed input correctly
    if (matches && typedIndex !== typed.length) {
      matches = false;
    }

    if (!matches) {
      // Show error feedback at the position they're trying to type
      setErrorPosition(currentIdx);
      setTimeout(() => setErrorPosition(null), 300);
      // Clear the incorrect input so user can try again
      setInputValue("");
      return;
    }

    // Update current word progress - we've successfully typed up to this position
    const newIdx = currentIdx + expectedIndex;
    setCurrentIdx(newIdx);

    // Update the input field to only contain unprocessed characters
    // We consumed typedIndex characters from the input
    const remainingInput = typed.slice(typedIndex);
    setInputValue(remainingInput);

    // Check if we've completed a word
    if (newIdx >= wordEndIndices[wordsCompleted]) {
      try {
        updateProgress({ roomCode, wordsCompleted: wordsCompleted + 1 });
        // Input is already cleared above when appropriate
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

  const handleLeaveRoom = async () => {
    try {
      await leaveRoom({ roomCode });
      void navigate({ to: "/" });
    } catch (err) {
      console.error("Failed to leave room:", err);
    }
  };

  const handleKickPlayer = async (playerUserId: Id<"users">) => {
    try {
      await kickPlayer({ roomCode, playerUserId });
    } catch (err) {
      console.error("Failed to kick player:", err);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <h1>Type Harder!</h1>
        {isParticipating ? (
          <div className="not-prose flex justify-center gap-8 text-lg">
            <div>
              <span className="opacity-70">WPM: </span>
              <span className="font-bold text-primary">{wpm}</span>
            </div>
            <div>
              <span className="opacity-70">Progress: </span>
              <span className="font-bold text-primary">
                {currentIdx}/{typingContent.length}
              </span>
            </div>
          </div>
        ) : (
          <div className="not-prose">
            <p className="text-lg opacity-70">Watching Race</p>
            <p className="text-sm opacity-50 mt-2">You'll join the next race</p>
          </div>
        )}
      </div>

      <div className="not-prose">
        {/* Paragraph Display */}
        <div className={`card bg-base-200 mb-6 transition-all ${
          !isFocused && currentIdx < typingContent.length
            ? "ring-2 ring-warning animate-pulse"
            : ""
        }`}>
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
        {isParticipating && (
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => void handleInputChange(e)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="absolute -left-[10000px] top-0 w-1 h-1"
            disabled={currentIdx === typingContent.length}
            autoFocus
            aria-label="Type the paragraph"
          />
        )}

        {/* Caps lock warning */}
        {isParticipating && capsLockOn && currentIdx < typingContent.length && (
          <div className="alert alert-warning max-w-md mx-auto mb-4">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">Caps Lock is ON</span>
          </div>
        )}

        {/* Helpful hint */}
        <div className="text-center text-sm opacity-70 mb-4">
          {!isParticipating ? (
            <span>Watching other players race</span>
          ) : currentIdx === typingContent.length ? (
            <span className="text-success">Race completed! 🎉</span>
          ) : !isFocused ? (
            <span className="text-warning font-medium">
              Click on the paragraph to continue typing
            </span>
          ) : (
            <span>Start typing to race!</span>
          )}
        </div>

        {/* Special Character Hints */}
        <SpecialCharacterHints text={typingContent} />

        {/* Progress Bars */}
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title mb-4">Race Progress</h2>
            <div className="space-y-3">
              {game?.players?.filter(player => !player.hasLeft).map((player) => {
                const isCurrentUser =
                  currentPlayer && player._id === currentPlayer._id;
                
                // Calculate character progress for other players
                let playerCharacterProgress = 0;
                if (isCurrentUser) {
                  playerCharacterProgress = currentIdx;
                } else {
                  // Sum up characters for completed words
                  const completedWords = player.wordsCompleted;
                  if (completedWords > 0 && completedWords <= wordEndIndices.length) {
                    playerCharacterProgress = wordEndIndices[completedWords - 1] || 0;
                  }
                }
                
                const playerProgress = 100 * (playerCharacterProgress / typingContent.length);
                const playerWpm =
                  elapsedSeconds > 0
                    ? Math.round((player.wordsCompleted / elapsedSeconds) * 60)
                    : 0;

                return (
                  <div key={player._id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium ${isCurrentUser ? "text-primary" : ""}`}
                        >
                          {player.name} {isCurrentUser && "(You)"}
                        </span>
                        {isHost && !isCurrentUser && !player.hasLeft && (
                          <KickButton
                            onClick={() => void handleKickPlayer(player.userId)}
                          />
                        )}
                      </div>
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

        {/* Leave Room Button at the bottom */}
        <div className="text-center mt-8">
          <button
            className="btn btn-sm btn-outline btn-error"
            onClick={() => void handleLeaveRoom()}
          >
            <LogOut className="w-4 h-4" />
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}

// Extract plain text from markdown for typing (removes formatting and links)
const extractTypingContent = (markdown: string) => {
  return markdown
    // Remove links: [text](url) -> text
    // Only match when followed immediately by parentheses
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Remove footnote references: [1], [2], etc.
    .replace(/\[\d+\]/g, "")
    // Remove bold: **text** -> text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    // Remove italic: *text* -> text (but not ** patterns)
    .replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1")
    // Normalize multiple spaces to single space
    .replace(/ +/g, " ")
    // Normalize to NFC (precomposed) form to handle decomposed characters like é
    .normalize('NFC')
    .trim();
};

