import { useEffect, useRef, useState } from "react";
import { useSessionStore } from "../../stores/sessionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ptyDefaultShell } from "../../services/pty";
import { SessionConfig, SshConfig, SshAuth } from "../../types/bindings";

type TabId = "local" | "ssh";

interface Props {
  onClose: () => void;
}

// ── Shared input / label styles ───────────────────────────────────────────────

const inputCls =
  "w-full px-3 py-2 text-sm bg-neutral-900 border border-neutral-600 rounded-md " +
  "text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-1 " +
  "focus:ring-blue-500 focus:border-blue-500 transition-colors";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
        {label}
      </span>
      {children}
    </div>
  );
}

// ── Local shell form ──────────────────────────────────────────────────────────

interface LocalFormState {
  shell: string;
  args: string;
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
    <div className="flex flex-col gap-4">
      <Field label="Shell">
        <input
          className={inputCls}
          value={value.shell}
          onChange={(e) => onChange({ ...value, shell: e.target.value })}
          placeholder="/bin/zsh"
          autoFocus
        />
      </Field>
      <Field label="Arguments (optional)">
        <input
          className={inputCls}
          value={value.args}
          onChange={(e) => onChange({ ...value, args: e.target.value })}
          placeholder="--login"
        />
      </Field>
      <Field label="Initial directory (optional)">
        <input
          className={inputCls}
          value={value.cwd}
          onChange={(e) => onChange({ ...value, cwd: e.target.value })}
          placeholder="~ (default)"
        />
      </Field>
    </div>
  );
}

// ── SSH form ──────────────────────────────────────────────────────────────────

type SshAuthType = "password" | "privateKey" | "sshAgent";

