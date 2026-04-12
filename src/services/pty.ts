/**
 * PTY IPC service — typed wrappers around the auto-generated Tauri bindings.
 * All functions throw on error so callers use normal async/await error handling.
 */
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { commands, SessionConfig, SessionInfo } from "../types/bindings";

export type { SessionConfig, SessionInfo };
export type SessionId = string;

function unwrap<T>(result: { status: "ok"; data: T } | { status: "error"; error: { message: string } }): T {
  if (result.status === "error") throw new Error(result.error.message);
  return result.data;
}

/** Returns the platform-default shell path (e.g. /bin/zsh on macOS). */
export async function ptyDefaultShell(): Promise<string> {
  return commands.ptyDefaultShell();
}

/** Creates a new PTY session and returns its ID. */
export async function ptyCreate(config: SessionConfig): Promise<SessionId> {
  return unwrap(await commands.ptyCreate(config));
}

/** Sends raw bytes to the PTY (user keystrokes). */
export async function ptyWrite(sessionId: SessionId, data: Uint8Array): Promise<void> {
  unwrap(await commands.ptyWrite(sessionId, Array.from(data)));
}

/** Notifies the PTY of a terminal resize. */
export async function ptyResize(sessionId: SessionId, rows: number, cols: number): Promise<void> {
  unwrap(await commands.ptyResize(sessionId, rows, cols));
}

/** Closes the PTY session and kills the shell process. */
export async function ptyClose(sessionId: SessionId): Promise<void> {
  unwrap(await commands.ptyClose(sessionId));
}

/** Returns metadata for all active sessions. */
export async function ptyListActive(): Promise<SessionInfo[]> {
  return unwrap(await commands.ptyListActive());
}

/**
 * Subscribes to PTY output for the given session.
 * Returns an unlisten function that should be called on cleanup.
 */
export function onPtyOutput(
  sessionId: SessionId,
  handler: (data: Uint8Array) => void
): Promise<UnlistenFn> {
  return listen<number[]>(`pty://output/${sessionId}`, (event) => {
    handler(new Uint8Array(event.payload));
  });
}

/**
 * Subscribes to the PTY exit event for the given session.
 * Returns an unlisten function that should be called on cleanup.
 */
export function onPtyExit(sessionId: SessionId, handler: () => void): Promise<UnlistenFn> {
  return listen(`pty://exit/${sessionId}`, () => {
    handler();
  });
}
