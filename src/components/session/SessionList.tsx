import { useSessionStore } from "../../stores/sessionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ptyDefaultShell } from "../../services/pty";

interface SessionItemProps {
  label: string;
  icon: string;
  onOpen: () => void;
}

function SessionItem({ label, icon, onOpen }: SessionItemProps) {
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-700 rounded transition-colors text-left"
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

export function SessionList() {
  const createSession = useSessionStore((s) => s.createSession);
  const shellConfig = useSettingsStore((s) => s.config?.shell);

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

  return (
    <div className="flex flex-col gap-1 p-2">
      <p className="px-3 py-1 text-xs text-neutral-500 uppercase tracking-wider">Sessions</p>
      <SessionItem label="Local Shell" icon=">" onOpen={openLocalShell} />
    </div>
  );
}
