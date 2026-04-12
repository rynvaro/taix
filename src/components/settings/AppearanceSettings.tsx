import { useSettingsStore } from "../../stores/settingsStore";
import type { Theme } from "../../types/bindings";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-neutral-800 last:border-0">
      <label className="w-32 text-sm text-neutral-400 shrink-0">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function AppearanceSettings() {
  const config = useSettingsStore((s) => s.config);
  const updateAppearance = useSettingsStore((s) => s.updateAppearance);

  const appearance = config?.appearance;

  return (
    <div>
      <Field label="Theme">
        <select
          value={appearance?.theme ?? "dark"}
          onChange={(e) => updateAppearance({ theme: e.target.value as Theme })}
          className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm rounded px-2 py-1 focus:outline-none focus:border-blue-500"
        >
          {THEME_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Font Family">
        <input
          type="text"
          value={appearance?.fontFamily ?? ""}
          onChange={(e) => updateAppearance({ fontFamily: e.target.value })}
          placeholder="Menlo, Monaco, Consolas, monospace"
          className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm rounded px-2 py-1 focus:outline-none focus:border-blue-500"
        />
      </Field>

      <Field label="Font Size">
        <input
          type="number"
          min={12}
          max={24}
          value={appearance?.fontSize ?? 14}
          onChange={(e) =>
            updateAppearance({ fontSize: Math.max(12, Math.min(24, Number(e.target.value))) })
          }
          className="w-20 bg-neutral-800 border border-neutral-700 text-neutral-200 text-sm rounded px-2 py-1 focus:outline-none focus:border-blue-500"
        />
        <span className="ml-2 text-xs text-neutral-500">px (12–24)</span>
      </Field>
    </div>
  );
}
