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
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;

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
      const isTouch = e.pointerType === "touch";

      const target = e.currentTarget as HTMLElement;

      // On touch: capture pointer on the element to prevent swipe/scroll interference.
      // Capture stays active throughout the entire drag on touch — releasing it
      // causes iPhone Safari to fire pointercancel and kill the drag.
      // On mouse: use document-level listeners to preserve normal click behavior.
      if (isTouch) {
        target.setPointerCapture(pointerId);
      }

      function onHoldMove(ev: PointerEvent) {
        const dx = ev.clientX - startPointer.current.x;
        const dy = ev.clientY - startPointer.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
          cleanup();
        }
      }
      function onHoldUp() { cleanup(); }
      function cleanup() {
        if (holdTimer.current) {
          clearTimeout(holdTimer.current);
          holdTimer.current = null;
        }
        const el = isTouch ? target : document;
        el.removeEventListener("pointermove", onHoldMove as EventListener);
        el.removeEventListener("pointerup", onHoldUp);
        el.removeEventListener("pointercancel", onHoldUp);
        if (isTouch) {
          try { target.releasePointerCapture(pointerId); } catch {}
        }
      }

      const listenTarget = isTouch ? target : document;
      listenTarget.addEventListener("pointermove", onHoldMove as EventListener);
      listenTarget.addEventListener("pointerup", onHoldUp);
      listenTarget.addEventListener("pointercancel", onHoldUp);

      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        const el = isTouch ? target : document;
        el.removeEventListener("pointermove", onHoldMove as EventListener);
        el.removeEventListener("pointerup", onHoldUp);
        el.removeEventListener("pointercancel", onHoldUp);

        snapshotCellRects();
        const cellRect = cellRectsRef.current.get(gridPos);
        const gx = cellRect ? clientX - cellRect.left : 0;
        const gy = cellRect ? clientY - cellRect.top : 0;
        const pos = getPointerRelToPage(clientX, clientY);

        activeRef.current = true;

        // Install drag-phase listeners immediately (no useEffect gap).
        // On touch, keep pointer captured on the cell — captured elements
        // receive all pointer events regardless of finger position, and
        // clientX/clientY still reflect actual pointer coordinates for hit testing.
        function onDragMove(ev: PointerEvent) {
          ev.preventDefault();
          const p = getPointerRelToPage(ev.clientX, ev.clientY);
          const hit = hitTest(ev.clientX, ev.clientY);
          const below = hit === null && isBelowGrid(ev.clientY);
          setDrag((prev) => ({
            ...prev,
            pointerX: p.x,
            pointerY: p.y,
            targetPos: hit !== null && hit !== prev.sourcePos ? hit : null,
            belowGrid: below,
          }));
        }

        function onDragUp() {
          activeRef.current = false;
          dragCleanup();
          setDrag((prev) => {
            if (prev.active && prev.targetPos !== null && prev.targetPos !== prev.sourcePos) {
              queueMicrotask(() => onReorderRef.current(prev.sourcePos, prev.targetPos!));
            }
            return INITIAL;
          });
        }

        function onDragCancel() {
          activeRef.current = false;
          dragCleanup();
          setDrag(INITIAL);
        }

        function dragCleanup() {
          const dragEl = isTouch ? target : document;
          dragEl.removeEventListener("pointermove", onDragMove as EventListener);
          dragEl.removeEventListener("pointerup", onDragUp);
          dragEl.removeEventListener("pointercancel", onDragCancel);
          if (isTouch) {
            try { target.releasePointerCapture(pointerId); } catch {}
          }
        }

        const dragTarget = isTouch ? target : document;
        dragTarget.addEventListener("pointermove", onDragMove as EventListener);
        dragTarget.addEventListener("pointerup", onDragUp);
        dragTarget.addEventListener("pointercancel", onDragCancel);

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

  return {
    drag,
    gridRef,
    pageRef,
    snapshotCellRects,
    handleCellPointerDown: handlePointerDown,
  };
}
