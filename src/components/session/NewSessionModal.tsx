import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "../../stores/sessionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ptyDefaultShell } from "../../services/pty";
import { SessionConfig, SshConfig, SshAuth } from "../../types/bindings";

type TabId = "local" | "ssh";

interface Props {
  onClose: () => void;
}

// ── Local shell form ──────────────────────────────────────────────────────────

interface LocalFormState {
  shell: string;
  args: string; // space-separated
  cwd: string;
}

function LocalForm({
  value,
  onChange,
}: {
  value: LocalFormState;
  onChange: (v: LocalFormState) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Shell</span>
        <input
          className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
          value={value.shell}
          onChange={(e) => onChange({ ...value, shell: e.target.value })}
          placeholder="/bin/zsh"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Arguments (space-separated)</span>
        <input
          className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
          value={value.args}
          onChange={(e) => onChange({ ...value, args: e.target.value })}
          placeholder="--login"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Initial directory</span>
        <input
          className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
          value={value.cwd}
          onChange={(e) => onChange({ ...value, cwd: e.target.value })}
          placeholder="~ (default)"
        />
      </label>
    </div>
  );
}

// ── SSH form ────────────────────────────────────────────────────────────────

type SshAuthType = "password" | "privateKey" | "sshAgent";

interface SshFormState {
  host: string;
  port: string;
  username: string;
  authType: SshAuthType;
  keyPath: string;
  cwd: string;
}

