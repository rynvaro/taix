import { useEffect, useState } from "react";
import { useUiStore, collectLeafIds } from "../../stores/uiStore";
import { useSessionStore } from "../../stores/sessionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ptyDefaultShell } from "../../services/pty";
import { TerminalPane } from "../terminal/TerminalPane";
import { StatusBar } from "./StatusBar";
import { SessionList } from "../session/SessionList";
import { NewSessionModal } from "../session/NewSessionModal";

export function AppLayout() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const { layout, activePaneId, splitPane, closePane, setActivePaneId } =
    useUiStore();
  const { createSession, closeSession } = useSessionStore();
  const shellConfig = useSettingsStore((s) => s.config?.shell);
  const [showNewSession, setShowNewSession] = useState(false);

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Cmd/Ctrl+D — horizontal split
      if (e.key === "d" && !e.shiftKey) {
        e.preventDefault();
        if (!activePaneId) return;
        const shell =
          shellConfig?.defaultShell ?? (await ptyDefaultShell());
        const newId = await createSession({
          type: "local",
          shell,
          args: shellConfig?.args ?? [],
          env: shellConfig?.env ?? {},
          cwd: null,
        }, { skipLayout: true });
        splitPane(activePaneId, "horizontal", newId);
        return;
      }

      // Cmd/Ctrl+Shift+D — vertical split
      if (e.key === "D" && e.shiftKey) {
        e.preventDefault();
        if (!activePaneId) return;
        const shell =
          shellConfig?.defaultShell ?? (await ptyDefaultShell());
        const newId = await createSession({
          type: "local",
          shell,
          args: shellConfig?.args ?? [],
          env: shellConfig?.env ?? {},
          cwd: null,
        }, { skipLayout: true });
        splitPane(activePaneId, "vertical", newId);
        return;
      }

      // Cmd/Ctrl+W — close current pane
      if (e.key === "w") {
        e.preventDefault();
        if (!activePaneId) return;
        closePane(activePaneId);
        await closeSession(activePaneId);
        return;
      }

      // Cmd/Ctrl+[ — cycle focus backward
      if (e.key === "[") {
        e.preventDefault();
        if (!layout || !activePaneId) return;
        const ids = collectLeafIds(layout);
        const idx = ids.indexOf(activePaneId);
        if (idx > 0) setActivePaneId(ids[idx - 1]);
        else setActivePaneId(ids[ids.length - 1]);
        return;
      }

      // Cmd/Ctrl+] — cycle focus forward
      if (e.key === "]") {
        e.preventDefault();
        if (!layout || !activePaneId) return;
        const ids = collectLeafIds(layout);
        const idx = ids.indexOf(activePaneId);
        if (idx < ids.length - 1) setActivePaneId(ids[idx + 1]);
        else setActivePaneId(ids[0]);
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    activePaneId,
    layout,
    shellConfig,
    createSession,
    splitPane,
    closePane,
    closeSession,
    setActivePaneId,
  ]);

  return (
    <div className="flex flex-row w-screen h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Sidebar */}
      <aside
        className="flex flex-col bg-neutral-900 border-r border-neutral-700 overflow-hidden transition-[width] duration-200 ease-in-out shrink-0"
        style={{ width: sidebarOpen ? 220 : 0 }}
        aria-hidden={!sidebarOpen}
      >
        <div className="flex items-center justify-between px-3 h-9 border-b border-neutral-700">
          <span className="text-sm font-semibold text-neutral-200">Taix</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowNewSession(true)}
              aria-label="New session"
              className="flex items-center justify-center w-6 h-6 rounded text-neutral-400 hover:text-white hover:bg-neutral-700"
              title="New session (SSH or local)"
            >
              +
            </button>
            <button
              onClick={toggleSidebar}
              aria-label="Close sidebar"
              className="text-neutral-400 hover:text-white"
            >
              ←
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SessionList />
        </div>
      </aside>

      {showNewSession && <NewSessionModal onClose={() => setShowNewSession(false)} />}

      {/* Main area */}
      <main className="flex flex-col flex-1 min-w-0">
        {/* Sidebar toggle when collapsed */}
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            aria-label="Open sidebar"
            className="absolute top-2 left-2 z-10 text-neutral-500 hover:text-white text-sm"
          >
            →
          </button>
        )}
        <TerminalPane />
        <StatusBar />
      </main>
    </div>
  );
}
