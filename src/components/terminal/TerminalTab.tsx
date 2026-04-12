import { useEffect, useRef } from "react";
import { useTerminal } from "../../hooks/useTerminal";
import { useResize } from "../../hooks/useResize";

interface TerminalTabProps {
  sessionId: string;
  isActive: boolean;
}

export function TerminalTab({ sessionId, isActive }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { terminalRef, fitAddonRef } = useTerminal(sessionId, containerRef);
  useResize(containerRef, fitAddonRef, terminalRef, sessionId);

  // Re-fit whenever this tab becomes visible again (was hidden via CSS).
  const prevActiveRef = useRef(isActive);
  useEffect(() => {
    if (!prevActiveRef.current && isActive) {
      // Tab just became visible; fit to recalculate dimensions.
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
      });
    }
    prevActiveRef.current = isActive;
  }, [isActive, fitAddonRef]);

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${isActive ? "" : "hidden"}`}
      data-session-id={sessionId}
    />
  );
}
