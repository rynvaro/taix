import { useEffect, useRef, useState } from "react";
import { useSessionStore, SavedSession } from "../../stores/sessionStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { ptyDefaultShell } from "../../services/pty";
import { sshTestConnection } from "../../services/system";
import { SessionConfig, SshConfig, SshAuth } from "../../types/bindings";

type TabId = "local" | "ssh";

interface Props {
  onClose: () => void;
  /** When provided, the modal opens in edit mode (pre-filled, no new session launched). */
  editSession?: SavedSession;
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
  // Common props to prevent the OS/browser from auto-capitalizing or auto-correcting
  // technical values like hostnames, usernames, and key paths.
  const noAuto = {
    autoCapitalize: "none" as const,
    autoCorrect: "off",
    autoComplete: "off",
    spellCheck: false,
  } as const;
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
            {...noAuto}
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
            inputMode="numeric"
          />
        </div>
      </div>

      <Field label="Username">
        <input
          {...noAuto}
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
            {...noAuto}
            className={inputCls}
            value={value.keyPath}
            onChange={(e) => f("keyPath", e.target.value)}
            placeholder="~/.ssh/id_rsa"
          />
        </Field>
      )}

      <Field label="Remote initial directory (optional)">
        <input
          {...noAuto}
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

export function NewSessionModal({ onClose, editSession }: Props) {
  const createSession = useSessionStore((s) => s.createSession);
  const saveCurrentSession = useSessionStore((s) => s.saveCurrentSession);
  const updateSavedSession = useSessionStore((s) => s.updateSavedSession);
  const shellConfig = useSettingsStore((s) => s.config?.shell);

  const isEdit = !!editSession;

  const [activeTab, setActiveTab] = useState<TabId>("local");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testStatus, setTestStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testing, setTesting] = useState(false);

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
  const [sshSave, setSshSave] = useState(true);

  // Pre-fill from editSession
  useEffect(() => {
    if (!editSession) return;
    try {
      const cfg = JSON.parse(editSession.config) as SessionConfig;
      if (cfg.type === "ssh") {
        setActiveTab("ssh");
        setSshForm({
          name: editSession.name,
          host: cfg.host,
          port: cfg.port.toString(),
          username: cfg.username,
          authType: cfg.auth.type as SshAuthType,
          keyPath: cfg.auth.type === "privateKey" ? cfg.auth.path : "",
          cwd: cfg.cwd ?? "",
        });
      } else {
        setActiveTab("local");
        setLocalForm({
          shell: cfg.shell,
          args: cfg.args.join(" "),
          cwd: cfg.cwd ?? "",
        });
      }
    } catch {
      /* ignore parse errors */
    }
  }, [editSession]);

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

  const handleTest = async () => {
    if (!sshForm.host.trim()) return;
    setTestStatus(null);
    setTesting(true);
    try {
      const msg = await sshTestConnection(sshForm.host.trim(), parseInt(sshForm.port, 10) || 22);
      setTestStatus({ ok: true, msg });
    } catch (e) {
      setTestStatus({ ok: false, msg: (e as Error).message });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveChanges = async () => {
    if (!editSession) return;
    setError(null);
    setLoading(true);
    try {
      const config = buildConfig();
      const name = activeTab === "ssh"
        ? (sshForm.name.trim() || `${sshForm.username}@${sshForm.host}`)
        : localForm.shell.split("/").pop() ?? "shell";
      await updateSavedSession(editSession.id, name, config);
      onClose();
    } catch (e) {
      setError((e as Error).message ?? "Save failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!canConnect) return;
    setError(null);
    setLoading(true);
    try {
      const config = buildConfig();
      const id = await createSession(config);
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
      <div className="bg-neutral-800 border border-neutral-700 rounded-xl shadow-2xl w-[480px] max-w-[95vw] max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-7 pt-5 pb-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-white">
              {isEdit ? "Edit Session" : "New Session"}
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {activeTab === "local" ? "Local shell settings" : "SSH connection settings"}
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

        {/* Tab switcher — hidden in edit mode (type can't change) */}
        {!isEdit && (
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
        )}

        {/* Form body */}
        <div className="flex-1 overflow-y-auto px-7 pb-4 pt-1">
          {activeTab === "local" ? (
            <LocalForm value={localForm} onChange={setLocalForm} />
          ) : (
            <>
              <SshForm value={sshForm} onChange={(v) => { setSshForm(v); setTestStatus(null); }} />
              {/* Save toggle — only for new sessions */}
              {!isEdit && (
                <label className="flex items-center gap-2.5 mt-5 cursor-pointer select-none">
                  <div
                    onClick={() => setSshSave((v) => !v)}
                    className={[
                      "relative rounded-full transition-colors cursor-pointer shrink-0",
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
                  <span className="text-sm text-neutral-300">Save this connection for future use</span>
                </label>
              )}
              {/* Test status badge */}
              {testStatus && (
                <div className={[
                  "mt-3 flex items-start gap-2 px-3 py-2 rounded-lg text-xs",
                  testStatus.ok
                    ? "bg-green-950/50 border border-green-800 text-green-300"
                    : "bg-red-950/60 border border-red-800 text-red-300",
                ].join(" ")}>
                  <span>{testStatus.ok ? "✓" : "✕"}</span>
                  <span>{testStatus.msg}</span>
                </div>
              )}
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
        <div className="flex items-center gap-3 px-7 py-4 border-t border-neutral-700 mt-2">
          {/* Test connection button (SSH only) */}
          {activeTab === "ssh" && (
            <button
              onClick={handleTest}
              disabled={testing || !sshForm.host.trim()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-neutral-400 hover:text-neutral-100 rounded-lg border border-neutral-700 hover:border-neutral-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testing
                ? <span className="inline-block w-3 h-3 border-2 border-neutral-400/30 border-t-neutral-400 rounded-full animate-spin" />
                : "⚡"}
              Test
            </button>
          )}

          <div className="flex-1" />

          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-neutral-400 hover:text-neutral-100 rounded-lg hover:bg-neutral-700 transition-colors"
          >
            Cancel
          </button>

          {isEdit ? (
            <button
              onClick={handleSaveChanges}
              disabled={loading || !canConnect}
              className={[
                "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all",
                canConnect && !loading
                  ? "bg-blue-600 hover:bg-blue-500 text-white shadow-sm"
                  : "bg-neutral-700 text-neutral-500 cursor-not-allowed",
              ].join(" ")}
            >
              {loading
                ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : "Save Changes"}
            </button>
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}