interface SshFormState {
  name: string;
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
  const f = (k: keyof SshFormState, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="flex flex-col gap-4">
      <Field label="Profile name">
        <input
          className={inputCls}
          value={value.name}
          onChange={(e) => f("name", e.target.value)}
          placeholder="My server"
          autoFocus
        />
      </Field>

      <div className="flex gap-3">
        <div className="flex-1 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Host</span>
          <input
            className={inputCls}
            value={value.host}
            onChange={(e) => f("host", e.target.value)}
            placeholder="example.com"
          />
        </div>
        <div className="w-20 flex flex-col gap-1.5">
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Port</span>
          <input
            className={inputCls}
            value={value.port}
            onChange={(e) => f("port", e.target.value)}
            placeholder="22"
          />
        </div>
      </div>

      <Field label="Username">
        <input
          className={inputCls}
          value={value.username}
          onChange={(e) => f("username", e.target.value)}
          placeholder="root"
        />
      </Field>

      <Field label="Authentication">
        <select
          className={inputCls}
          value={value.authType}
          onChange={(e) => f("authType", e.target.value)}
        >
          <option value="password">Password (interactive)</option>
          <option value="privateKey">Private key file</option>
          <option value="sshAgent">SSH agent</option>
        </select>
      </Field>

      {value.authType === "privateKey" && (
        <Field label="Key file path">
          <input
            className={inputCls}
            value={value.keyPath}
            onChange={(e) => f("keyPath", e.target.value)}
            placeholder="~/.ssh/id_rsa"
          />
        </Field>
      )}

      <Field label="Remote initial directory (optional)">
        <input
          className={inputCls}
          value={value.cwd}
          onChange={(e) => f("cwd", e.target.value)}
          placeholder="/home/user"
        />
      </Field>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function NewSessionModal({ onClose }: Props) {
  const createSession = useSessionStore((s) => s.createSession);
  const saveCurrentSession = useSessionStore((s) => s.saveCurrentSession);
  const shellConfig = useSettingsStore((s) => s.config?.shell);

  const [activeTab, setActiveTab] = useState<TabId>("local");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [localForm, setLocalForm] = useState<LocalFormState>({
    shell: shellConfig?.defaultShell ?? "",
    args: (shellConfig?.args ?? []).join(" "),
    cwd: "",
  });

  const [sshForm, setSshForm] = useState<SshFormState>({
    name: "",
    host: "",
    port: "22",
    username: "",
    authType: "password",
    keyPath: "",
    cwd: "",
  });
  // SSH: save by default
  const [sshSave, setSshSave] = useState(true);

  useEffect(() => {
    if (!localForm.shell) {
      ptyDefaultShell().then((s) => setLocalForm((f) => ({ ...f, shell: s })));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const overlayRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
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
    let auth: SshAuth;
    if (sshForm.authType === "privateKey") auth = { type: "privateKey", path: sshForm.keyPath };
    else if (sshForm.authType === "sshAgent") auth = { type: "sshAgent" };
    else auth = { type: "password" };
    const ssh: SshConfig = {
      host: sshForm.host,
      port: parseInt(sshForm.port, 10) || 22,
      username: sshForm.username,
      auth,
      cwd: sshForm.cwd.trim() || null,
    };
    return { type: "ssh", ...ssh };
  };

  const canConnect =
    activeTab === "local"
      ? !!localForm.shell.trim()
      : !!sshForm.host.trim() && !!sshForm.username.trim();

  const handleConnect = async () => {
    if (!canConnect) return;
    setError(null);
    setLoading(true);
    try {
      const config = buildConfig();
      const id = await createSession(config);
      // SSH: save profile if opted in
      if (activeTab === "ssh" && sshSave) {
        const name = sshForm.name.trim() || `${sshForm.username}@${sshForm.host}`;
        await saveCurrentSession(id, name, config);
      }
      onClose();
    } catch (e) {
      setError((e as Error).message ?? "Connection failed.");
    } finally {
      setLoading(false);
    }
  };

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: "local", label: "Local Shell", icon: "⌨" },
    { id: "ssh",   label: "SSH",         icon: "⛓" },
  ];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-neutral-850 bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl w-[480px] max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-7 pt-5 pb-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-white">New Session</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {activeTab === "local" ? "Open a local shell in a new tab" : "Connect to a remote server via SSH"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md text-neutral-500 hover:text-white hover:bg-neutral-700 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab switcher */}
        <div className="px-7 mb-4">
          <div className="flex gap-1 p-1 bg-neutral-900 rounded-lg">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  "flex items-center gap-2 flex-1 justify-center py-1.5 px-3 rounded-md text-sm font-medium transition-all",
                  activeTab === tab.id
                    ? "bg-neutral-700 text-white shadow-sm"
                    : "text-neutral-400 hover:text-neutral-200",
                ].join(" ")}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-7 pb-4 pt-1">
          {activeTab === "local" ? (
            <LocalForm value={localForm} onChange={setLocalForm} />
          ) : (
            <>
              <SshForm value={sshForm} onChange={setSshForm} />
              {/* Save toggle for SSH */}
              <label className="flex items-center gap-2.5 mt-5 cursor-pointer select-none">
                <div
                  onClick={() => setSshSave((v) => !v)}
                  className={[
                    "relative w-8 h-4.5 rounded-full transition-colors cursor-pointer",
                    sshSave ? "bg-blue-600" : "bg-neutral-600",
                  ].join(" ")}
                  style={{ width: 32, height: 18 }}
                >
                  <div
                    className={[
                      "absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform",
                      sshSave ? "translate-x-[14px]" : "translate-x-0.5",
                    ].join(" ")}
                  />
                </div>
                <span className="text-sm text-neutral-300">
                  Save this connection for future use
                </span>
              </label>
            </>
          )}

          {error && (
            <div className="mt-4 flex items-start gap-2 px-3 py-2.5 bg-red-950/60 border border-red-800 rounded-lg">
              <span className="text-red-400 text-xs mt-0.5">✕</span>
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-7 py-4 border-t border-neutral-700 mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-100 rounded-lg hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={loading || !canConnect}
            className={[
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all",
              canConnect && !loading
                ? "bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
                : "bg-neutral-700 text-neutral-500 cursor-not-allowed",
            ].join(" ")}
          >
            {loading ? (
              <>
                <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                <span>{activeTab === "ssh" ? "⛓" : "⌨"}</span>
                Connect
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

