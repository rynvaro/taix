import { useEffect, useRef } from "react";
import { useTerminal } from "../../hooks/useTerminal";
import { useResize } from "../../hooks/useResize";
import { useUiStore } from "../../stores/uiStore";
import { useSessionStore } from "../../stores/sessionStore";
import { TerminalSearch } from "./TerminalSearch";
import { ConnectingOverlay } from "./ConnectingOverlay";

interface TerminalTabProps {
  sessionId: string;
  isActive: boolean;
}

export function TerminalTab({ sessionId, isActive }: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { terminalRef, fitAddonRef, searchAddon, connected } = useTerminal(sessionId, containerRef);
  useResize(containerRef, fitAddonRef, terminalRef, sessionId);

  // Determine if this is an SSH session from its stored config (stable, never changes).
  const sessionConfig = useSessionStore(
    (s) => s.sessions.find((sess) => sess.id === sessionId)?.config
  );
  const isSSH = sessionConfig?.type === "ssh";
  const sshTarget =
    isSSH && sessionConfig?.type === "ssh"
      ? `${sessionConfig.username}@${sessionConfig.host}`
      : "";

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
      {isSSH && (
        <ConnectingOverlay target={sshTarget} visible={!connected} />
      )}
      {isSearchOpen && searchAddon && (
        <TerminalSearch
          sessionId={sessionId}
          searchAddon={searchAddon}
          onClose={() => {
            closeSearch(sessionId);
            terminalRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

