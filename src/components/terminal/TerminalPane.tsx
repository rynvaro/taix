import { useSessionStore } from "../../stores/sessionStore";
import { useUiStore } from "../../stores/uiStore";
import { TabBar } from "../terminal/TabBar";
import { TerminalTab } from "../terminal/TerminalTab";
import { PaneContainer } from "../terminal/PaneContainer";

/**
 * Renders the terminal area.
 * - When a split-pane layout exists in uiStore, renders the recursive PaneContainer.
 * - Falls back to the keep-alive tab stack for backwards compatibility.
 */
export function TerminalPane() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const layout = useUiStore((s) => s.layout);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TabBar />
      <div className="flex flex-1 min-h-0 relative overflow-hidden bg-neutral-950">
        {sessions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm">
            Press <kbd className="mx-1 px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 text-xs">+</kbd> to open a new terminal
          </div>
        )}
        {layout ? (
          <PaneContainer layout={layout} />
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`absolute inset-0 ${session.id === activeSessionId ? "" : "hidden"}`}
            >
              <TerminalTab
                sessionId={session.id}
                isActive={session.id === activeSessionId}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

