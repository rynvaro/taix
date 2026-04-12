import { useEffect, useRef } from "react";
import { SearchAddon } from "@xterm/addon-search";
import { useUiStore } from "../../stores/uiStore";

interface TerminalSearchProps {
  sessionId: string;
  searchAddon: SearchAddon;
  onClose: () => void;
}

export function TerminalSearch({ sessionId, searchAddon, onClose }: TerminalSearchProps) {
  const searchStates = useUiStore((s) => s.searchStates);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const setSearchOption = useUiStore((s) => s.setSearchOption);

  const state = searchStates[sessionId];
  const query = state?.query ?? "";
  const caseSensitive = state?.caseSensitive ?? false;
  const useRegex = state?.useRegex ?? false;

  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on open; restore previous query highlight.
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    if (query) {
      searchAddon.findNext(query, { caseSensitive, regex: useRegex });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findNext = () => {
    if (query) searchAddon.findNext(query, { caseSensitive, regex: useRegex });
  };

  const findPrev = () => {
    if (query) searchAddon.findPrevious(query, { caseSensitive, regex: useRegex });
  };

  const handleQueryChange = (q: string) => {
    setSearchQuery(sessionId, q);
    if (q) searchAddon.findNext(q, { caseSensitive, regex: useRegex });
    else searchAddon.clearDecorations();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) findPrev();
      else findNext();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-neutral-800 border border-neutral-600 rounded shadow-lg px-2 py-1">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search…"
        className="w-44 px-1.5 py-0.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
      />
      <button
        title="Case sensitive"
        onClick={() => setSearchOption(sessionId, "caseSensitive", !caseSensitive)}
        className={`px-1.5 py-0.5 text-xs rounded ${caseSensitive ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
      >
        Aa
      </button>
      <button
        title="Regular expression"
        onClick={() => setSearchOption(sessionId, "useRegex", !useRegex)}
        className={`px-1.5 py-0.5 text-xs rounded ${useRegex ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
      >
        .*
      </button>
      <button
        title="Previous match (Shift+Enter)"
        onClick={findPrev}
        className="px-1.5 py-0.5 text-sm text-neutral-400 hover:text-neutral-200"
      >
        ↑
      </button>
      <button
        title="Next match (Enter)"
        onClick={findNext}
        className="px-1.5 py-0.5 text-sm text-neutral-400 hover:text-neutral-200"
      >
        ↓
      </button>
      <button
        title="Close (Escape)"
        onClick={onClose}
        className="px-1 text-neutral-400 hover:text-neutral-200 text-base leading-none ml-1"
      >
        ×
      </button>
    </div>
  );
}
