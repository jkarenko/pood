import { useRef, useCallback, useEffect } from "react";

export interface SwipeState {
  active: boolean;
  direction: "forward" | "backward" | null;
  /** 0 = idle, 1 = fully committed */
  progress: number;
  /** true while animating after finger release */
  settling: boolean;
}

interface Options {
  canGoForward: boolean;
  canGoBackward: boolean;
  onCommit: (dir: "forward" | "backward") => void;
  /** Called when swipe starts so the caller can pre-fetch */
  onStart?: (dir: "forward" | "backward") => void;
}

const THRESHOLD = 0.3;
const MIN_SWIPE_PX = 8;
const SETTLE_DURATION = 280;
/** Max progress change per frame (~60fps → max ~0.05/frame → full swipe takes min ~330ms) */
const MAX_PROGRESS_PER_FRAME = 0.05;

export function useSwipeNavigation(
  opts: Options,
  setState: (s: SwipeState) => void
) {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const stateRef = useRef<SwipeState>({
    active: false,
    direction: null,
    progress: 0,
    settling: false,
  });

  const touchRef = useRef<{
    startX: number;
    startY: number;
    started: boolean;
    direction: "forward" | "backward" | null;
    containerWidth: number;
    displayedProgress: number;
  } | null>(null);

  const update = useCallback(
    (patch: Partial<SwipeState>) => {
      stateRef.current = { ...stateRef.current, ...patch };
      setState(stateRef.current);
    },
    [setState]
  );

  const settle = useCallback(
    (from: number, to: number, dir: "forward" | "backward" | null, commit: boolean) => {
      update({ settling: true });
      const start = performance.now();

      function tick(now: number) {
        const elapsed = now - start;
        const t = Math.min(elapsed / SETTLE_DURATION, 1);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        const progress = from + (to - from) * eased;

        update({ progress, direction: dir, active: true, settling: true });

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          if (commit && dir) {
            // onCommit will call setCurrent; the caller is responsible
            // for clearing swipe state after React renders the new page
            optsRef.current.onCommit(dir);
          } else {
            update({ active: false, direction: null, progress: 0, settling: false });
          }
        }
      }

      requestAnimationFrame(tick);
    },
    [update]
  );

  const onTouchStart = useCallback((e: TouchEvent) => {
    if (stateRef.current.settling) return;
    const touch = e.touches[0];
    // Ignore touches near screen edges (< 20px) — let browser handle those
    if (touch.clientX < 20 || touch.clientX > window.innerWidth - 20) return;
    // Ignore touches on polaroid images — those belong to drag-to-reorder
    const target = e.target as HTMLElement;
    if (target.closest(".polaroid-container")) return;
    touchRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      started: false,
      direction: null,
      containerWidth: (e.currentTarget as HTMLElement).offsetWidth,
      displayedProgress: 0,
    };
  }, []);

  const onTouchMove = useCallback(
    (e: TouchEvent) => {
      const t = touchRef.current;
      if (!t) return;

      const touch = e.touches[0];
      const dx = touch.clientX - t.startX;
      const dy = touch.clientY - t.startY;

      // Decide direction on first significant movement
      if (!t.started) {
        if (Math.abs(dx) < MIN_SWIPE_PX && Math.abs(dy) < MIN_SWIPE_PX) return;
        // If clearly more vertical than horizontal, bail — let browser scroll
        if (Math.abs(dy) > Math.abs(dx) * 1.5) {
          touchRef.current = null;
          return;
        }
        // Horizontal intent detected — prevent browser gesture immediately
        e.preventDefault();
        // Swipe left (dx < 0) = forward (next/newer day)
        // Swipe right (dx > 0) = backward (previous/older day)
        const dir = dx < 0 ? "forward" : "backward";
        if (dir === "forward" && !optsRef.current.canGoForward) {
          touchRef.current = null;
          return;
        }
        if (dir === "backward" && !optsRef.current.canGoBackward) {
          touchRef.current = null;
          return;
        }
        t.started = true;
        t.direction = dir;
        optsRef.current.onStart?.(dir);
      }

      e.preventDefault();

      const absDx = Math.abs(dx);
      const rawProgress = Math.min(absDx / (t.containerWidth * 0.7), 1);

      // Clamp speed: progress can't jump more than MAX_PROGRESS_PER_FRAME per move event
      const delta = rawProgress - t.displayedProgress;
      const clampedDelta = Math.sign(delta) * Math.min(Math.abs(delta), MAX_PROGRESS_PER_FRAME);
      const progress = Math.max(0, Math.min(1, t.displayedProgress + clampedDelta));
      t.displayedProgress = progress;

      update({
        active: true,
        direction: t.direction,
        progress,
        settling: false,
      });
    },
    [update]
  );

  const onTouchEnd = useCallback(() => {
    const t = touchRef.current;
    touchRef.current = null;

    if (!t?.started || !stateRef.current.active) {
      update({ active: false, direction: null, progress: 0, settling: false });
      return;
    }

    const { progress, direction } = stateRef.current;

    if (progress >= THRESHOLD) {
      // Commit — animate to 1 then trigger navigation
      settle(progress, 1, direction, true);
    } else {
      // Cancel — animate back to 0
      settle(progress, 0, direction, false);
    }
  }, [update, settle]);

  const refCallback = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;

      el.addEventListener("touchstart", onTouchStart, { passive: false });
      el.addEventListener("touchmove", onTouchMove, { passive: false });
      el.addEventListener("touchend", onTouchEnd, { passive: true });
      el.addEventListener("touchcancel", onTouchEnd, { passive: true });

      // Store cleanup
      (el as any).__swipeCleanup = () => {
        el.removeEventListener("touchstart", onTouchStart);
        el.removeEventListener("touchmove", onTouchMove);
        el.removeEventListener("touchend", onTouchEnd);
        el.removeEventListener("touchcancel", onTouchEnd);
      };
    },
    [onTouchStart, onTouchMove, onTouchEnd]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup handled by ref detach
    };
  }, []);

  return refCallback;
}

