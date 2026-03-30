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
      const isTouch = e.pointerType === "touch";

      const target = e.currentTarget as HTMLElement;

      // On touch: capture pointer on the element to prevent swipe interference.
      // On mouse: use document-level listeners to preserve normal click behavior.
      if (isTouch) {
        target.setPointerCapture(pointerId);
        holdTargetRef.current = target;
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
        cancelHold();
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

      cancelHold();
      holdTimer.current = setTimeout(() => {
        holdTimer.current = null;
        const el = isTouch ? target : document;
        el.removeEventListener("pointermove", onHoldMove as EventListener);
        el.removeEventListener("pointerup", onHoldUp);
        el.removeEventListener("pointercancel", onHoldUp);
        if (isTouch) {
          try { target.releasePointerCapture(pointerId); } catch {}
          holdTargetRef.current = null;
        }

        snapshotCellRects();
        const cellRect = cellRectsRef.current.get(gridPos);
        const gx = cellRect ? clientX - cellRect.left : 0;
        const gy = cellRect ? clientY - cellRect.top : 0;
        const pos = getPointerRelToPage(clientX, clientY);

        activeRef.current = true;

        // Add document-level listeners immediately to avoid a gap between
        // releasing pointer capture and the useEffect adding them.
        // On iPhone, the touch is lost during this gap.
        installDocListeners();

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

  // Document-level drag listeners.
  // installDocListeners() is called eagerly from the hold-timer callback
  // so there is no gap between releasing pointer capture and listening for
  // moves/up.  The useEffect below acts as a safety net and handles cleanup.
  const docCleanupRef = useRef<(() => void) | null>(null);

  function installDocListeners() {
    // Prevent double-install
    if (docCleanupRef.current) return;

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
          queueMicrotask(() => onReorderRef.current(prev.sourcePos, prev.targetPos!));
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

    docCleanupRef.current = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      docCleanupRef.current = null;
    };
  }

  // Cleanup when drag ends
  useEffect(() => {
    if (!drag.active && docCleanupRef.current) {
      docCleanupRef.current();
    }
  }, [drag.active]);

  return {
    drag,
    gridRef,
    pageRef,
    snapshotCellRects,
    handleCellPointerDown: handlePointerDown,
  };
}
