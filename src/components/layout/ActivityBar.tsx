import { useUiStore, SidePanel } from "../../stores/uiStore";

interface ActivityItem {
  id: SidePanel | "settings" | "ai";
  label: string;
  icon: React.ReactNode;
}

function IconSessions() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="4" rx="1" />
      <rect x="2" y="10" width="20" height="4" rx="1" />
      <rect x="2" y="17" width="20" height="4" rx="1" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconAI() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

const TOP_ITEMS: ActivityItem[] = [
  { id: "sessions", label: "Sessions", icon: <IconSessions /> },
  { id: "search", label: "Search", icon: <IconSearch /> },
  { id: "ai", label: "AI (coming soon)", icon: <IconAI /> },
];

export function ActivityBar() {
  const activePanel = useUiStore((s) => s.activePanel);
  const togglePanel = useUiStore((s) => s.togglePanel);
  const toggleSettings = useUiStore((s) => s.toggleSettings);

  return (
    <div className="flex flex-col items-center w-11 shrink-0 bg-neutral-900 border-r border-neutral-800 py-1 select-none">
      {/* Top items */}
      <div className="flex flex-col items-center gap-0.5 flex-1">
        {TOP_ITEMS.map((item) => {
          const isPanel = item.id === "sessions" || item.id === "search";
          const active = isPanel && activePanel === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === "ai") return; // placeholder — no-op
                if (isPanel) togglePanel(item.id as SidePanel);
              }}
              title={item.label}
              aria-label={item.label}
              className={[
                "relative flex items-center justify-center w-9 h-9 rounded transition-colors",
                active
                  ? "text-white bg-neutral-700"
                  : item.id === "ai"
                    ? "text-neutral-600 cursor-default"
                    : "text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800",
              ].join(" ")}
            >
              {/* Active indicator — left border */}
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r" />
              )}
              {item.icon}
            </button>
          );
        })}
      </div>

      {/* Bottom: Settings */}
      <button
        onClick={toggleSettings}
        title="Settings"
        aria-label="Settings"
        className="flex items-center justify-center w-9 h-9 rounded text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition-colors mb-1"
      >
        <IconSettings />
      </button>
    </div>
  );
}
