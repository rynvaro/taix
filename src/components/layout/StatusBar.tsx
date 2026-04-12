import { useSessionStore } from "../../stores/sessionStore";
import { useUiStore } from "../../stores/uiStore";

export function StatusBar() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const terminalSizes = useSessionStore((s) => s.terminalSizes);
  const openSettings = useUiStore((s) => s.openSettings);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const size = activeSessionId ? terminalSizes[activeSessionId] : undefined;

  return (
    <div className="flex items-center justify-between px-3 h-6 bg-neutral-900 border-t border-neutral-700 text-xs text-neutral-500 shrink-0 select-none">
      <span>{activeSession?.title ?? "—"}</span>
      <div className="flex items-center gap-3">
        <span>{size ? `${size.cols}×${size.rows}` : "—"}</span>
        <button
          onClick={openSettings}
          aria-label="Open settings (⌘,)"
          title="Settings (⌘,)"
          className="hover:text-neutral-200 transition-colors"
        >
          ⚙
        </button>
      </div>
    </div>
  );
}
