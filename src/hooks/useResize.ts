import { useEffect, useRef } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { ptyResize } from "../services/pty";
import { useSessionStore } from "../stores/sessionStore";

const DEBOUNCE_MS = 50;

export function useResize(
  containerRef: React.RefObject<HTMLDivElement | null>,
  fitAddonRef: React.RefObject<FitAddon | null>,
  terminalRef: React.RefObject<Terminal | null>,
  sessionId: string
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setTerminalSize = useSessionStore((s) => s.setTerminalSize);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const fit = fitAddonRef.current;
        const term = terminalRef.current;
        if (!fit || !term) return;

        fit.fit();
        const { rows, cols } = term;
        setTerminalSize(sessionId, rows, cols);
        ptyResize(sessionId, rows, cols).catch((e) =>
          console.error("[useResize] ptyResize error:", e)
        );
      }, DEBOUNCE_MS);
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [sessionId, setTerminalSize]); // eslint-disable-line react-hooks/exhaustive-deps
}
