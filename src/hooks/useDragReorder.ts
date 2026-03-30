import { useRef, useCallback, useState, useEffect } from "react";

export interface DragState {
  active: boolean;
  sourcePos: number;
  targetPos: number | null;
  pointerX: number;
  pointerY: number;
  grabOffsetX: number;
  grabOffsetY: number;
  belowGrid: boolean;
}

const INITIAL: DragState = {
  active: false,
  sourcePos: -1,
  targetPos: null,
  pointerX: 0,
  pointerY: 0,
  grabOffsetX: 0,
  grabOffsetY: 0,
  belowGrid: false,
};

const HOLD_MS = 200;
const MOVE_THRESHOLD = 8;

interface Options {
  onReorder: (from: number, to: number) => void;
  occupiedPositions: Set<number>;
}

export function useDragReorder({ onReorder, occupiedPositions }: Options) {
  const [drag, setDrag] = useState<DragState>(INITIAL);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPointer = useRef({ x: 0, y: 0 });
  const gridRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const cellRectsRef = useRef<Map<number, DOMRect>>(new Map());
  const activeRef = useRef(false);
  const holdTargetRef = useRef<HTMLElement | null>(null);

  function getPointerRelToPage(clientX: number, clientY: number) {
    const page = pageRef.current;
    if (!page) return { x: 0, y: 0 };
    const rect = page.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  const snapshotCellRects = useCallback(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cells = grid.querySelectorAll<HTMLElement>("[data-grid-pos]");
    const map = new Map<number, DOMRect>();
    cells.forEach((cell) => {
      const pos = Number(cell.dataset.gridPos);
      map.set(pos, cell.getBoundingClientRect());
    });
    cellRectsRef.current = map;
  }, []);

  function hitTest(clientX: number, clientY: number): number | null {
    for (const [pos, rect] of cellRectsRef.current) {
      if (
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom
      ) {
        return pos;
      }
    }
    return null;
  }

  function isBelowGrid(clientY: number): boolean {
    const grid = gridRef.current;
    if (!grid) return false;
    const rect = grid.getBoundingClientRect();
    return clientY > rect.bottom + 20;
  }

  function cancelHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    if (holdTargetRef.current) {
      holdTargetRef.current.releasePointerCapture(0);
      holdTargetRef.current = null;
    }
  }

  // Suppress context menu while hold timer is pending or drag is active
  useEffect(() => {
    function onContextMenu(e: Event) {
      if (holdTimer.current || activeRef.current) {
        e.preventDefault();
      }
    }
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent, gridPos: number) => {
      if (e.button !== 0) return;
      if (!occupiedPositions.has(gridPos)) return;

      startPointer.current = { x: e.clientX, y: e.clientY };
      const clientX = e.clientX;
      const clientY = e.clientY;
      const pointerId = e.pointerId;

      // Capture pointer on the target element during the hold phase.
      // This keeps pointermove/up flowing to this element without
      // needing document-level listeners (which interfere with swipe).
      const target = e.currentTarget as HTMLElement;
      target.setPointerCapture(pointerId);
      holdTargetRef.current = target;

      // Hold-phase movement check
      function onHoldMove(ev: PointerEvent) {
        const dx = ev.clientX - startPointer.current.x;
        const dy = ev.clientY - startPointer.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
          cleanup();
        }
      }
      function onHoldUp() { cleanup(); }
      function cleanup() {
        cancelHold();
        target.removeEventListener("pointermove", onHoldMove);
        target.removeEventListener("pointerup", onHoldUp);
        target.removeEventListener("pointercancel", onHoldUp);
        try { target.releasePointerCapture(pointerId); } catch {}
      }

      target.addEventListener("pointermove", onHoldMove);
      target.addEventListener("pointerup", onHoldUp);
      target.addEventListener("pointercancel", onHoldUp);

      cancelHold();
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        // Remove hold-phase listeners
        target.removeEventListener("pointermove", onHoldMove);
        target.removeEventListener("pointerup", onHoldUp);
        target.removeEventListener("pointercancel", onHoldUp);
        try { target.releasePointerCapture(pointerId); } catch {}
        holdTargetRef.current = null;

        snapshotCellRects();
        const cellRect = cellRectsRef.current.get(gridPos);
        const gx = cellRect ? clientX - cellRect.left : 0;
        const gy = cellRect ? clientY - cellRect.top : 0;
        const pos = getPointerRelToPage(clientX, clientY);

        activeRef.current = true;
        setDrag({
          active: true,
          sourcePos: gridPos,
          targetPos: null,
          pointerX: pos.x,
          pointerY: pos.y,
          grabOffsetX: gx,
          grabOffsetY: gy,
          belowGrid: false,
        });
      }, HOLD_MS);
    },
    [occupiedPositions, snapshotCellRects]
  );

  // Document-level listeners — only while drag is active
  useEffect(() => {
    if (!drag.active) return;

    function onMove(e: PointerEvent) {
      e.preventDefault();

      const pos = getPointerRelToPage(e.clientX, e.clientY);
      const hit = hitTest(e.clientX, e.clientY);
      const below = hit === null && isBelowGrid(e.clientY);

      setDrag((prev) => ({
        ...prev,
        pointerX: pos.x,
        pointerY: pos.y,
        targetPos: hit !== null && hit !== prev.sourcePos ? hit : null,
        belowGrid: below,
      }));
    }

    function onUp() {
      activeRef.current = false;
      setDrag((prev) => {
        if (prev.active && prev.targetPos !== null && prev.targetPos !== prev.sourcePos) {
          onReorder(prev.sourcePos, prev.targetPos);
        }
        return INITIAL;
      });
    }

    function onCancel() {
      activeRef.current = false;
      setDrag(INITIAL);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
    };
  }, [drag.active, onReorder]);

  return {
    drag,
    gridRef,
    pageRef,
    snapshotCellRects,
    handleCellPointerDown: handlePointerDown,
  };
}
