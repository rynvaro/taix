import { useCallback } from "react";
import { PaneLayout } from "../../types/bindings";
import { useUiStore } from "../../stores/uiStore";
import { TerminalTab } from "./TerminalTab";
import { PaneDivider } from "./PaneDivider";

interface PaneContainerProps {
  layout: PaneLayout;
}

export function PaneContainer({ layout }: PaneContainerProps) {
  const activePaneId = useUiStore((s) => s.activePaneId);
  const setActivePaneId = useUiStore((s) => s.setActivePaneId);

  const handleLeafClick = useCallback(
    (id: string) => setActivePaneId(id),
    [setActivePaneId]
  );

  if (layout.type === "leaf") {
    const isActive = layout.sessionId === activePaneId;
    return (
      <div
        className={`relative flex-1 min-w-0 min-h-0 overflow-hidden cursor-text ${
          isActive ? "ring-1 ring-blue-500/40 ring-inset" : ""
        }`}
        onClick={() => handleLeafClick(layout.sessionId)}
      >
        {/* TerminalTab always rendered (keep-alive); isActive controls focus ring only */}
        <TerminalTab sessionId={layout.sessionId} isActive={isActive} />
      </div>
    );
  }

  // Split node
  const isHorizontal = layout.direction === "horizontal";

  return (
    <div
      className={`flex flex-1 min-w-0 min-h-0 overflow-hidden ${
        isHorizontal ? "flex-row" : "flex-col"
      }`}
    >
      <div
        style={{
          flexBasis: `${layout.ratio * 100}%`,
          flexGrow: 0,
          flexShrink: 0,
        }}
        className={`flex min-w-0 min-h-0 overflow-hidden ${
          isHorizontal ? "flex-row" : "flex-col"
        }`}
      >
        <PaneContainer layout={layout.first} />
      </div>

      <PaneDivider
        direction={layout.direction}
        firstPane={layout.first}
        secondPane={layout.second}
        ratio={layout.ratio}
        parentLayout={layout}
      />

      <div
        style={{ flex: 1 }}
        className={`flex min-w-0 min-h-0 overflow-hidden ${
          isHorizontal ? "flex-row" : "flex-col"
        }`}
      >
        <PaneContainer layout={layout.second} />
      </div>
    </div>
  );
}
