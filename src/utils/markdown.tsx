import type { JSX } from "react";

// Token types for parsing
export type Token =
  | { type: "text"; content: string }
  | { type: "bold"; tokens: Token[] }
  | { type: "italic"; tokens: Token[] }
  | { type: "link"; tokens: Token[]; url: string };

// Tokenize the markdown text into words and formatting
export const tokenizeMarkdown = (text: string): Token[] => {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < text.length) {
    // Check for bold
    if (text.substring(pos).startsWith("**")) {
      const endIndex = text.indexOf("**", pos + 2);
      if (endIndex !== -1) {
        const innerText = text.substring(pos + 2, endIndex);
        const innerTokens = tokenizeMarkdown(innerText);
        tokens.push({
          type: "bold",
          tokens: innerTokens,
        });
        pos = endIndex + 2;
        continue;
      }
    }

    // Check for italic
    if (
      text.substring(pos).startsWith("*") &&
      !text.substring(pos).startsWith("**")
    ) {
      const endIndex = text.indexOf("*", pos + 1);
      if (endIndex !== -1) {
        const innerText = text.substring(pos + 1, endIndex);
        const innerTokens = tokenizeMarkdown(innerText);
        tokens.push({
          type: "italic",
          tokens: innerTokens,
        });
        pos = endIndex + 1;
        continue;
      }
    }

    // Check for link
    if (text.substring(pos).startsWith("[")) {
      const linkEndIndex = text.indexOf("](", pos);
      if (linkEndIndex !== -1) {
        const urlEndIndex = text.indexOf(")", linkEndIndex);
        if (urlEndIndex !== -1) {
          const linkText = text.substring(pos + 1, linkEndIndex);
          const url = text.substring(linkEndIndex + 2, urlEndIndex);
          const innerTokens = tokenizeMarkdown(linkText);
          tokens.push({
            type: "link",
            tokens: innerTokens,
            url,
          });
          pos = urlEndIndex + 1;
          continue;
        }
      }
    }

    // Regular text - find the next formatting marker
    let endPos = pos;
    while (
      endPos < text.length &&
      !text.substring(endPos).startsWith("**") &&
      !text.substring(endPos).startsWith("*") &&
      !text.substring(endPos).startsWith("[")
    ) {
      endPos++;
    }

    if (endPos > pos) {
      const content = text.substring(pos, endPos);
      tokens.push({
        type: "text",
        content,
      });
      pos = endPos;
    }
  }

  return tokens;
};

// Render markdown tokens to JSX
export const renderMarkdown = (text: string): JSX.Element[] => {
  const tokens = tokenizeMarkdown(text);
  return tokens.map((token, i) => renderToken(token, `t-${i}`));
};

// Render a single token
const renderToken = (token: Token, key: string): JSX.Element => {
  switch (token.type) {
    case "text":
      return <span key={key}>{token.content}</span>;

    case "bold":
      return (
        <strong key={key}>
          {token.tokens.map((t, i) => renderToken(t, `${key}-b-${i}`))}
        </strong>
      );

    case "italic":
      return (
        <em key={key}>
          {token.tokens.map((t, i) => renderToken(t, `${key}-i-${i}`))}
        </em>
      );

    case "link":
      return (
        <a
          key={key}
          href={token.url}
          target="_blank"
          rel="noopener noreferrer"
          className="link link-primary"
        >
          {token.tokens.map((t, i) => renderToken(t, `${key}-l-${i}`))}
        </a>
      );
  }
};
