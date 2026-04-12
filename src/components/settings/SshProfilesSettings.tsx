import { useState } from "react";
import { useSessionStore } from "../../stores/sessionStore";
import { SavedSession, SessionConfig, SshConfig, SshAuth } from "../../types/bindings";

// ── SSH form ─────────────────────────────────────────────────────────────────

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

const empty: SshFormState = {
  name: "",
  host: "",
  port: "22",
  username: "",
  authType: "password",
  keyPath: "",
  cwd: "",
};

function sshFormFromSaved(s: SavedSession): SshFormState {
  let cfg: Partial<SshConfig> = {};
  try {
    cfg = JSON.parse(s.config) as Partial<SshConfig>;
  } catch {
    /* ignore */
  }
  const auth = cfg.auth;
  let authType: SshAuthType = "password";
  let keyPath = "";
  if (auth?.type === "privateKey") {
    authType = "privateKey";
    keyPath = auth.path;
  } else if (auth?.type === "sshAgent") {
    authType = "sshAgent";
  }
  return {
    name: s.name,
    host: cfg.host ?? "",
    port: String(cfg.port ?? 22),
    username: cfg.username ?? "",
    authType,
    keyPath,
    cwd: cfg.cwd ?? "",
  };
}

function buildSshConfig(f: SshFormState): SessionConfig {
  let auth: SshAuth;
  if (f.authType === "privateKey") {
    auth = { type: "privateKey", path: f.keyPath };
  } else if (f.authType === "sshAgent") {
    auth = { type: "sshAgent" };
  } else {
    auth = { type: "password" };
  }
  const sshCfg: SshConfig = {
    host: f.host,
    port: parseInt(f.port, 10) || 22,
    username: f.username,
    auth,
    cwd: f.cwd.trim() || null,
  };
  return { type: "ssh", ...sshCfg };
}

interface FormProps {
  value: SshFormState;
  onChange: (v: SshFormState) => void;
}

function SshForm({ value, onChange }: FormProps) {
  const f = (field: keyof SshFormState, val: string) =>
    onChange({ ...value, [field]: val });

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Profile name</span>
        <input
          className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
          value={value.name}
          onChange={(e) => f("name", e.target.value)}
          placeholder="My server"
        />
      </label>
      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-xs text-neutral-400">Host</span>
          <input
            className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
            value={value.host}
            onChange={(e) => f("host", e.target.value)}
            placeholder="example.com"
          />
        </label>
        <label className="flex flex-col gap-1 w-20">
          <span className="text-xs text-neutral-400">Port</span>
          <input
            className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
            value={value.port}
            onChange={(e) => f("port", e.target.value)}
            placeholder="22"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Username</span>
        <input
          className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
          value={value.username}
          onChange={(e) => f("username", e.target.value)}
          placeholder="root"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Authentication</span>
        <select
          className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
          value={value.authType}
          onChange={(e) => f("authType", e.target.value)}
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
            onChange={(e) => f("keyPath", e.target.value)}
            placeholder="~/.ssh/id_rsa"
          />
        </label>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-neutral-400">Remote initial directory (optional)</span>
        <input
          className="px-2 py-1.5 text-sm bg-neutral-700 border border-neutral-600 rounded text-neutral-100 focus:outline-none focus:border-blue-500"
          value={value.cwd}
          onChange={(e) => f("cwd", e.target.value)}
          placeholder="/home/user"
        />
      </label>
    </div>
  );
}

// ── SshProfilesSettings ───────────────────────────────────────────────────────

export function SshProfilesSettings() {
  const savedSessions = useSessionStore((s) => s.savedSessions);
  const saveCurrentSession = useSessionStore((s) => s.saveCurrentSession);
  const deleteSavedSession = useSessionStore((s) => s.deleteSavedSession);

  const sshProfiles = savedSessions.filter((s) => s.sessionType === "ssh");

  const [editing, setEditing] = useState<string | null>(null); // id or "new"
  const [form, setForm] = useState<SshFormState>(empty);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const startNew = () => {
    setForm(empty);
    setSaveError(null);
    setEditing("new");
  };

  const startEdit = (s: SavedSession) => {
    setForm(sshFormFromSaved(s));
    setSaveError(null);
    setEditing(s.id);
  };

  const cancel = () => { setEditing(null); setSaveError(null); };

  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError("Profile name is required."); return; }
    if (!form.host.trim()) { setSaveError("Host is required."); return; }
    if (!form.username.trim()) { setSaveError("Username is required."); return; }
    setSaveError(null);
    setSaving(true);
    try {
      const config = buildSshConfig(form);
      const id = editing === "new" ? crypto.randomUUID() : (editing as string);
      await saveCurrentSession(id, form.name.trim(), config);
      setEditing(null);
    } catch (e) {
      setSaveError((e as Error).message ?? "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSavedSession(id);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">
          SSH profiles are saved shortcuts for remote connections.
        </p>
        <button
          onClick={startNew}
          className="px-3 py-1 text-xs text-white bg-blue-600 hover:bg-blue-500 rounded"
        >
          + New profile
        </button>
      </div>

      {/* Profile list */}
      {sshProfiles.length === 0 && editing !== "new" && (
        <p className="text-sm text-neutral-500 py-4 text-center">No SSH profiles yet.</p>
      )}

      <div className="flex flex-col gap-2">
        {sshProfiles.map((s) =>
          editing === s.id ? (
            <div
              key={s.id}
              className="border border-neutral-700 rounded p-4 flex flex-col gap-3"
            >
              <SshForm value={form} onChange={setForm} />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={cancel}
                  className="px-3 py-1 text-sm text-neutral-400 hover:text-neutral-200"
                >
                  Cancel
                </button>
                {saveError && (
                  <p className="text-xs text-red-400 mt-1">{saveError}</p>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-3 py-1 text-sm text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded"
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          ) : (
            <div
              key={s.id}
              className="flex items-center justify-between px-3 py-2 border border-neutral-700 rounded hover:bg-neutral-800 group"
            >
              <div>
                <p className="text-sm text-neutral-100">{s.name}</p>
                <p className="text-xs text-neutral-500">
                  {(() => {
                    try {
                      const cfg = JSON.parse(s.config) as Partial<SshConfig>;
                      return `${cfg.username ?? ""}@${cfg.host ?? ""}:${cfg.port ?? 22}`;
                    } catch {
                      return "";
                    }
                  })()}
                </p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => startEdit(s)}
                  className="px-2 py-1 text-xs text-neutral-400 hover:text-neutral-100"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(s.id)}
                  className="px-2 py-1 text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}

        {/* New profile inline form */}
        {editing === "new" && (
          <div className="border border-neutral-700 rounded p-4 flex flex-col gap-3">
            <SshForm value={form} onChange={setForm} />
            {saveError && (
              <p className="text-xs text-red-400">{saveError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={cancel}
                className="px-3 py-1 text-sm text-neutral-400 hover:text-neutral-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1 text-sm text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
