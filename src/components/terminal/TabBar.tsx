import { useSessionStore } from "../../stores/sessionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ptyDefaultShell } from "../../services/pty";

export function TabBar() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const createSession = useSessionStore((s) => s.createSession);
  const closeSession = useSessionStore((s) => s.closeSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const shellConfig = useSettingsStore((s) => s.config?.shell);

  const handleNewTab = async () => {
    try {
      const shell = shellConfig?.defaultShell ?? (await ptyDefaultShell());
      await createSession({
        type: "local",
        shell,
        args: shellConfig?.args ?? [],
        env: shellConfig?.env ?? {},
        cwd: null,
      });
    } catch (e) {
      console.error("[TabBar] failed to create session:", e);
    }
  };

  const handleClose = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await closeSession(id);
    } catch (e) {
      console.error("[TabBar] failed to close session:", e);
    }
  };

  return (
    <div className="flex items-center h-9 bg-neutral-900 border-b border-neutral-700 overflow-x-auto shrink-0 select-none">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        return (
          <button
            key={session.id}
            onClick={() => setActiveSession(session.id)}
            className={[
              "flex items-center gap-1.5 h-full px-3 text-sm whitespace-nowrap border-r border-neutral-700",
              "transition-colors focus:outline-none",
              isActive
                ? "bg-neutral-800 text-white"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
            ].join(" ")}
          >
            <span>{session.title}</span>
            {!session.isActive && (
              <span className="text-neutral-500 text-xs">(exited)</span>
            )}
            <span
              role="button"
              aria-label={`Close ${session.title}`}
              onClick={(e) => handleClose(e, session.id)}
              className="ml-1 text-neutral-500 hover:text-neutral-200 leading-none"
            >
              ×
            </span>
          </button>
        );
      })}

      <button
        onClick={handleNewTab}
        aria-label="New tab"
        className="flex items-center justify-center w-8 h-full text-neutral-400 hover:text-white hover:bg-neutral-800 shrink-0 focus:outline-none"
      >
        +
      </button>
    </div>
  );
}
