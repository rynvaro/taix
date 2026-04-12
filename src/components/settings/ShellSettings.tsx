import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { ptyDefaultShell } from "../../services/pty";

export function ShellSettings() {
  const config = useSettingsStore((s) => s.config);
  const updateShell = useSettingsStore((s) => s.updateShell);
  const [detecting, setDetecting] = useState(false);

  const shell = config?.shell?.defaultShell ?? "";

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const detected = await ptyDefaultShell();
      await updateShell({ defaultShell: detected });
    } catch (e) {
      console.error("[ShellSettings] detect error:", e);
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div>
      <div className="flex items-start gap-4 py-3 border-b border-neutral-800">
        <label className="w-32 text-sm text-neutral-400 shrink-0 pt-1">Default Shell</label>
        <div className="flex-1 flex flex-col gap-2">
          <input
            type="text"
            value={shell}
            onChange={(e) => updateShell({ defaultShell: e.target.value || null })}
            placeholder="/bin/zsh"
            className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm rounded px-2 py-1 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleDetect}
            disabled={detecting}
            className="self-start text-xs px-2 py-1 rounded bg-neutral-700 text-neutral-300 hover:bg-neutral-600 disabled:opacity-50 transition-colors"
          >
            {detecting ? "Detecting…" : "Detect system default"}
          </button>
        </div>
      </div>
    </div>
  );
}
