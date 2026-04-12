import { create } from "zustand";
import { ptyCreate, ptyClose, SessionConfig, SessionInfo } from "../services/pty";
import {
  sessionsList,
  sessionsSave,
  sessionsDelete,
  sessionsReorder,
  groupsList,
  groupsCreate,
  groupsDelete,
  SavedSession,
  SessionGroup,
} from "../services/sessions";
import { useUiStore } from "./uiStore";

export type { SavedSession, SessionGroup };

export interface Session extends SessionInfo {
  isActive: boolean;
}

export interface TerminalSize {
  rows: number;
  cols: number;
}

interface SessionState {
  // Live PTY sessions (in-memory)
  sessions: Session[];
  activeSessionId: string | null;
  terminalSizes: Record<string, TerminalSize>;

  // Persisted sessions & groups (from SQLite)
  savedSessions: SavedSession[];
  groups: SessionGroup[];

  // PTY actions
  createSession: (config: SessionConfig) => Promise<string>;
  closeSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => void;
  markSessionExited: (id: string) => void;
  setTerminalSize: (id: string, rows: number, cols: number) => void;
  updateSessionTitle: (id: string, title: string) => void;
  reorderTabs: (fromId: string, toId: string) => void;

  // Saved-session actions
  loadSavedSessions: () => Promise<void>;
  saveCurrentSession: (id: string, name: string, config: SessionConfig) => Promise<void>;
  deleteSavedSession: (id: string) => Promise<void>;
  reorderSavedSessions: (ids: string[]) => Promise<void>;

  // Group actions
  loadGroups: () => Promise<void>;
  createGroup: (id: string, name: string, color?: string) => Promise<void>;
  deleteGroup: (id: string) => Promise<void>;
  moveSessionToGroup: (sessionId: string, groupId: string | null) => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  terminalSizes: {},
  savedSessions: [],
  groups: [],

  // ── PTY actions ─────────────────────────────────────────────────────────────

  createSession: async (config) => {
    const id = await ptyCreate(config);
    const info: Session = {
      id,
      title: (config as { shell?: string }).shell?.split("/").pop() ?? "shell",
      startedAt: new Date().toISOString(),
      isActive: true,
    };
    set((s) => ({
      sessions: [...s.sessions, info],
      activeSessionId: s.activeSessionId ?? id,
    }));
    // Initialize layout tree if this is the first session.
    const { layout, initLayout } = useUiStore.getState();
    if (layout === null) {
      initLayout(id);
    }
    return id;
  },

  closeSession: async (id) => {
    await ptyClose(id);
    set((s) => {
      const remaining = s.sessions.filter((sess) => sess.id !== id);
      const nextActive =
        s.activeSessionId === id
          ? (remaining[remaining.length - 1]?.id ?? null)
          : s.activeSessionId;
      return { sessions: remaining, activeSessionId: nextActive };
    });
  },

  setActiveSession: (id) => {
    set({ activeSessionId: id });
  },

  markSessionExited: (id) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, isActive: false } : sess
      ),
    }));
  },

  setTerminalSize: (id, rows, cols) => {
    set((s) => ({ terminalSizes: { ...s.terminalSizes, [id]: { rows, cols } } }));
  },

  updateSessionTitle: (id, title) => {
    set((s) => ({
      sessions: s.sessions.map((sess) =>
        sess.id === id ? { ...sess, title } : sess
      ),
    }));
  },

  reorderTabs: (fromId, toId) => {
    set((s) => {
      const sessions = [...s.sessions];
      const fromIdx = sessions.findIndex((sess) => sess.id === fromId);
      const toIdx = sessions.findIndex((sess) => sess.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return {};
      const [item] = sessions.splice(fromIdx, 1);
      sessions.splice(toIdx, 0, item);
      return { sessions };
    });
  },

  // ── Saved-session actions ────────────────────────────────────────────────────

  loadSavedSessions: async () => {
    const saved = await sessionsList();
    set({ savedSessions: saved });
  },

  saveCurrentSession: async (id, name, config) => {
    const now = new Date().toISOString();
    const session: SavedSession = {
      id,
      name,
      sessionType: (config as { type: string }).type ?? "local",
      config: JSON.stringify(config),
      groupId: null,
      sortOrder: get().savedSessions.length,
      createdAt: now,
      updatedAt: now,
    };
    await sessionsSave(session);
    set((s) => ({
      savedSessions: [
        ...s.savedSessions.filter((ss) => ss.id !== id),
        session,
      ],
    }));
  },

  deleteSavedSession: async (id) => {
    await sessionsDelete(id);
    set((s) => ({
      savedSessions: s.savedSessions.filter((ss) => ss.id !== id),
    }));
  },

  reorderSavedSessions: async (ids) => {
    await sessionsReorder(ids);
    set((s) => {
      const map = new Map(s.savedSessions.map((ss) => [ss.id, ss]));
      const ordered = ids
        .map((id, i) => {
          const ss = map.get(id);
          return ss ? { ...ss, sortOrder: i } : null;
        })
        .filter(Boolean) as SavedSession[];
      return { savedSessions: ordered };
    });
  },

  // ── Group actions ────────────────────────────────────────────────────────────

  loadGroups: async () => {
    const groups = await groupsList();
    set({ groups });
  },

  createGroup: async (id, name, color) => {
    await groupsCreate(id, name, color);
    const groups = await groupsList();
    set({ groups });
  },

  deleteGroup: async (id) => {
    await groupsDelete(id);
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== id),
      // Ungrouped sessions from this group
      savedSessions: s.savedSessions.map((ss) =>
        ss.groupId === id ? { ...ss, groupId: null } : ss
      ),
    }));
  },

  moveSessionToGroup: async (sessionId, groupId) => {
    const ss = get().savedSessions.find((s) => s.id === sessionId);
    if (!ss) return;
    const updated: SavedSession = {
      ...ss,
      groupId,
      updatedAt: new Date().toISOString(),
    };
    await sessionsSave(updated);
    set((s) => ({
      savedSessions: s.savedSessions.map((item) =>
        item.id === sessionId ? updated : item
      ),
    }));
  },
}));
