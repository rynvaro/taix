import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSessionStore, SavedSession, SessionGroup } from "../../stores/sessionStore";
import { NewSessionModal } from "./NewSessionModal";

// ── Single saved-session row ─────────────────────────────────────────────────

interface SessionItemProps {
  session: SavedSession;
  onOpen: (session: SavedSession) => void;
  onEdit: (session: SavedSession) => void;
  onDelete: (id: string) => void;
}

function SavedSessionItem({ session, onOpen, onEdit, onDelete }: SessionItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return;
    const clickHandler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", clickHandler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", clickHandler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [menuOpen]);

  const openMenu = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    }
    setMenuOpen(true);
  };

  const icon = session.sessionType === "ssh" ? "⛓" : ">";

  return (
    <div className="relative flex items-center gap-1 group">
      <button
        onDoubleClick={() => onOpen(session)}
        className="flex items-center gap-2 flex-1 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 rounded transition-colors text-left truncate"
        title={session.name + " (double-click to open)"}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{session.name}</span>
      </button>
      <button
        ref={btnRef}
        onClick={openMenu}
        className="shrink-0 px-1 py-1 text-neutral-500 hover:text-neutral-200 opacity-0 group-hover:opacity-100 transition-opacity rounded"
        aria-label="Session options"
      >
        ⋯
      </button>

      {/* Render dropdown via portal to escape overflow-hidden clipping */}
      {menuOpen && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
          className="min-w-[140px] bg-neutral-800 border border-neutral-700 rounded-lg shadow-xl py-1"
        >
          <button
            onClick={() => { onOpen(session); setMenuOpen(false); }}
            className="w-full px-3 py-1.5 text-sm text-left text-neutral-300 hover:bg-neutral-700"
          >
            Open
          </button>
          <button
            onClick={() => { onEdit(session); setMenuOpen(false); }}
            className="w-full px-3 py-1.5 text-sm text-left text-neutral-300 hover:bg-neutral-700"
          >
            Edit
          </button>
          <div className="my-1 border-t border-neutral-700" />
          <button
            onClick={() => { onDelete(session.id); setMenuOpen(false); }}
            className="w-full px-3 py-1.5 text-sm text-left text-red-400 hover:bg-neutral-700"
          >
            Delete
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────

interface GroupSectionProps {
  group: SessionGroup | null;
  sessions: SavedSession[];
  onOpen: (session: SavedSession) => void;
  onEdit: (session: SavedSession) => void;
  onDelete: (id: string) => void;
}

function GroupSection({ group, sessions, onOpen, onEdit, onDelete }: GroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const label = group ? group.name : "Ungrouped";
  const dot = group?.color ?? "#6b7280";

  if (sessions.length === 0 && group !== null) return null;

  return (
    <div>
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex items-center gap-1.5 w-full px-3 py-1 text-xs text-neutral-500 hover:text-neutral-300 uppercase tracking-wider transition-colors"
      >
        <span
          className="inline-block w-2 h-2 rounded-full shrink-0"
          style={{ background: dot }}
        />
        <span>{label}</span>
        <span className="ml-auto">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && sessions.map((s) => (
        <SavedSessionItem
          key={s.id}
          session={s}
          onOpen={onOpen}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SessionList() {
  const createSession = useSessionStore((s) => s.createSession);
  const savedSessions = useSessionStore((s) => s.savedSessions);
  const groups = useSessionStore((s) => s.groups);
  const loadSavedSessions = useSessionStore((s) => s.loadSavedSessions);
  const loadGroups = useSessionStore((s) => s.loadGroups);
  const deleteSavedSession = useSessionStore((s) => s.deleteSavedSession);

  const [editingSession, setEditingSession] = useState<SavedSession | null>(null);

  useEffect(() => {
    loadSavedSessions().catch(console.error);
    loadGroups().catch(console.error);
  }, [loadSavedSessions, loadGroups]);

  const openSaved = async (session: SavedSession) => {
    try {
      const config = JSON.parse(session.config);
      await createSession(config);
    } catch (e) {
      console.error("[SessionList] failed to restore session:", e);
    }
  };

  // Group sessions by group_id
  const groupMap = new Map<string | null, SavedSession[]>();
  groupMap.set(null, []);
  for (const g of groups) groupMap.set(g.id, []);
  for (const s of savedSessions) {
    const key = s.groupId ?? null;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(s);
  }

  if (savedSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-4 py-8 text-center">
        <div className="text-2xl mb-3 opacity-30">⛓</div>
        <p className="text-xs text-neutral-500 leading-relaxed">
          No saved sessions yet.<br />
          Click <span className="text-neutral-400 font-medium">+</span> above to add one.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1 p-2 overflow-y-auto">
        {/* Grouped sections */}
        {groups.map((g) => (
          <GroupSection
            key={g.id}
            group={g}
            sessions={groupMap.get(g.id) ?? []}
            onOpen={openSaved}
            onEdit={setEditingSession}
            onDelete={deleteSavedSession}
          />
        ))}
        {/* Ungrouped */}
        {(groupMap.get(null) ?? []).map((s) => (
          <SavedSessionItem
            key={s.id}
            session={s}
            onOpen={openSaved}
            onEdit={setEditingSession}
            onDelete={deleteSavedSession}
          />
        ))}
      </div>

      {/* Edit modal rendered via portal — outside the overflow-hidden sidebar */}
      {editingSession && (
        <NewSessionModal
          editSession={editingSession}
          onClose={() => setEditingSession(null)}
        />
      )}
    </>
  );
}
