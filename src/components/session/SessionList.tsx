import { useEffect, useRef, useState } from "react";
import { useSessionStore, SavedSession, SessionGroup } from "../../stores/sessionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ptyDefaultShell } from "../../services/pty";

// ── Single saved-session row ─────────────────────────────────────────────────

interface SessionItemProps {
  session: SavedSession;
  onOpen: (session: SavedSession) => void;
  onDelete: (id: string) => void;
}

function SavedSessionItem({ session, onOpen, onDelete }: SessionItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const icon = session.sessionType === "ssh" ? "⛓" : ">";

  return (
    <div className="relative flex items-center gap-1 group">
      <button
        onClick={() => onOpen(session)}
        className="flex items-center gap-2 flex-1 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 rounded transition-colors text-left truncate"
        title={session.name}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{session.name}</span>
      </button>
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className="shrink-0 px-1 py-1 text-neutral-500 hover:text-neutral-200 opacity-0 group-hover:opacity-100 transition-opacity rounded"
        aria-label="Session options"
      >
        ⋯
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 top-8 z-50 min-w-[120px] bg-neutral-800 border border-neutral-700 rounded shadow-lg py-1"
        >
          <button
            onClick={() => { onOpen(session); setMenuOpen(false); }}
            className="w-full px-3 py-1.5 text-sm text-left text-neutral-300 hover:bg-neutral-700"
          >
            Open
          </button>
          <button
            onClick={() => { onDelete(session.id); setMenuOpen(false); }}
            className="w-full px-3 py-1.5 text-sm text-left text-red-400 hover:bg-neutral-700"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Group section ─────────────────────────────────────────────────────────────

interface GroupSectionProps {
  group: SessionGroup | null; // null = ungrouped
  sessions: SavedSession[];
  onOpen: (session: SavedSession) => void;
  onDelete: (id: string) => void;
}

function GroupSection({ group, sessions, onOpen, onDelete }: GroupSectionProps) {
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
  const shellConfig = useSettingsStore((s) => s.config?.shell);

  useEffect(() => {
    loadSavedSessions().catch(console.error);
    loadGroups().catch(console.error);
  }, [loadSavedSessions, loadGroups]);

  const openLocalShell = async () => {
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
      console.error("[SessionList] failed to open shell:", e);
    }
  };

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

  return (
    <div className="flex flex-col gap-1 p-2 overflow-y-auto">
      {/* New local shell button */}
      <button
        onClick={openLocalShell}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 rounded transition-colors text-left font-medium"
      >
        <span>＋</span>
        <span>New Local Shell</span>
      </button>

      {savedSessions.length > 0 && (
        <div className="mt-1 border-t border-neutral-700 pt-1">
          {/* Grouped sections */}
          {groups.map((g) => (
            <GroupSection
              key={g.id}
              group={g}
              sessions={groupMap.get(g.id) ?? []}
              onOpen={openSaved}
              onDelete={deleteSavedSession}
            />
          ))}
          {/* Ungrouped */}
          <GroupSection
            group={null}
            sessions={groupMap.get(null) ?? []}
            onOpen={openSaved}
            onDelete={deleteSavedSession}
          />
        </div>
      )}
    </div>
  );
}

