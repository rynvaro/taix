/**
 * Config IPC service — typed wrappers around the Tauri config commands.
 */
import { commands, AppConfig } from "../types/bindings";

export type { AppConfig };

function unwrap<T>(result: { status: "ok"; data: T } | { status: "error"; error: { message: string } }): T {
  if (result.status === "error") throw new Error(result.error.message);
  return result.data;
}

/** Returns the current application configuration from the backend. */
export async function configGet(): Promise<AppConfig> {
  return unwrap(await commands.configGet());
}

/** Persists a new configuration (replaces the current one). */
export async function configSet(config: AppConfig): Promise<void> {
  unwrap(await commands.configSet(config));
}
