import { useEffect, useRef } from "react";
import { useTerminal } from "../../hooks/useTerminal";
import { useResize } from "../../hooks/useResize";
import { useUiStore } from "../../stores/uiStore";
import { TerminalSearch } from "./TerminalSearch";

interface TerminalTabProps {
  sessionId: string;
  isActive: boolean;
}

export function TerminalTab({ sessionId, isActive }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { terminalRef, fitAddonRef, searchAddonRef } = useTerminal(sessionId, containerRef);
  useResize(containerRef, fitAddonRef, terminalRef, sessionId);

  const openSearch = useUiStore((s) => s.openSearch);
  const closeSearch = useUiStore((s) => s.closeSearch);
  const searchState = useUiStore((s) => s.searchStates[sessionId]);
  const isSearchOpen = searchState?.open ?? false;

  // F3: Cmd/Ctrl+F opens search; Escape closes it.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isActive) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "f") {
        e.preventDefault();
        openSearch(sessionId);
        return;
      }
      if (e.key === "Escape" && isSearchOpen) {
        e.preventDefault();
        closeSearch(sessionId);
        // Return focus to terminal
        terminalRef.current?.focus();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, isSearchOpen, sessionId, openSearch, closeSearch, terminalRef]);

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
      className={`relative w-full h-full ${isActive ? "" : "hidden"}`}
      data-session-id={sessionId}
    >
      {isSearchOpen && searchAddonRef.current && (
        <TerminalSearch
          sessionId={sessionId}
          searchAddon={searchAddonRef.current}
          onClose={() => {
            closeSearch(sessionId);
            terminalRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

