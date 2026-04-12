import { commands } from "../types/bindings";

/** Opens a URL in the system default browser. Only http/https URLs are allowed. */
export async function openUrl(url: string): Promise<void> {
  const result = await commands.openUrl(url);
  if (result.status === "error") {
    throw new Error(JSON.stringify(result.error));
  }
}

/** Tests TCP reachability of an SSH host:port (5 s timeout). */
export async function sshTestConnection(host: string, port: number): Promise<string> {
  const result = await commands.sshTestConnection(host, port);
  if (result.status === "error") {
    throw new Error(result.error.message);
  }
  return result.data;
}
