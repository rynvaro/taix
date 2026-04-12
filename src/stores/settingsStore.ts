import { create } from "zustand";
import { configGet, configSet, AppConfig } from "../services/config";
import { AppearanceConfig, ShellConfig } from "../types/bindings";

interface SettingsState {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;

  loadSettings: () => Promise<void>;
  updateAppearance: (partial: Partial<AppearanceConfig>) => Promise<void>;
  updateShell: (partial: Partial<ShellConfig>) => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  config: null,
  loading: false,
  error: null,

  loadSettings: async () => {
    set({ loading: true, error: null });
    try {
      const config = await configGet();
      set({ config, loading: false });
    } catch (e) {
      set({ error: String(e), loading: false });
    }
  },

  updateAppearance: async (partial) => {
    const { config } = get();
    const next: AppConfig = {
      ...config,
      appearance: { ...(config?.appearance as AppearanceConfig), ...partial },
    };
    await configSet(next);
    set({ config: next });
  },

  updateShell: async (partial) => {
    const { config } = get();
    const next: AppConfig = {
      ...config,
      shell: { ...(config?.shell as ShellConfig), ...partial },
    };
    await configSet(next);
    set({ config: next });
  },
}));
