import { useEffect } from "react";
import "@xterm/xterm/css/xterm.css";
import { AppLayout } from "./components/layout/AppLayout";
import { SettingsModal } from "./components/settings/SettingsModal";
import { useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";

function App() {
  const loadSettings = useSettingsStore((s) => s.loadSettings);
  const theme = useSettingsStore((s) => s.config?.appearance?.theme ?? "dark");
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const toggleSettings = useUiStore((s) => s.toggleSettings);
  const closeSettings = useUiStore((s) => s.closeSettings);

  // Load configuration from the backend on startup.
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

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
