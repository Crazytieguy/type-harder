import { UserX } from "lucide-react";

interface KickButtonProps {
  onClick: () => void;
  size?: "xs" | "sm";
}

export default function KickButton({ onClick, size = "xs" }: KickButtonProps) {
  return (
    <button
      className={`btn btn-error btn-${size}`}
      onClick={onClick}
      title="Kick player"
    >
      <UserX className={size === "xs" ? "w-4 h-4" : "w-5 h-5"} />
      Kick
    </button>
  );
}