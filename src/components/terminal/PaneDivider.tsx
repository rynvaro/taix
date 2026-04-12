import { useRef } from "react";
import { PaneLayout, SplitDirection } from "../../types/bindings";
import { useUiStore, collectLeafIds } from "../../stores/uiStore";

interface PaneDividerProps {
  direction: SplitDirection;
  firstPane: PaneLayout;
  secondPane: PaneLayout;
  ratio: number;
  parentLayout: Extract<PaneLayout, { type: "split" }>;
}

export function PaneDivider({
  direction,
  firstPane,
  ratio,
  parentLayout,
}: PaneDividerProps) {
  const resizePane = useUiStore((s) => s.resizePane);
  const isHorizontal = direction === "horizontal";
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // The first leaf id in the first pane — used as the anchor for resizePane.
  const anchorId = collectLeafIds(firstPane)[0] ?? collectLeafIds(firstPane)[0];

  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    // Walk up to find the split node's parent container element.
    const splitEl = (e.currentTarget as HTMLElement).parentElement;
    if (!splitEl) return;

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!dragging.current || !splitEl) return;
      const rect = splitEl.getBoundingClientRect();
      let newRatio: number;
      if (isHorizontal) {
        newRatio = (moveEvent.clientX - rect.left) / rect.width;
      } else {
        newRatio = (moveEvent.clientY - rect.top) / rect.height;
      }
      // Clamp to [0.1, 0.9]
      newRatio = Math.max(0.1, Math.min(0.9, newRatio));
      resizePane(anchorId, newRatio);
    };

    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      data-ratio={ratio}
      data-layout-id={parentLayout.direction}
      className={[
        "shrink-0 bg-neutral-700 hover:bg-blue-500 transition-colors select-none z-10",
        isHorizontal
          ? "w-1 cursor-col-resize"
          : "h-1 cursor-row-resize",
      ].join(" ")}
    />
  );
}
