import { create } from "zustand";
import { ptyCreate, ptyClose, SessionConfig, SessionInfo } from "../services/pty";

export interface Session extends SessionInfo {
  isActive: boolean;
}

export interface TerminalSize {
  rows: number;
  cols: number;
}

interface SessionState {
  sessions: Session[];
  activeSessionId: string | null;
  terminalSizes: Record<string, TerminalSize>;

  createSession: (config: SessionConfig) => Promise<string>;
  closeSession: (id: string) => Promise<void>;
  setActiveSession: (id: string) => void;
  markSessionExited: (id: string) => void;
  setTerminalSize: (id: string, rows: number, cols: number) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  activeSessionId: null,
  terminalSizes: {},

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
}));
