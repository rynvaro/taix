import { create } from "zustand";
import { PaneLayout, SplitDirection } from "../types/bindings";

// ── Layout tree helpers ───────────────────────────────────────────────────────

/** Replace the Leaf with sessionId by `replacement` in the tree. */
function replaceLeaf(
  layout: PaneLayout,
  sessionId: string,
  replacement: PaneLayout
): PaneLayout {
  if (layout.type === "leaf") {
    return layout.sessionId === sessionId ? replacement : layout;
  }
  return {
    ...layout,
    first: replaceLeaf(layout.first, sessionId, replacement),
    second: replaceLeaf(layout.second, sessionId, replacement),
  };
}

/** Remove the Leaf with sessionId; replace parent Split with sibling. */
function removeLeaf(layout: PaneLayout, sessionId: string): PaneLayout | null {
  if (layout.type === "leaf") {
    return layout.sessionId === sessionId ? null : layout;
  }
  const firstResult = removeLeaf(layout.first, sessionId);
  if (firstResult === null) return layout.second;
  const secondResult = removeLeaf(layout.second, sessionId);
  if (secondResult === null) return layout.first;
  return { ...layout, first: firstResult, second: secondResult };
}

/** Update ratio for the Split node whose direct children contain sessionId. */
function updateRatio(
  layout: PaneLayout,
  sessionId: string,
  newRatio: number
): PaneLayout {
  if (layout.type === "leaf") return layout;
  const hasInFirst =
    layout.first.type === "leaf" && layout.first.sessionId === sessionId;
  const hasInSecond =
    layout.second.type === "leaf" && layout.second.sessionId === sessionId;
  if (hasInFirst || hasInSecond) {
    return { ...layout, ratio: newRatio };
  }
  return {
    ...layout,
    first: updateRatio(layout.first, sessionId, newRatio),
    second: updateRatio(layout.second, sessionId, newRatio),
  };
}

/** Collect all leaf session ids in document order. */
export function collectLeafIds(layout: PaneLayout): string[] {
  if (layout.type === "leaf") return [layout.sessionId];
  return [...collectLeafIds(layout.first), ...collectLeafIds(layout.second)];
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface SearchState {
  open: boolean;
  query: string;
  caseSensitive: boolean;
  useRegex: boolean;
}

interface UiState {
  sidebarOpen: boolean;
  settingsOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSettings: () => void;

  // Split-pane layout
  layout: PaneLayout | null;
  activePaneId: string | null;
  initLayout: (sessionId: string) => void;
  splitPane: (targetSessionId: string, direction: SplitDirection, newSessionId: string) => void;
  closePane: (sessionId: string) => void;
  resizePane: (targetSessionId: string, newRatio: number) => void;
  setActivePaneId: (id: string) => void;

  // Per-session search state (key = sessionId)
  searchStates: Record<string, SearchState>;
  openSearch: (sessionId: string) => void;
  closeSearch: (sessionId: string) => void;
  setSearchQuery: (sessionId: string, query: string) => void;
  setSearchOption: (sessionId: string, key: "caseSensitive" | "useRegex", value: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarOpen: true,
  settingsOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),

  // Split-pane layout
  layout: null,
  activePaneId: null,

  initLayout: (sessionId) =>
    set({ layout: { type: "leaf", sessionId }, activePaneId: sessionId }),

  splitPane: (targetSessionId, direction, newSessionId) => {
    const { layout } = get();
    // Bootstrap a single-leaf layout if none exists yet.
    const rootLayout: PaneLayout = layout ?? { type: "leaf", sessionId: targetSessionId };
    const split: PaneLayout = {
      type: "split",
      direction,
      ratio: 0.5,
      first: { type: "leaf", sessionId: targetSessionId },
      second: { type: "leaf", sessionId: newSessionId },
    };
    set({
      layout: replaceLeaf(rootLayout, targetSessionId, split),
      activePaneId: newSessionId,
    });
  },

  closePane: (sessionId) => {
    const { layout } = get();
    if (!layout) return;
    const next = removeLeaf(layout, sessionId);
    if (next === null) {
      set({ layout: null, activePaneId: null });
    } else {
      const leafIds = collectLeafIds(next);
      const currentActive = get().activePaneId;
      const stillActive = currentActive && leafIds.includes(currentActive);
      set({
        layout: next,
        activePaneId: stillActive ? currentActive : (leafIds[0] ?? null),
      });
    }
  },

  resizePane: (targetSessionId, newRatio) => {
    const { layout } = get();
    if (!layout) return;
    set({ layout: updateRatio(layout, targetSessionId, newRatio) });
  },

  setActivePaneId: (id) => set({ activePaneId: id }),

  // Per-session search state
  searchStates: {},

  openSearch: (sessionId) =>
    set((s) => ({
      searchStates: {
        ...s.searchStates,
        [sessionId]: {
          open: true,
          query: s.searchStates[sessionId]?.query ?? "",
          caseSensitive: s.searchStates[sessionId]?.caseSensitive ?? false,
          useRegex: s.searchStates[sessionId]?.useRegex ?? false,
        },
      },
    })),

  closeSearch: (sessionId) =>
    set((s) => ({
      searchStates: {
        ...s.searchStates,
        [sessionId]: { ...s.searchStates[sessionId], open: false },
      },
    })),

  setSearchQuery: (sessionId, query) =>
    set((s) => ({
      searchStates: {
        ...s.searchStates,
        [sessionId]: { open: true, query, caseSensitive: s.searchStates[sessionId]?.caseSensitive ?? false, useRegex: s.searchStates[sessionId]?.useRegex ?? false },
      },
    })),

  setSearchOption: (sessionId, key, value) =>
    set((s) => ({
      searchStates: {
        ...s.searchStates,
        [sessionId]: { ...s.searchStates[sessionId], [key]: value },
      },
    })),
}));
