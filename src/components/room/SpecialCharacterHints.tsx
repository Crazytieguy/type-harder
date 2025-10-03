import { Info } from "lucide-react";
import { useEffect, useState } from "react";

interface SpecialCharacterHintsProps {
  text: string;
}

type OS = "mac" | "windows" | "linux" | "unknown";

const specialCharacters: Record<
  string,
  { mac?: string; windows?: string; linux?: string; name: string; fallback?: string }
> = {
  "´": {
    mac: "⌥e",
    windows: "Alt+0180",
    linux: "Compose ' '",
    name: "´ (acute accent)",
  },
  "é": {
    mac: "´e",
    windows: "´e",
    linux: "´e",
    name: "é (type ´ then e)",
  },
  "\u2026": {
    mac: "...",
    windows: "...",
    linux: "...",
    name: "… (type three dots)",
  },
  "\u2014": {
    mac: "---",
    windows: "---",
    linux: "---",
    name: "— (type three dashes)",
  },
  "\u2013": {
    mac: "--",
    windows: "--",
    linux: "--",
    name: "– (type two dashes)",
  },
  "\u201C": {
    mac: "⌥[",
    windows: "Alt+0147",
    linux: 'Compose " <',
    name: "Left double quote",
  },
  "\u201D": {
    mac: "⌥⇧[",
    windows: "Alt+0148",
    linux: 'Compose " >',
    name: "Right double quote",
  },
  "\u2018": {
    mac: "⌥]",
    windows: "Alt+0145",
    linux: "Compose ' <",
    name: "Left single quote",
  },
  "\u2019": {
    mac: "⌥⇧]",
    windows: "Alt+0146",
    linux: "Compose ' >",
    name: "Right single quote",
  },
  "\u2264": {
    mac: "<=",
    windows: "<=",
    linux: "<=",
    name: "≤ (type <=)",
  },
  "\u2265": {
    mac: ">=",
    windows: ">=",
    linux: ">=",
    name: "≥ (type >=)",
  },
  "\u2260": {
    mac: "!=",
    windows: "!=",
    linux: "!=",
    name: "≠ (type !=)",
  },
  "\u221E": {
    mac: "⌥5",
    windows: "Alt+236",
    linux: "Compose o o",
    name: "∞",
  },
  "\u00B0": {
    mac: "⌥⇧8",
    windows: "Alt+0176",
    linux: "Compose o o",
    name: "°",
  },
  "\u00D7": {
    mac: "*",
    windows: "*",
    linux: "*",
    name: "× (type *)",
  },
  "\u2212": {
    mac: "-",
    windows: "-",
    linux: "-",
    name: "− (type -)",
  },
  "\u00ac": {
    mac: "~",
    windows: "~",
    linux: "~",
    name: "¬ (type ~)",
  },
  "\u21d2": {
    mac: "=>",
    windows: "=>",
    linux: "=>",
    name: "⇒ (type =>)",
  },
  "\u00f6": {
    mac: '⌥u o',
    windows: '" o',
    linux: '" o',
    name: "ö",
  },
  "\u00e4": {
    mac: '⌥u a',
    windows: '" a',
    linux: '" a',
    name: "ä",
  },
  "\u00fc": {
    mac: '⌥u u',
    windows: '" u',
    linux: '" u',
    name: "ü",
  },
  "\u00eb": {
    mac: '⌥u e',
    windows: '" e',
    linux: '" e',
    name: "ë",
  },
  "\u21a6": {
    mac: "|->",
    windows: "|->",
    linux: "|->",
    name: "↦ (type |->)",
  },
  "\u00F7": {
    mac: "⌥/",
    windows: "Alt+0247",
    linux: "Compose : -",
    name: "÷",
  },
  "\u00B1": {
    mac: "⌥⇧=",
    windows: "Alt+0177",
    linux: "Compose + -",
    name: "±",
  },
  "\u2192": {
    mac: "->",
    windows: "->",
    linux: "->",
    name: "→ (type ->)",
  },
  "\u2190": {
    mac: "<-",
    windows: "<-",
    linux: "<-",
    name: "← (type <-)",
  },
  "\u2194": {
    mac: "⌥⇧↑/↓",
    windows: "Alt+29",
    linux: "Compose < - >",
    name: "↔",
  },
  "\u00B5": {
    mac: "⌥m",
    windows: "Alt+0181",
    linux: "Compose u u",
    name: "µ",
  },
  "\u03C0": {
    mac: "⌥p",
    windows: "Alt+227",
    linux: "Compose * p",
    name: "π",
  },
  "\u03A3": {
    mac: "⌥w",
    windows: "Alt+228",
    linux: "Compose * S",
    name: "Σ",
  },
  "\u221A": {
    mac: "⌥v",
    windows: "Alt+251",
    linux: "Compose / v",
    name: "√",
  },
  "\u2208": {
    mac: "⌥⇧e",
    windows: "Alt+8712",
    linux: "Compose ( -",
    name: "∈",
  },
  "\u2209": {
    mac: "⌥⇧e/",
    windows: "Alt+8713",
    linux: "Compose ( / -",
    name: "∉",
  },
  "\u2286": {
    mac: "⌥⇧s",
    windows: "Alt+8838",
    linux: "Compose ( _",
    name: "⊆",
  },
  "\u2200": {
    mac: "⌥⇧a",
    windows: "Alt+8704",
    linux: "Compose A A",
    name: "∀",
  },
  "\u2203": {
    mac: "⌥⇧e",
    windows: "Alt+8707",
    linux: "Compose E E",
    name: "∃",
  },
};

