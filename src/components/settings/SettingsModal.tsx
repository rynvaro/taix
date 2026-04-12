import { useState } from "react";
import { useSettingsStore } from "../../stores/settingsStore";
import { AppearanceSettings } from "./AppearanceSettings";
import { ShellSettings } from "./ShellSettings";
import { SshProfilesSettings } from "./SshProfilesSettings";

type Tab = "appearance" | "shell" | "ssh" | "ai";

const TABS: { id: Tab; label: string; disabled?: boolean }[] = [
  { id: "appearance", label: "Appearance" },
  { id: "shell", label: "Shell" },
  { id: "ssh", label: "SSH Profiles" },
  { id: "ai", label: "AI", disabled: true },
];

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("appearance");
  const loading = useSettingsStore((s) => s.loading);

  // Close on Escape key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };

  return (
    /* Full-screen overlay */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div className="flex w-[640px] max-h-[80vh] rounded-lg overflow-hidden bg-neutral-900 border border-neutral-700 shadow-2xl">
        {/* Left tab navigation */}
        <nav className="flex flex-col w-40 bg-neutral-950 border-r border-neutral-700 py-4 shrink-0">
          <p className="px-4 pb-3 text-xs text-neutral-500 uppercase tracking-wider">Settings</p>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              disabled={tab.disabled}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              className={[
                "px-4 py-2 text-sm text-left transition-colors",
                tab.disabled
                  ? "text-neutral-600 cursor-not-allowed"
                  : activeTab === tab.id
                    ? "bg-neutral-800 text-white"
                    : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200",
              ].join(" ")}
            >
              {tab.label}
              {tab.disabled && <span className="ml-1 text-xs">(soon)</span>}
            </button>
          ))}
        </nav>

        {/* Right content area */}
        <div className="flex flex-col flex-1 overflow-y-auto">
          <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-700">
            <h2 className="text-sm font-semibold text-neutral-100 capitalize">{activeTab}</h2>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className="text-neutral-400 hover:text-white text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div className="flex-1 p-5">
            {loading ? (
              <p className="text-sm text-neutral-500">Loading…</p>
            ) : (
              <>
                {activeTab === "appearance" && <AppearanceSettings />}
                {activeTab === "shell" && <ShellSettings />}
                {activeTab === "ssh" && <SshProfilesSettings />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