/** Map swipe progress (0–1) to tear-off inline styles */
export function getTearStyle(
  direction: "forward" | "backward",
  progress: number
): React.CSSProperties {
  if (direction === "forward") {
    // Swipe left → next day: hinge top-left, rotate CW (peel up), then fly left
    // Phase 1 (0–0.5): hinge rotation, page peels up clockwise
    // Phase 2 (0.5–1): translate left and fade
    const rotate = progress < 0.5
      ? progress * 2 * 45            // 0 → 45°
      : 45 - (progress - 0.5) * 2 * 10; // 45° → 35° (straightens slightly as it flies)
    const translateX = progress < 0.5
      ? 0
      : -((progress - 0.5) * 2 * 120);  // 0 → -120vw
    const opacity = progress < 0.5
      ? 1
      : 1 - (progress - 0.5) * 2;
    return {
      transform: `translateX(${translateX}vw) rotate(${rotate}deg)`,
      opacity,
      transformOrigin: "top left",
    };
  } else {
    // Swipe right → prev day: fly in from left, then hinge CW back into place
    // Phase 1 (0–0.5): fly in from left
    // Phase 2 (0.5–1): hinge rotation settles back to 0
    const rotate = progress < 0.5
      ? 35 + progress * 2 * 10       // 35° → 45°
      : 45 - (progress - 0.5) * 2 * 45; // 45° → 0°
    const translateX = progress < 0.5
      ? -120 + progress * 2 * 120    // -120vw → 0
      : 0;
    const opacity = progress < 0.5
      ? progress * 2
      : 1;
    return {
      transform: `translateX(${translateX}vw) rotate(${rotate}deg)`,
      opacity,
      transformOrigin: "top left",
    };
  }
}
