import { useEffect, useState } from "react";

interface ConnectingOverlayProps {
  target: string;   // "user@host"
  visible: boolean; // false → begin fade-out, then unmount
}

/**
 * Absolutely-positioned overlay shown on SSH sessions while the PTY
 * hasn't produced its first output yet. Fades out smoothly once connected.
 */
export function ConnectingOverlay({ target, visible }: ConnectingOverlayProps) {
  // Keep the element in the DOM long enough for the CSS transition to finish.
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (!visible) {
      const t = setTimeout(() => setMounted(false), 600);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className={`absolute inset-0 z-10 flex items-center justify-center bg-[#1a1b1e] transition-opacity duration-500 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex flex-col items-center gap-3 select-none">
        {/* Spinner */}
        <div className="h-6 w-6 rounded-full border-2 border-neutral-700 border-t-blue-400 animate-spin" />

        {/* Label */}
        <span className="text-neutral-400 text-sm">
          Connecting to{" "}
          <span className="text-neutral-200 font-mono">{target}</span>
          <span className="animate-pulse">…</span>
        </span>
      </div>
    </div>
  );
}