function SshForm({
  value,
  onChange,
}: {
  value: SshFormState;
  onChange: (v: SshFormState) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-xs text-neutral-400">Host</span>
          <input
            className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
            value={value.host}
            onChange={(e) => onChange({ ...value, host: e.target.value })}
            placeholder="example.com"
          />
        </label>
        <label className="flex flex-col gap-1 w-20">
          <span className="text-xs text-neutral-400">Port</span>
          <input
            className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
            value={value.port}
            onChange={(e) => onChange({ ...value, port: e.target.value })}
            placeholder="22"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Username</span>
        <input
          className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
          value={value.username}
          onChange={(e) => onChange({ ...value, username: e.target.value })}
          placeholder="root"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Authentication</span>
        <select
          className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
          value={value.authType}
          onChange={(e) =>
            onChange({ ...value, authType: e.target.value as SshAuthType })
          }
        >
          <option value="password">Password (interactive)</option>
          <option value="privateKey">Private key</option>
          <option value="sshAgent">SSH agent</option>
        </select>
      </label>
      {value.authType === "privateKey" && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-neutral-400">Key file path</span>
          <input
            className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
            value={value.keyPath}
            onChange={(e) => onChange({ ...value, keyPath: e.target.value })}
            placeholder="~/.ssh/id_rsa"
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Remote initial directory (optional)</span>
        <input
          className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
          value={value.cwd}
          onChange={(e) => onChange({ ...value, cwd: e.target.value })}
          placeholder="/home/user"
        />
      </label>
    </div>
  );
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function NewSessionModal({ onClose }: Props) {
  const createSession = useSessionStore((s) => s.createSession);
  const saveCurrentSession = useSessionStore((s) => s.saveCurrentSession);
  const savedSessions = useSessionStore((s) => s.savedSessions);
  const shellConfig = useSettingsStore((s) => s.config?.shell);

  // H3: Top 5 recent sessions sorted by updatedAt descending
  const recentSessions = [...savedSessions]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const [activeTab, setActiveTab] = useState<TabId>("local");
  const [saveAs, setSaveAs] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [localForm, setLocalForm] = useState<LocalFormState>({
    shell: shellConfig?.defaultShell ?? "",
    args: (shellConfig?.args ?? []).join(" "),
    cwd: "",
  });

  const [sshForm, setSshForm] = useState<SshFormState>({
    host: "",
    port: "22",
    username: "",
    authType: "password",
    keyPath: "",
    cwd: "",
  });

  // Pre-fill shell from backend if not already set
  useEffect(() => {
    if (!localForm.shell) {
      ptyDefaultShell().then((s) =>
        setLocalForm((f) => ({ ...f, shell: s }))
      );
    }
  }, [localForm.shell]);

  // Close on Escape
  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const buildConfig = (): SessionConfig => {
    if (activeTab === "local") {
      return {
        type: "local",
        shell: localForm.shell,
        args: localForm.args.trim() ? localForm.args.trim().split(/\s+/) : [],
        env: {},
        cwd: localForm.cwd.trim() || null,
      };
    }
    // SSH
    let auth: SshAuth;
    if (sshForm.authType === "privateKey") {
      auth = { type: "privateKey", path: sshForm.keyPath };
    } else if (sshForm.authType === "sshAgent") {
      auth = { type: "sshAgent" };
    } else {
      auth = { type: "password" };
    }
    const sshConfig: SshConfig = {
      host: sshForm.host,
      port: parseInt(sshForm.port, 10) || 22,
      username: sshForm.username,
      auth,
      cwd: sshForm.cwd.trim() || null,
    };
    return { type: "ssh", ...sshConfig };
  };

  const handleConnect = async () => {
    setError(null);
    setLoading(true);
    try {
      const config = buildConfig();
      const id = await createSession(config);
      if (saveAs && saveName.trim()) {
        await saveCurrentSession(id, saveName.trim(), config);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // H3: Quick-connect from a saved session
  const handleRecentConnect = async (config: SessionConfig) => {
    setError(null);
    setLoading(true);
    try {
      await createSession(config);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div className="bg-neutral-800 border border-neutral-700 rounded-lg shadow-2xl w-[460px] max-w-full animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-700">
          <h2 className="text-sm font-semibold text-neutral-100">New Session</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-100 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-700">
          {(["local", "ssh"] as TabId[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm capitalize ${
                activeTab === tab
                  ? "text-blue-400 border-b-2 border-blue-400"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {tab === "local" ? "Local Shell" : "SSH"}
            </button>
          ))}
        </div>

        {/* Form */}
        <div className="px-5 py-4">
          {activeTab === "local" ? (
            <LocalForm value={localForm} onChange={setLocalForm} />
          ) : (
            <SshForm value={sshForm} onChange={setSshForm} />
          )}

          {/* Save shortcut */}
          <div className="mt-4 pt-3 border-t border-neutral-700 flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAs}
                onChange={(e) => setSaveAs(e.target.checked)}
                className="accent-blue-500"
              />
              Save as shortcut
            </label>
            {saveAs && (
              <input
                className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="Name this session"
                autoFocus
              />
            )}
          </div>

          {error && (
            <p className="mt-3 text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* H3: Recent sessions */}
        {recentSessions.length > 0 && (
          <div className="px-5 pb-2 border-t border-neutral-700">
            <p className="text-xs text-neutral-500 mt-3 mb-2">Recent</p>
            <div className="flex flex-col gap-1">
              {recentSessions.map((ss) => {
                let config: SessionConfig | null = null;
                try { config = JSON.parse(ss.config) as SessionConfig; } catch { /* ignore */ }
                if (!config) return null;
                const label =
                  config.type === "ssh"
                    ? `${config.username}@${config.host}`
                    : config.shell;
                return (
                  <button
                    key={ss.id}
                    disabled={loading}
                    onClick={() => handleRecentConnect(config!)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-left rounded hover:bg-neutral-700 text-neutral-200 disabled:opacity-50"
                  >
                    <span className="text-neutral-500 text-xs">
                      {config.type === "ssh" ? "🔗" : "⊞"}
                    </span>
                    <span className="flex-1 truncate">{ss.name || label}</span>
                    <span className="text-xs text-neutral-500 shrink-0">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-neutral-700">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-neutral-300 hover:text-neutral-100 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded"
          >
            {loading ? "Connecting…" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
