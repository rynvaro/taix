import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "../../stores/sessionStore";
import { useUiStore, collectLeafIds } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ptyDefaultShell } from "../../services/pty";
import { NewSessionModal } from "../session/NewSessionModal";

interface ContextMenuState {
  sessionId: string;
  x: number;
  y: number;
}

export function TabBar() {
  const sessions = useSessionStore((s) => s.sessions);
  const activeSessionId = useSessionStore((s) => s.activeSessionId);
  const closeSession = useSessionStore((s) => s.closeSession);
  const createSession = useSessionStore((s) => s.createSession);
  const setActiveSession = useSessionStore((s) => s.setActiveSession);
  const reorderTabs = useSessionStore((s) => s.reorderTabs);
  const { activePaneId, splitPane, closePane, layout, initLayout } = useUiStore();
  const shellConfig = useSettingsStore((s) => s.config?.shell);
  const accentColor = useSettingsStore((s) => s.config?.appearance?.accentColor ?? "#38bdf8");

  const [showModal, setShowModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);

  // H4: Cmd+T = new tab, Cmd+1-9 = switch to Nth tab
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "t") {
        e.preventDefault();
        setShowModal(true);
        return;
      }
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9) {
        const target = sessions[digit - 1];
        if (target) {
          e.preventDefault();
          setActiveSession(target.id);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [sessions, setActiveSession]);

  // Close context menu on outside click / Escape
  useEffect(() => {
    if (!contextMenu) return;
    const clickListener = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const keyListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", clickListener);
    document.addEventListener("keydown", keyListener);
    return () => {
      document.removeEventListener("mousedown", clickListener);
      document.removeEventListener("keydown", keyListener);
    };
  }, [contextMenu]);

  const handleSplit = async (direction: "horizontal" | "vertical", sessionId?: string) => {
    setContextMenu(null);
    const targetId = sessionId ?? activePaneId;
    if (!targetId) return;
    const shell = shellConfig?.defaultShell ?? (await ptyDefaultShell());
    const newId = await createSession({
      type: "local",
      shell,
      args: shellConfig?.args ?? [],
      env: shellConfig?.env ?? {},
      cwd: null,
    }, { skipLayout: true });
    splitPane(targetId, direction, newId);
  };

  const handleClose = async (id: string) => {
    setContextMenu(null);
    try {
      closePane(id);
      await closeSession(id);
    } catch (e) {
      console.error("[TabBar] failed to close session:", e);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, sessionId: string) => {
    e.preventDefault();
    // Clamp to window bounds
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 160);
    setContextMenu({ sessionId, x, y });
  };

  // H2: HTML5 drag-and-drop reordering
  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(id);
  };
  const handleDrop = (e: React.DragEvent, toId: string) => {
    e.preventDefault();
    const fromId = e.dataTransfer.getData("text/plain");
    if (fromId && fromId !== toId) {
      reorderTabs(fromId, toId);
    }
    setDragOver(null);
  };

  return (
    <div className="relative flex items-center h-9 bg-neutral-900 border-b border-neutral-700 overflow-x-auto shrink-0 select-none">
      {sessions.map((session) => {
        const isActive = session.id === activeSessionId;
        return (
          <button
            key={session.id}
            draggable
            onDragStart={(e) => handleDragStart(e, session.id)}
            onDragOver={(e) => handleDragOver(e, session.id)}
            onDrop={(e) => handleDrop(e, session.id)}
            onDragLeave={() => setDragOver(null)}
            onContextMenu={(e) => handleContextMenu(e, session.id)}
            onClick={() => {
              setActiveSession(session.id);
              if (layout?.type === "split") {
                // In split mode: activate the pane if it's in the tree;
                // otherwise leave split mode (keep-alive pool will show it).
                const leafIds = collectLeafIds(layout);
                if (leafIds.includes(session.id)) {
                  useUiStore.getState().setActivePaneId(session.id);
                } else {
                  initLayout(session.id);
                }
              }
              // In tab mode (leaf / null): just setActiveSession above is enough.
              // Keep-alive pool shows the right session via CSS — no remount needed.
            }}
            className={[
              "flex items-center gap-1.5 h-full px-3 text-sm border-r border-neutral-700",
              "w-36 shrink-0 transition-colors focus:outline-none",
              isActive
                ? "bg-neutral-800 text-white border-b-2"
                : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
              dragOver === session.id ? "ring-l-2 border-l-2 border-l-blue-400" : "",
            ].join(" ")}
            style={isActive ? { borderBottomColor: accentColor } : undefined}
          >
            <span className="flex-1 min-w-0 truncate text-left leading-none">{session.title}</span>
            {!session.isActive && (
              <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-neutral-500" title="exited" />
            )}
            <span
              role="button"
              aria-label={`Close ${session.title}`}
              onClick={(e) => { e.stopPropagation(); handleClose(session.id); }}
              className="shrink-0 px-1.5 py-0.5 text-neutral-500 hover:text-neutral-200 leading-none rounded hover:bg-neutral-700"
            >
              ×
            </span>
          </button>
        );
      })}

      {/* "+" always opens new session modal; split via ⌘D / ⌘⇧D or right-click */}
      <button
        onClick={() => setShowModal(true)}
        aria-label="New tab"
        className="flex items-center justify-center w-8 h-full shrink-0 text-neutral-400 hover:text-white hover:bg-neutral-800 focus:outline-none"
      >
        +
      </button>

      {/* H1: Tab context menu */}
      {contextMenu && (
        <div
          ref={ctxMenuRef}
          style={{ position: "fixed", top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}
          className="min-w-[180px] bg-neutral-800 border border-neutral-700 rounded shadow-xl py-1"
        >
          <button
            onClick={() => handleSplit("horizontal", contextMenu.sessionId)}
            className="w-full px-3 py-1.5 text-sm text-left text-neutral-200 hover:bg-neutral-700"
          >
            Split Horizontal
          </button>
          <button
            onClick={() => handleSplit("vertical", contextMenu.sessionId)}
            className="w-full px-3 py-1.5 text-sm text-left text-neutral-200 hover:bg-neutral-700"
          >
            Split Vertical
          </button>
          <div className="my-1 border-t border-neutral-700" />
          <button
            onClick={() => { setContextMenu(null); setShowModal(true); }}
            className="w-full px-3 py-1.5 text-sm text-left text-neutral-200 hover:bg-neutral-700"
          >
            Save as Shortcut…
          </button>
          <div className="my-1 border-t border-neutral-700" />
          <button
            onClick={() => handleClose(contextMenu.sessionId)}
            className="w-full px-3 py-1.5 text-sm text-left text-red-400 hover:bg-neutral-700"
          >
            Close Tab
          </button>
        </div>
      )}

      {showModal && <NewSessionModal onClose={() => setShowModal(false)} />}
    </div>
  );
}

