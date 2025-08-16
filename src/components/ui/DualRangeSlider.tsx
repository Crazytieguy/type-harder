import { useEffect, useRef, useState } from "react";

interface DualRangeSliderProps {
  min: number;
  max: number;
  minValue: number;
  maxValue: number;
  step?: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
}

export default function DualRangeSlider({
  min,
  max,
  minValue,
  maxValue,
  step = 1,
  onMinChange,
  onMaxChange,
}: DualRangeSliderProps) {
  const [isDragging, setIsDragging] = useState<"min" | "max" | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  // Calculate positions as percentages
  const minPercent = ((minValue - min) / (max - min)) * 100;
  const maxPercent = ((maxValue - min) / (max - min)) * 100;

  const handleMouseDown = (thumb: "min" | "max") => {
    setIsDragging(thumb);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const percent = Math.min(
        100,
        Math.max(0, ((e.clientX - rect.left) / rect.width) * 100),
      );
      const value = Math.round((percent / 100) * (max - min) + min);

      // Snap to step
      const snappedValue = Math.round(value / step) * step;

      if (isDragging === "min") {
        // Don't allow min to exceed max
        const newMin = Math.min(snappedValue, maxValue - step);
        if (newMin !== minValue && newMin >= min) {
          onMinChange(newMin);
        }
      } else {
        // Don't allow max to go below min
        const newMax = Math.max(snappedValue, minValue + step);
        if (newMax !== maxValue && newMax <= max) {
          onMaxChange(newMax);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, min, max, minValue, maxValue, step, onMinChange, onMaxChange]);

  return (
    <div className="w-full">
      <div className="relative h-12 flex items-center">
        {/* Track */}
        <div
          ref={trackRef}
          className="absolute w-full h-2 bg-base-300 rounded-full"
        >
          {/* Active range */}
          <div
            className="absolute h-full bg-primary rounded-full"
            style={{
              left: `${minPercent}%`,
              width: `${maxPercent - minPercent}%`,
            }}
          />
        </div>

        {/* Min thumb */}
        <div
          className={`absolute w-5 h-5 bg-primary rounded-full cursor-grab transform -translate-x-1/2 transition-transform ${
            isDragging === "min" ? "scale-125 cursor-grabbing" : "hover:scale-110"
          }`}
          style={{ left: `${minPercent}%` }}
          onMouseDown={() => handleMouseDown("min")}
        >
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-base-100 px-2 py-1 rounded text-xs font-medium whitespace-nowrap">
            {minValue}
          </div>
        </div>

        {/* Max thumb */}
        <div
          className={`absolute w-5 h-5 bg-primary rounded-full cursor-grab transform -translate-x-1/2 transition-transform ${
            isDragging === "max" ? "scale-125 cursor-grabbing" : "hover:scale-110"
          }`}
          style={{ left: `${maxPercent}%` }}
          onMouseDown={() => handleMouseDown("max")}
        >
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-base-100 px-2 py-1 rounded text-xs font-medium whitespace-nowrap">
            {maxValue}
          </div>
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs opacity-70 mt-2">
        <span>{min}</span>
        <span className="font-medium text-primary">
          {minValue} - {maxValue} words
        </span>
        <span>{max}</span>
      </div>
    </div>
  );
}