import { useSessionStore } from "../../stores/sessionStore";
import { useUiStore } from "../../stores/uiStore";
import { TabBar } from "../terminal/TabBar";
import { TerminalTab } from "../terminal/TerminalTab";
import { PaneContainer } from "../terminal/PaneContainer";

/**
 * Renders the terminal area.
 *
 * Two modes:
 *  - Split mode  (layout.type === "split"): PaneContainer handles spatial layout.
 *  - Tab mode    (no layout, or layout is a leaf): keep-alive pool — all TerminalTabs
 *    stay mounted; CSS show/hide switches the active one. This prevents xterm from
 *    being recreated (and cleared) on every tab switch.
 */
export function TerminalPane() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const layout = useUiStore((s) => s.layout);

  const isSplit = layout?.type === "split";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <TabBar />
      <div className="flex flex-1 min-h-0 relative overflow-hidden bg-neutral-950">
        {sessions.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-neutral-500 text-sm">
            Press <kbd className="mx-1 px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 text-xs">+</kbd> to open a new terminal
          </div>
        )}
        {isSplit ? (
          // Split mode: PaneContainer manages sizing and dividers.
          <PaneContainer layout={layout!} />
        ) : (
          // Tab mode: keep-alive pool — sessions stay mounted, only visibility changes.
          // Use `invisible` (visibility:hidden) instead of `hidden` (display:none) so
          // the xterm canvas element stays in the render tree and doesn't lose its
          // WebGL/Canvas context on platforms like Windows WebView2.
          sessions.map((session) => (
            <div
              key={session.id}
              className={`absolute inset-0 ${session.id === activeSessionId ? "" : "invisible pointer-events-none"}`}
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

