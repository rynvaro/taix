import { useUiStore } from "../../stores/uiStore";
import { TerminalPane } from "../terminal/TerminalPane";
import { StatusBar } from "./StatusBar";
import { SessionList } from "../session/SessionList";

export function AppLayout() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

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
          <button
            onClick={toggleSidebar}
            aria-label="Close sidebar"
            className="text-neutral-400 hover:text-white"
          >
            ←
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <SessionList />
        </div>
      </aside>

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
