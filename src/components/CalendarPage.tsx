import { useState, useCallback, useMemo, useEffect, useLayoutEffect, useRef } from "react";
import type { DayEntry } from "@/lib/storage";
import { calcSlotCount } from "@/lib/storage";
import { PolaroidImage } from "@/components/PolaroidImage";
import { CalendarPicker } from "@/components/CalendarPicker";
import { useDragReorder } from "@/hooks/useDragReorder";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  date: Date;
  entries: DayEntry[];
  images: Record<string, string>;
  isToday: boolean;
  loading: boolean;
  className?: string;
  style?: React.CSSProperties;
  onImageClick?: (url: string, name: string, imageId: string) => void;
  onImageReact?: (imageId: string, emoji: string, delta: 1 | -1) => void;
  onNavigate?: (dir: "forward" | "backward") => void;
  onGoToDate?: (date: Date) => void;
  onReorder?: (from: number, to: number) => void;
  canGoForward?: boolean;
  busy?: boolean;
}

const DOUBLE_TAP_MS = 250;

export function CalendarPage({ date, entries, images, isToday, loading, className = "", style, onImageClick, onImageReact, onNavigate, onGoToDate, onReorder, canGoForward = true, busy = false }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarPageRef = useRef<HTMLDivElement | null>(null);
  const dayNum = date.getDate();
  const weekday = WEEKDAYS[date.getDay()];
  const monthYear = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

  // Base slot count from entries
  const baseSlotCount = calcSlotCount(entries);

  // During drag: freeze at the slot count when drag started, and allow expansion
  const [dragSlotCount, setDragSlotCount] = useState<number | null>(null);
  // For tweened height shrink after drag commit
  const [prevHeight, setPrevHeight] = useState<number | null>(null);
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  const slotCount = dragSlotCount ?? baseSlotCount;

  const grid: (DayEntry | null)[] = Array(slotCount).fill(null);
  entries.forEach((e) => {
    if (e.gridPos < slotCount) grid[e.gridPos] = e;
  });

  const occupiedPositions = useMemo(
    () => new Set(entries.map((e) => e.gridPos)),
    [entries]
  );

  const handleReorder = useCallback(
    (from: number, to: number) => {
      if (gridContainerRef.current) {
        setPrevHeight(gridContainerRef.current.offsetHeight);
      }
      setDragSlotCount(null);
      onReorder?.(from, to);
    },
    [onReorder]
  );

  const { drag, gridRef, pageRef, snapshotCellRects, handleCellPointerDown } = useDragReorder({
    onReorder: handleReorder,
    occupiedPositions,
  });

  // Double-tap detection: a second tap on the same polaroid within DOUBLE_TAP_MS
  // drops a heart reaction. First tap is deferred so we can cancel-and-react.
  const tapRef = useRef<{ imageId: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  useEffect(() => () => {
    if (tapRef.current) clearTimeout(tapRef.current.timer);
  }, []);

  const handlePolaroidTap = useCallback(
    (imageId: string, url: string, name: string) => {
      if (drag.active) return;
      const pending = tapRef.current;
      if (pending && pending.imageId === imageId) {
        clearTimeout(pending.timer);
        tapRef.current = null;
        if (onImageReact) {
          onImageReact(imageId, "❤️", 1);
          return;
        }
        // No reactions wired — fall through to open.
        onImageClick?.(url, name, imageId);
        return;
      }
      if (pending) clearTimeout(pending.timer);
      // If reactions aren't wired, open immediately (no point delaying).
      if (!onImageReact) {
        onImageClick?.(url, name, imageId);
        return;
      }
      const timer = setTimeout(() => {
        tapRef.current = null;
        onImageClick?.(url, name, imageId);
      }, DOUBLE_TAP_MS);
      tapRef.current = { imageId, timer };
    },
    [drag.active, onImageClick, onImageReact]
  );

  // Wire refs
  const setGridRefs = useCallback(
    (el: HTMLDivElement | null) => {
      gridContainerRef.current = el;
      gridRef.current = el;
    },
    [gridRef]
  );

  const setPageRef = useCallback(
    (el: HTMLDivElement | null) => {
      calendarPageRef.current = el;
      pageRef.current = el;
    },
    [pageRef]
  );

  // ── Height tween system ──
  // Store the "from" height before a state change; useLayoutEffect runs
  // after React commits the new DOM but before the browser paints,
  // so we can measure the new natural height and start the CSS transition.
  const fromHeight = useRef<number | null>(null);
  const tweenTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function captureHeight() {
    const el = gridContainerRef.current;
    if (!el) return;
    // Clear any in-flight tween so we measure natural height
    if (tweenTimer.current) {
      clearTimeout(tweenTimer.current);
      tweenTimer.current = null;
    }
    el.style.height = "";
    el.style.overflow = "";
    el.style.transition = "";
    fromHeight.current = el.offsetHeight;
  }

  // After any render where fromHeight was captured, tween to the new size
  useLayoutEffect(() => {
    const el = gridContainerRef.current;
    if (fromHeight.current === null || !el) return;
    const from = fromHeight.current;
    fromHeight.current = null;

    const to = el.offsetHeight;
    if (from === to) return;

    // Pin to old height
    el.style.height = `${from}px`;
    el.style.overflow = "hidden";
    // Force reflow
    el.offsetHeight;
    // Transition to new height
    el.style.transition = "height 0.3s cubic-bezier(0.2, 0, 0, 1)";
    el.style.height = `${to}px`;

    const cleanup = () => {
      el.style.height = "";
      el.style.overflow = "";
      el.style.transition = "";
      tweenTimer.current = null;
    };
    el.addEventListener("transitionend", cleanup, { once: true });
    tweenTimer.current = setTimeout(cleanup, 400);
  });

  // ── Drag start: freeze grid slot count ──
  useEffect(() => {
    if (drag.active && dragSlotCount === null) {
      setDragSlotCount(Math.max(baseSlotCount, slotCount));
    }
  }, [drag.active, dragSlotCount, baseSlotCount, slotCount]);

  // ── Drag below: expand by one row per drag session ──
  const expandedForBelow = useRef(false);
  useEffect(() => {
    if (!drag.active) {
      expandedForBelow.current = false;
    }
  }, [drag.active]);

  useEffect(() => {
    if (drag.active && drag.belowGrid && dragSlotCount !== null && !expandedForBelow.current) {
      const current = dragSlotCount ?? baseSlotCount;
      // Don't expand beyond 10 rows (30 slots)
      if (current >= 30) return;
      // Beyond the initial 3x3: don't expand if the dragged image is the sole
      // entry on the last row, since dragging it away would leave that row empty
      if (current > 9) {
        const lastRowStart = current - 3;
        const sourceRow = Math.floor(drag.sourcePos / 3);
        const lastRow = (current / 3) - 1;
        if (sourceRow === lastRow) {
          const othersInLastRow = entries.filter(
            (e) => e.gridPos >= lastRowStart && e.gridPos < current && e.gridPos !== drag.sourcePos
          );
          if (othersInLastRow.length === 0) return;
        }
      }
      expandedForBelow.current = true;
      captureHeight();
      setDragSlotCount((prev) => {
        const next = (prev ?? baseSlotCount) + 3;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => snapshotCellRects());
        });
        return next;
      });
    }
  }, [drag.active, drag.belowGrid, dragSlotCount, baseSlotCount, entries, snapshotCellRects]);

  // ── Drag end: tween back to natural size ──
  const wasDragging = useRef(false);
  useEffect(() => {
    if (drag.active) {
      wasDragging.current = true;
    } else if (wasDragging.current) {
      wasDragging.current = false;
      if (dragSlotCount !== null) {
        captureHeight();
        setDragSlotCount(null);
      }
    }
  }, [drag.active, dragSlotCount]);

  // ── Reorder commit: tween from captured pre-reorder height ──
  useEffect(() => {
    if (prevHeight !== null) {
      fromHeight.current = prevHeight;
      setPrevHeight(null);
      // The useLayoutEffect above will handle the tween on next render
    }
  }, [prevHeight]);

  const sourceEntry = drag.active ? grid[drag.sourcePos] : null;
  const targetEntry = drag.active && drag.targetPos !== null ? grid[drag.targetPos] : null;

  // ── FLIP animation for swap preview ──
  // Track by cell position: when targetPos changes, the content of certain cells
  // changes. We capture each cell's center BEFORE React re-renders, then after
  // render we animate the new content from the old cell's position.
  const prevTargetPos = useRef<number | null>(null);
  // Maps: cell position → old bounding rect of that cell
  const flipCellRects = useRef<Map<number, DOMRect>>(new Map());

  // Before render: capture cell rects that will have their content swapped
  if (drag.active && drag.targetPos !== prevTargetPos.current) {
    const gridEl = gridContainerRef.current;
    if (gridEl) {
      const rects = new Map<number, DOMRect>();
      // Cells whose content will change: source, old target, new target
      const cellsToCapture = [drag.sourcePos, prevTargetPos.current, drag.targetPos];
      for (const pos of cellsToCapture) {
        if (pos === null || pos === undefined) continue;
        const cell = gridEl.querySelector(`[data-grid-pos="${pos}"]`) as HTMLElement | null;
        if (cell) rects.set(pos, cell.getBoundingClientRect());
      }
      flipCellRects.current = rects;
    }
    prevTargetPos.current = drag.targetPos;
  }
  if (!drag.active) {
    prevTargetPos.current = null;
    flipCellRects.current.clear();
  }

  // After render: for cells that swapped content, the image that WAS in cell A
  // is now rendered in cell B. Animate it from A's position to B's position.
  useLayoutEffect(() => {
    if (flipCellRects.current.size === 0) return;
    const gridEl = gridContainerRef.current;
    if (!gridEl) return;

    const oldRects = flipCellRects.current;
    flipCellRects.current = new Map();

    // Build a map of which cell's old content moved where:
    // If source was at S and target at T, after swap:
    //   - Cell S now shows what was in T → animate from T's old rect to S's new rect
    //   - Cell T now shows what was in S → animate from S's old rect to T's new rect
    const sourcePos = drag.sourcePos;
    const targetPos = drag.targetPos;

    const moves: Array<{ cellPos: number; fromRect: DOMRect }> = [];
    if (targetPos !== null && oldRects.has(sourcePos) && oldRects.has(targetPos)) {
      // Cell at sourcePos now has target's content → came from targetPos
      moves.push({ cellPos: sourcePos, fromRect: oldRects.get(targetPos)! });
      // Cell at targetPos now has source's content → came from sourcePos
      moves.push({ cellPos: targetPos, fromRect: oldRects.get(sourcePos)! });
    } else if (targetPos === null) {
      // Unhovered: content moved back to original cells
      // Old target (prevTargetPos already updated, but we captured its rect)
      for (const [pos, rect] of oldRects) {
        if (pos !== sourcePos) {
          // This was the old target, its content went back to source
          moves.push({ cellPos: sourcePos, fromRect: rect });
          // Source content went back to this cell
          moves.push({ cellPos: pos, fromRect: oldRects.get(sourcePos)! });
        }
      }
    }

    for (const { cellPos, fromRect } of moves) {
      const frame = gridEl.querySelector(`[data-grid-pos="${cellPos}"] .polaroid-frame`) as HTMLElement | null;
      if (!frame) continue;
      const newRect = frame.getBoundingClientRect();
      const dx = fromRect.left - newRect.left;
      const dy = fromRect.top - newRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      frame.style.transform = `translate(${dx}px, ${dy}px)`;
      frame.style.transition = "none";
      frame.offsetHeight;
      frame.style.transition = "transform 0.35s cubic-bezier(0.25, 0.1, 0.25, 1)";
      frame.style.transform = "";
    }
  });

  // Calculate separator position (top of first expanded row)
  const showExpandSeparator = drag.active && dragSlotCount !== null && dragSlotCount > baseSlotCount;
  const [separatorTop, setSeparatorTop] = useState(0);
  useLayoutEffect(() => {
    if (showExpandSeparator && gridContainerRef.current) {
      const cell = gridContainerRef.current.querySelector(`[data-grid-pos="${baseSlotCount}"]`) as HTMLElement | null;
      if (cell) {
        setSeparatorTop(cell.offsetTop - 4); // 4px = half of grid gap
      }
    }
  });

  return (
    <div className={`calendar-page ${className}`} style={style} ref={setPageRef}>
      <div className="page-header">
        <div className="page-weekday">{weekday}</div>
        <div className="page-day-nav">
          {onNavigate && (
            <button className="nav-arrow nav-arrow-left" onClick={() => onNavigate("backward")} disabled={busy}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <button
            className="page-day-number"
            onClick={() => setCalendarOpen(true)}
            title="Open calendar"
          >
            {dayNum}
            {isToday && (
              <svg className="today-circle" viewBox="0 0 120 100" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M 92 58
                     C 96 34, 78 14, 52 16
                     C 26 18, 8 38, 12 56
                     C 16 74, 38 88, 62 84
                     C 86 80, 100 66, 96 50"
                  fill="none"
                  stroke="#c0583a"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
          {onNavigate && (
            <button
              className="nav-arrow nav-arrow-right"
              onClick={() => onNavigate("forward")}
              disabled={!canGoForward || busy}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          )}
        </div>
        <div className="page-month-year">{monthYear}</div>
      </div>

      {calendarOpen && onGoToDate && (
        <CalendarPicker
          currentDate={date}
          onSelect={(d) => { onGoToDate(d); setCalendarOpen(false); }}
          onClose={() => setCalendarOpen(false)}
        />
      )}

      <div className="perf-line" />

      <div
        className="photo-grid"
        ref={setGridRefs}
      >
        {loading ? (
          <div className="grid-loading">Loading...</div>
        ) : (
          grid.map((entry, i) => {
            const isDragSource = drag.active && i === drag.sourcePos;
            const isDragTarget = drag.active && i === drag.targetPos;

            let displayEntry = entry;
            let previewSwap = false;
            let hideSource = false;
            if (isDragSource && targetEntry) {
              // Source slot shows the target's photo (preview of where it will land)
              displayEntry = targetEntry;
              previewSwap = true;
            } else if (isDragSource) {
              hideSource = true;
            } else if (isDragTarget) {
              // Target slot: hide its photo (it's shown as preview in the source slot)
              hideSource = true;
            }

            return (
              <div
                key={i}
                data-grid-pos={i}
                className={`grid-cell${isDragTarget ? " drag-target" : ""}${isDragSource ? " drag-source" : ""}`}
                onPointerDown={(e) => handleCellPointerDown(e, i)}
              >
                {displayEntry && images[displayEntry.imageId] ? (
                  <PolaroidImage
                    entry={displayEntry}
                    imageUrl={images[displayEntry.imageId]}
                    onClick={() =>
                      handlePolaroidTap(
                        displayEntry.imageId,
                        images[displayEntry.imageId],
                        displayEntry.name
                      )
                    }
                    className={previewSwap ? "swap-preview" : hideSource ? "drag-hidden" : ""}
                  />
                ) : null}
              </div>
            );
          })
        )}

        {showExpandSeparator && (
          <div className="grid-expand-separator" style={{ top: separatorTop }} />
        )}
      </div>

      {/* Floating dragged polaroid — positioned relative to the calendar page */}
      {drag.active && sourceEntry && images[sourceEntry.imageId] && (
        <div
          className="drag-overlay"
          style={{
            transform: `translate(${drag.pointerX - drag.grabOffsetX}px, ${drag.pointerY - drag.grabOffsetY}px)`,
          }}
        >
          <PolaroidImage
            entry={{ ...sourceEntry, tilt: 0, offsetX: 0, offsetY: 0 }}
            imageUrl={images[sourceEntry.imageId]}
            onClick={() => {}}
            className="dragging"
          />
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="empty-state">
          No pictures yet{isToday ? " — be the first!" : ""}
        </div>
      )}
    </div>
  );
}
