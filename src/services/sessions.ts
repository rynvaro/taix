/**
 * Sessions & Groups IPC service — typed wrappers around auto-generated bindings.
 */
import { commands, SavedSession, SessionGroup } from "../types/bindings";

export type { SavedSession, SessionGroup };

function unwrap<T>(
  result:
    | { status: "ok"; data: T }
    | { status: "error"; error: { message: string } }
): T {
  if (result.status === "error") throw new Error(result.error.message);
  return result.data;
}

// ── Saved sessions ────────────────────────────────────────────────────────────

/** Returns all saved sessions ordered by sort_order. */
export async function sessionsList(): Promise<SavedSession[]> {
  return unwrap(await commands.sessionsList());
}

/** Returns a single saved session by id, or null if not found. */
export async function sessionsGet(id: string): Promise<SavedSession | null> {
  return unwrap(await commands.sessionsGet(id));
}

/** Creates or replaces a saved session. */
export async function sessionsSave(session: SavedSession): Promise<void> {
  unwrap(await commands.sessionsSave(session));
}

/** Deletes a saved session by id. */
export async function sessionsDelete(id: string): Promise<void> {
  unwrap(await commands.sessionsDelete(id));
}

/** Updates sort_order of sessions to match the given id order. */
export async function sessionsReorder(ids: string[]): Promise<void> {
  unwrap(await commands.sessionsReorder(ids));
}

// ── Groups ────────────────────────────────────────────────────────────────────

/** Returns all session groups ordered by sort_order. */
export async function groupsList(): Promise<SessionGroup[]> {
  return unwrap(await commands.groupsList());
}

/** Creates a new group. */
export async function groupsCreate(
  id: string,
  name: string,
  color?: string
): Promise<void> {
  unwrap(await commands.groupsCreate(id, name, color ?? null));
}

/** Deletes a group. Sessions in the group become ungrouped. */
export async function groupsDelete(id: string): Promise<void> {
  unwrap(await commands.groupsDelete(id));
}