function detectOS(): OS {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || "";

  if (platform.includes("mac") || userAgent.includes("mac")) {
    return "mac";
  }
  if (platform.includes("win") || userAgent.includes("win")) {
    return "windows";
  }
  if (platform.includes("linux") || userAgent.includes("linux")) {
    return "linux";
  }
  return "unknown";
}

export default function SpecialCharacterHints({
  text,
}: SpecialCharacterHintsProps) {
  const [os, setOS] = useState<OS>("unknown");

  useEffect(() => {
    setOS(detectOS());
  }, []);

  // Find special characters in the text and sort by order of appearance
  // If é is in the text, also include ´ since it's needed to type é
  const foundCharacters = Object.entries(specialCharacters)
    .filter(([char]) => {
      // Include the character if it's in the text
      if (text.includes(char)) return true;
      // Also include ´ if é is in the text (since you need ´ to type é)
      if (char === "´" && text.includes("é")) return true;
      return false;
    })
    .sort(([charA], [charB]) => {
      // If one is ´ and the other is é, show ´ first
      if (charA === "´" && charB === "é") return -1;
      if (charA === "é" && charB === "´") return 1;
      
      const indexA = text.indexOf(charA);
      const indexB = text.indexOf(charB);
      // Handle characters that aren't in the text (like ´ when é is present)
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

  if (foundCharacters.length === 0) {
    return null;
  }

  return (
    <div className="card bg-base-200 mb-4">
      <div className="card-body py-3 px-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-info mt-0.5 flex-shrink-0" />
          <div className="text-sm flex-1">
            <div className="font-medium mb-2">Special characters:</div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {foundCharacters.map(([char, hints]) => {
                let shortcut = "";
                if (os === "mac" && hints.mac) {
                  shortcut = hints.mac;
                } else if (os === "windows" && hints.windows) {
                  shortcut = hints.windows;
                } else if (os === "linux" && hints.linux) {
                  shortcut = hints.linux;
                } else {
                  // Show first available option if OS is unknown
                  if (hints.mac) shortcut = hints.mac;
                  else if (hints.windows) shortcut = hints.windows;
                  else if (hints.linux) shortcut = hints.linux;
                }

                // Split shortcut into individual keys
                const keys = shortcut.split(/(?=[+⇧⌥⌘])|(?<=[+⇧⌥⌘])/).filter(k => k && k !== '+');
                
                return (
                  <div key={char} className="flex items-center gap-2 whitespace-nowrap">
                    <span className="font-mono text-base font-bold">{char}</span>
                    <div className="flex items-center gap-1">
                      {keys.map((key, idx) => (
                        <kbd key={idx} className="kbd kbd-sm font-sans">{key}</kbd>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {os === "windows" && (
              <div className="text-xs opacity-60 mt-1">
                Hold Alt + numpad
              </div>
            )}
            {os === "linux" && (
              <div className="text-xs opacity-60 mt-1">
                Enable Compose key
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}