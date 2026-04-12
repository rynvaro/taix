import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { ptyWrite, onPtyOutput, onPtyExit } from "../services/pty";
import { useSessionStore } from "../stores/sessionStore";
import { useSettingsStore } from "../stores/settingsStore";

export interface UseTerminalResult {
  terminalRef: React.RefObject<Terminal | null>;
  fitAddonRef: React.RefObject<FitAddon | null>;
}

export function useTerminal(
  sessionId: string,
  containerRef: React.RefObject<HTMLDivElement | null>
): UseTerminalResult {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const appearance = useSettingsStore((s) => s.config?.appearance);
  const markExited = useSessionStore((s) => s.markSessionExited);

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
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.open(el);

    // Small delay before fit to let the DOM settle
    requestAnimationFrame(() => fitAddon.fit());

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

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

    onPtyOutput(sessionId, (data) => terminal.write(data)).then((fn) => {
      outputUnlisten = fn;
    });

    onPtyExit(sessionId, () => {
      terminal.writeln("\r\n\x1b[90m[Process exited]\x1b[0m");
      markExited(sessionId);
    }).then((fn) => {
      exitUnlisten = fn;
    });

    return () => {
      dataDisposable.dispose();
      outputUnlisten?.();
      exitUnlisten?.();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { terminalRef, fitAddonRef };
}
