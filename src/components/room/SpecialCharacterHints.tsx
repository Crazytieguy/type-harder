import { Info } from "lucide-react";
import { useEffect, useState } from "react";

interface SpecialCharacterHintsProps {
  text: string;
}

type OS = "mac" | "windows" | "linux" | "unknown";

const specialCharacters: Record<
  string,
  { mac?: string; windows?: string; linux?: string; name: string }
> = {
  "\u2026": {
    mac: "Option + ;",
    windows: "Alt + 0133",
    linux: "Compose + . + .",
    name: "Ellipsis",
  },
  "\u2014": {
    mac: "Option + Shift + -",
    windows: "Alt + 0151",
    linux: "Compose + - + - + -",
    name: "Em dash",
  },
  "\u2013": {
    mac: "Option + -",
    windows: "Alt + 0150",
    linux: "Compose + - + - + .",
    name: "En dash",
  },
  "\u201C": {
    mac: "Option + [",
    windows: "Alt + 0147",
    linux: 'Compose + " + <',
    name: "Left double quote",
  },
  "\u201D": {
    mac: "Option + Shift + [",
    windows: "Alt + 0148",
    linux: 'Compose + " + >',
    name: "Right double quote",
  },
  "\u2018": {
    mac: "Option + ]",
    windows: "Alt + 0145",
    linux: "Compose + ' + <",
    name: "Left single quote",
  },
  "\u2019": {
    mac: "Option + Shift + ]",
    windows: "Alt + 0146",
    linux: "Compose + ' + >",
    name: "Right single quote",
  },
  "\u2264": {
    mac: "Option + ,",
    windows: "Alt + 2264",
    linux: "Compose + < + =",
    name: "Less than or equal",
  },
  "\u2265": {
    mac: "Option + .",
    windows: "Alt + 2265",
    linux: "Compose + > + =",
    name: "Greater than or equal",
  },
  "\u2260": {
    mac: "Option + =",
    windows: "Alt + 2260",
    linux: "Compose + / + =",
    name: "Not equal",
  },
  "\u221E": {
    mac: "Option + 5",
    windows: "Alt + 236",
    linux: "Compose + o + o",
    name: "Infinity",
  },
  "\u00B0": {
    mac: "Option + Shift + 8",
    windows: "Alt + 0176",
    linux: "Compose + o + o",
    name: "Degree",
  },
  "\u00D7": {
    mac: "Option + x",
    windows: "Alt + 0215",
    linux: "Compose + x + x",
    name: "Multiplication sign",
  },
  "\u00F7": {
    mac: "Option + /",
    windows: "Alt + 0247",
    linux: "Compose + : + -",
    name: "Division sign",
  },
  "\u00B1": {
    mac: "Option + Shift + =",
    windows: "Alt + 0177",
    linux: "Compose + + + -",
    name: "Plus-minus",
  },
  "\u2192": {
    mac: "Option + Shift + Right",
    windows: "Alt + 26",
    linux: "Compose + - + >",
    name: "Right arrow",
  },
  "\u2190": {
    mac: "Option + Shift + Left",
    windows: "Alt + 27",
    linux: "Compose + < + -",
    name: "Left arrow",
  },
  "\u2194": {
    mac: "Option + Shift + Up/Down",
    windows: "Alt + 29",
    linux: "Compose + < + - + >",
    name: "Left-right arrow",
  },
  "\u00B5": {
    mac: "Option + m",
    windows: "Alt + 0181",
    linux: "Compose + u + u",
    name: "Micro sign",
  },
  "\u03C0": {
    mac: "Option + p",
    windows: "Alt + 227",
    linux: "Compose + * + p",
    name: "Pi",
  },
  "\u03A3": {
    mac: "Option + w",
    windows: "Alt + 228",
    linux: "Compose + * + S",
    name: "Sigma",
  },
  "\u221A": {
    mac: "Option + v",
    windows: "Alt + 251",
    linux: "Compose + / + v",
    name: "Square root",
  },
  "\u2208": {
    mac: "Option + Shift + e",
    windows: "Alt + 8712",
    linux: "Compose + ( + -",
    name: "Element of",
  },
  "\u2209": {
    mac: "Option + Shift + e + /",
    windows: "Alt + 8713",
    linux: "Compose + ( + / + -",
    name: "Not element of",
  },
  "\u2286": {
    mac: "Option + Shift + s",
    windows: "Alt + 8838",
    linux: "Compose + ( + _",
    name: "Subset of or equal",
  },
  "\u2200": {
    mac: "Option + Shift + a",
    windows: "Alt + 8704",
    linux: "Compose + A + A",
    name: "For all",
  },
  "\u2203": {
    mac: "Option + Shift + e",
    windows: "Alt + 8707",
    linux: "Compose + E + E",
    name: "There exists",
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

  // Find special characters in the text
  const foundCharacters = Object.entries(specialCharacters).filter(
    ([char]) => text.includes(char),
  );

  if (foundCharacters.length === 0) {
    return null;
  }

  return (
    <div className="card bg-base-200 mb-4">
      <div className="card-body py-3 px-4">
        <div className="flex items-start gap-2">
          <Info className="w-4 h-4 text-info mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <div className="font-medium mb-1">
              Special character typing hints:
            </div>
            <div className="space-y-1 opacity-90">
              {foundCharacters.map(([char, hints]) => {
                const shortcuts = [];
                if (os === "mac" && hints.mac) {
                  shortcuts.push(hints.mac);
                } else if (os === "windows" && hints.windows) {
                  shortcuts.push(hints.windows);
                } else if (os === "linux" && hints.linux) {
                  shortcuts.push(hints.linux);
                } else {
                  // Show all available options if OS is unknown
                  if (hints.mac) shortcuts.push(`Mac: ${hints.mac}`);
                  if (hints.windows) shortcuts.push(`Win: ${hints.windows}`);
                  if (hints.linux) shortcuts.push(`Linux: ${hints.linux}`);
                }

                return (
                  <div key={char} className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold">
                      {char}
                    </span>
                    <span className="opacity-70">({hints.name})</span>
                    <span className="text-primary font-medium">
                      {shortcuts.join(" | ")}
                    </span>
                  </div>
                );
              })}
              {os === "windows" && (
                <div className="text-xs opacity-70 mt-2">
                  Tip: Hold Alt and type numbers on the numpad
                </div>
              )}
              {os === "linux" && (
                <div className="text-xs opacity-70 mt-2">
                  Tip: Enable Compose key in your keyboard settings
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}