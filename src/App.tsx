import { useEffect } from "react";
import "@xterm/xterm/css/xterm.css";
import { AppLayout } from "./components/layout/AppLayout";
import { SettingsModal } from "./components/settings/SettingsModal";
import { useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";
import { useSessionStore } from "./stores/sessionStore";
import { ptyDefaultShell } from "./services/pty";

// Guard against React StrictMode double-invoking the startup effect.
let _appStarted = false;

function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const theme = useSettingsStore((s) => s.config?.appearance?.theme ?? "dark");
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const toggleSettings = useUiStore((s) => s.toggleSettings);
  const closeSettings = useUiStore((s) => s.closeSettings);

  // On startup: load settings + saved sessions/groups, then auto-open a shell.
  useEffect(() => {
    if (_appStarted) return;
    _appStarted = true;

    const { loadSavedSessions, loadGroups, sessions, createSession } =
      useSessionStore.getState();

    Promise.all([
      loadSettings(),
      loadSavedSessions(),
      loadGroups(),
    ]).then(async () => {
      if (useSessionStore.getState().sessions.length === 0) {
        const shellConfig = useSettingsStore.getState().config?.shell;
        const shell = shellConfig?.defaultShell ?? (await ptyDefaultShell());
        await createSession({
          type: "local",
          shell,
          args: shellConfig?.args ?? [],
          env: shellConfig?.env ?? {},
          cwd: null,
        });
      }
    }).catch((e) => console.error("[App] startup error:", e));

    void sessions; // suppress lint
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Apply Tailwind dark/light class to <html> for G4 theme switching.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.remove("dark");
    } else if (theme === "dark") {
      root.classList.add("dark");
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    }
  }, [theme]);

  // Global keyboard shortcut: Cmd/Ctrl+, opens settings.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        toggleSettings();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSettings]);

  return (
    <>
      <AppLayout />
      {settingsOpen && <SettingsModal onClose={closeSettings} />}
    </>
  );
}

export default App;
