import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { listen } from "@tauri-apps/api/event";
import { ptyWrite, onPtyOutput, onPtyExit } from "../services/pty";
import { openUrl } from "../services/system";
import { useSessionStore } from "../stores/sessionStore";
import { useSettingsStore } from "../stores/settingsStore";

export interface UseTerminalResult {
  terminalRef: React.RefObject<Terminal | null>;
  fitAddonRef: React.RefObject<FitAddon | null>;
  searchAddonRef: React.RefObject<SearchAddon | null>;
  searchAddon: SearchAddon | null;
  connected: boolean;
}

export function useTerminal(
  sessionId: string,
  containerRef: React.RefObject<HTMLDivElement | null>
): UseTerminalResult {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [connected, setConnected] = useState(false);
  const [searchAddon, setSearchAddon] = useState<SearchAddon | null>(null);
  const appearance = useSettingsStore((s) => s.config?.appearance);
  const markExited = useSessionStore((s) => s.markSessionExited);
  const updateSessionTitle = useSessionStore((s) => s.updateSessionTitle);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const isDark = appearance?.theme !== "light";

    const terminal = new Terminal({
      fontFamily: appearance?.fontFamily ?? "Menlo, Monaco, Consolas, monospace",
      fontSize: appearance?.fontSize ?? 14,
      theme: {
        background: isDark ? "#1a1b1e" : "#ffffff",
        foreground: isDark ? "#c0caf5" : "#1a1b1e",
        cursor: isDark ? "#c0caf5" : "#1a1b1e",
      },
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    const searchAddonInst = new SearchAddon();
    const webLinksAddon = new WebLinksAddon(
      (event, url) => {
        // Open URL on Cmd+Click (macOS) or Ctrl+Click (Windows/Linux)
        if (event.metaKey || event.ctrlKey) {
          openUrl(url).catch((e) =>
            console.error("[useTerminal] openUrl error:", e)
          );
        }
      }
    );

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddonInst);
    terminal.loadAddon(webLinksAddon);
    terminal.open(el);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddonInst;

    // Small delay before fit to let the DOM settle; also set searchAddon state
    // here (async) so it's available for render without triggering a synchronous
    // cascading re-render inside the effect body.
    requestAnimationFrame(() => {
      fitAddon.fit();
      setSearchAddon(searchAddonInst);
    });

    // Forward keystrokes to PTY
    const dataDisposable = terminal.onData(async (data) => {
      try {
        await ptyWrite(sessionId, new TextEncoder().encode(data));
      } catch (e) {
        console.error("[useTerminal] ptyWrite error:", e);
      }
    });

    // Stream PTY output into terminal
    let outputUnlisten: (() => void) | null = null;
    let exitUnlisten: (() => void) | null = null;
    let titleUnlisten: (() => void) | null = null;

    onPtyOutput(sessionId, (data) => {
      terminal.write(data);
      setConnected(true);
    }).then((fn) => {
      outputUnlisten = fn;
    });

    onPtyExit(sessionId, () => {
      terminal.writeln("\r\n\x1b[90m[Process exited]\x1b[0m");
      markExited(sessionId);
      setConnected(true); // Clear overlay even if process exits without output
    }).then((fn) => {
      exitUnlisten = fn;
    });

    // G2: Subscribe to OSC title events emitted by the Rust reader thread.
    listen<string>(`pty://title/${sessionId}`, (event) => {
      updateSessionTitle(sessionId, event.payload);
    }).then((fn) => {
      titleUnlisten = fn;
    });

    return () => {
      dataDisposable.dispose();
      outputUnlisten?.();
      exitUnlisten?.();
      titleUnlisten?.();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      setSearchAddon(null);
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { terminalRef, fitAddonRef, searchAddonRef, searchAddon, connected };
}

