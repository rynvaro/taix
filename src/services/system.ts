import { commands } from "../types/bindings";

/** Opens a URL in the system default browser. Only http/https URLs are allowed. */
export async function openUrl(url: string): Promise<void> {
  const result = await commands.openUrl(url);
  if (result.status === "error") {
    throw new Error(JSON.stringify(result.error));
  }
}
