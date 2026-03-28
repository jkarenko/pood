import { useState, useEffect, useCallback, useRef } from "react";
import "./App.css";
import {
  useSwipeNavigation,
  getTearStyle,
  type SwipeState,
} from "@/hooks/useSwipeNavigation";
import { CalendarPage } from "@/components/CalendarPage";
import { ImageViewer } from "@/components/ImageViewer";
import { UploadDialog } from "@/components/UploadDialog";
import { HandshakePrompt } from "@/components/HandshakePrompt";
import { GroupSwitcher } from "@/components/GroupSwitcher";
import {
  getActivePhrase,
  getStoredPhrases,
  addHandshake,
  switchHandshake,
  removeHandshake,
  migrateIfNeeded,
} from "@/lib/handshake";
import type { DayData, DayEntry } from "@/lib/storage";
import {
  loadDayData,
  saveDayData,
  loadImage,
  saveImage,
  deleteEntry,
  loadLastName,
  saveLastName,
  getAvailableSlot,
  randomTilt,
  randomOffset,
  resizeImage,
} from "@/lib/storage";

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

interface DayState {
  date: Date;
  data: DayData;
  images: Record<number, string>;
  loading: boolean;
}

async function fetchDay(date: Date): Promise<DayState> {
  const data = await loadDayData(date);
  const imgs: Record<number, string> = {};
  await Promise.all(
    data.entries.map(async (e) => {
      const img = await loadImage(date, e.gridPos);
      if (img) imgs[e.gridPos] = img;
    })
  );
  return { date, data, images: imgs, loading: false };
}

export default function App() {
  migrateIfNeeded();
  const [activePhrase, setActivePhrase] = useState(() => getActivePhrase());
  const [phrases, setPhrases] = useState(() => getStoredPhrases());
  const [current, setCurrent] = useState<DayState>({
    date: new Date(),
    data: { entries: [] },
    images: {},
    loading: true,
  });
  const [trans, setTrans] = useState<DayState | null>(null);
  const [animDir, setAnimDir] = useState<"forward" | "backward" | null>(null);
  const [animating, setAnimating] = useState(false);

  const [viewImage, setViewImage] = useState<{ url: string; name: string; gridPos: number } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lastName, setLastName] = useState("");

  // Swipe navigation
  const [swipe, setSwipe] = useState<SwipeState>({
    active: false,
    direction: null,
    progress: 0,
    settling: false,
  });
  const [swipeTarget, setSwipeTarget] = useState<DayState | null>(null);

  const today = new Date();
  const isToday = isSameDay(current.date, today);

  async function handleHandshake(phrase: string) {
    await addHandshake(phrase);
    setActivePhrase(phrase.trim().toLowerCase().slice(0, 20));
    setPhrases(getStoredPhrases());
  }

  async function handleSwitch(phrase: string) {
    await switchHandshake(phrase);
    setActivePhrase(phrase);
    setCurrent((prev) => ({ ...prev, loading: true, data: { entries: [] }, images: {} }));
  }

  async function handleAddGroup(phrase: string) {
    await addHandshake(phrase);
    setActivePhrase(phrase.trim().toLowerCase().slice(0, 20));
    setPhrases(getStoredPhrases());
    setCurrent((prev) => ({ ...prev, loading: true, data: { entries: [] }, images: {} }));
  }

  function handleRemoveGroup(phrase: string) {
    const newActive = removeHandshake(phrase);
    setPhrases(getStoredPhrases());
    if (newActive) {
      setActivePhrase(newActive);
      setCurrent((prev) => ({ ...prev, loading: true, data: { entries: [] }, images: {} }));
    } else {
      setActivePhrase(null);
    }
  }

  // Load data when active group changes
  useEffect(() => {
    if (!activePhrase) return;
    fetchDay(new Date()).then(setCurrent);
    loadLastName().then(setLastName);
  }, [activePhrase]);

  async function navigate(dir: "forward" | "backward") {
    if (animating) return;
    if (dir === "forward" && isSameDay(current.date, today)) return;

    const targetDate = addDays(current.date, dir === "forward" ? 1 : -1);
    const targetState = await fetchDay(targetDate);

    setTrans(targetState);
    setAnimDir(dir);
    setAnimating(true);

    const duration = dir === "forward" ? 700 : 600;
    setTimeout(() => {
      setCurrent(targetState);
      setTrans(null);
      setAnimDir(null);
      setAnimating(false);
    }, duration);
  }

  async function handleUpload(file: File, name: string) {
    const slot = getAvailableSlot(current.data.entries);
    if (slot === null) return;

    const dataUrl = await resizeImage(file);
    const entry: DayEntry = {
      gridPos: slot,
      name,
      tilt: randomTilt(),
      offsetX: randomOffset(),
      offsetY: randomOffset(),
    };

    const newData: DayData = { entries: [...current.data.entries, entry] };
    await saveDayData(current.date, newData);
    await saveImage(current.date, slot, dataUrl);
    await saveLastName(name);
    setLastName(name);
    setCurrent((prev) => ({
      ...prev,
      data: newData,
      images: { ...prev.images, [slot]: dataUrl },
    }));
    setUploadOpen(false);
  }

  function handleImageClick(url: string, name: string, gridPos: number) {
    if (!busy) setViewImage({ url, name, gridPos });
  }

  async function handleDelete() {
    if (!viewImage) return;
    const { gridPos } = viewImage;
    await deleteEntry(current.date, gridPos);
    const newEntries = current.data.entries.filter((e) => e.gridPos !== gridPos);
    const newImages = { ...current.images };
    delete newImages[gridPos];
    setCurrent((prev) => ({
      ...prev,
      data: { entries: newEntries },
      images: newImages,
    }));
    setViewImage(null);
  }

  const isFull = current.data.entries.length >= 9;
  const canGoForward = !isSameDay(current.date, today);

  const swipeRef = useSwipeNavigation(
    {
      canGoForward,
      canGoBackward: true,
      onStart: (dir) => {
        const targetDate = addDays(current.date, dir === "forward" ? 1 : -1);
        fetchDay(targetDate).then(setSwipeTarget);
      },
      onCommit: () => {
        setSwipeTarget((target) => {
          if (target) setCurrent(target);
          return null;
        });
      },
    },
    setSwipe
  );

  const pageStackRef = useRef<HTMLElement | null>(null);
  const combinedRef = useCallback(
    (el: HTMLElement | null) => {
      pageStackRef.current = el;
      swipeRef(el);
    },
    [swipeRef]
  );

  // Clear swipe overlay after React has rendered the new current page
  useEffect(() => {
    if (swipe.settling && swipe.progress >= 1) {
      setSwipe({ active: false, direction: null, progress: 0, settling: false });
      setSwipeTarget(null);

      // Synthetic tap to re-anchor browser gesture state for the next swipe
      const el = pageStackRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        el.dispatchEvent(new TouchEvent("touchstart", {
          bubbles: true,
          cancelable: true,
          touches: [new Touch({ identifier: 0, target: el, clientX: cx, clientY: cy })],
        }));
        el.dispatchEvent(new TouchEvent("touchend", {
          bubbles: true,
          cancelable: true,
          changedTouches: [new Touch({ identifier: 0, target: el, clientX: cx, clientY: cy })],
        }));
      }
    }
  }, [current, swipe.settling, swipe.progress]);

  const busy = animating || swipe.active;

  /*
   * Layer stacking during animation:
   *   Forward (tear-off):  bottom = trans (next day, static)
   *                        top    = current (tearing off, animated)
   *   Backward (put-back): bottom = current (stays visible)
   *                        top    = trans (prev day, flying in)
   */

  if (!activePhrase) {
    return <HandshakePrompt onSubmit={handleHandshake} />;
  }

  return (
    <div className="app-root">
      <div className="calendar-container">
        {/* Torn stubs with group switcher */}
        <div className="torn-stubs">
          <GroupSwitcher
            phrases={phrases}
            activePhrase={activePhrase}
            onSwitch={handleSwitch}
            onAdd={handleAddGroup}
            onRemove={handleRemoveGroup}
          />
        </div>

        {/* Page stack */}
        <div className="page-stack" ref={combinedRef}>
          {/* --- Swipe: gesture-driven layers --- */}
          {/* Forward (swipe left): next day sits underneath, current tears off on top */}
          {swipe.active && swipe.direction === "forward" && swipeTarget && (
            <CalendarPage
              date={swipeTarget.date}
              entries={swipeTarget.data.entries}
              images={swipeTarget.images}
              isToday={isSameDay(swipeTarget.date, today)}
              loading={swipeTarget.loading}
              className="page-layer-bottom"
              onImageClick={handleImageClick}
            />
          )}

          {/* Backward (swipe right): current stays underneath, prev day flies in on top */}
          {swipe.active && swipe.direction === "backward" && (
            <CalendarPage
              date={current.date}
              entries={current.data.entries}
              images={current.images}
              isToday={isSameDay(current.date, today)}
              loading={current.loading}
              className="page-layer-bottom"
              onImageClick={handleImageClick}
            />
          )}

          {/* --- CSS animation layers (button clicks) --- */}
          {!swipe.active && animDir === "forward" && trans && (
            <CalendarPage
              date={trans.date}
              entries={trans.data.entries}
              images={trans.images}
              isToday={isSameDay(trans.date, today)}
              loading={trans.loading}
              className="page-layer-bottom"
              onImageClick={handleImageClick}
            />
          )}

          {!swipe.active && animDir === "backward" && (
            <CalendarPage
              date={current.date}
              entries={current.data.entries}
              images={current.images}
              isToday={isSameDay(current.date, today)}
              loading={current.loading}
              className="page-layer-bottom"
              onImageClick={handleImageClick}
            />
          )}

          {/* --- The main/animated page --- */}
          {swipe.active ? (
            swipe.direction === "forward" ? (
              /* Forward: current page tears off on top */
              <CalendarPage
                date={current.date}
                entries={current.data.entries}
                images={current.images}
                isToday={isSameDay(current.date, today)}
                loading={current.loading}
                className="page-layer-top"
                style={getTearStyle("forward", swipe.progress)}
                onImageClick={handleImageClick}
              />
            ) : swipe.direction === "backward" && swipeTarget ? (
              /* Backward: prev day flies in on top */
              <CalendarPage
                date={swipeTarget.date}
                entries={swipeTarget.data.entries}
                images={swipeTarget.images}
                isToday={isSameDay(swipeTarget.date, today)}
                loading={swipeTarget.loading}
                className="page-layer-top"
                style={getTearStyle("backward", swipe.progress)}
                onImageClick={handleImageClick}
              />
            ) : (
              <CalendarPage
                date={current.date}
                entries={current.data.entries}
                images={current.images}
                isToday={isToday}
                loading={current.loading}
                onImageClick={handleImageClick}
              />
            )
          ) : animDir === "forward" ? (
            <CalendarPage
              date={current.date}
              entries={current.data.entries}
              images={current.images}
              isToday={isSameDay(current.date, today)}
              loading={current.loading}
              className="page-layer-top tear-forward"
              onImageClick={handleImageClick}
            />
          ) : animDir === "backward" && trans ? (
            <CalendarPage
              date={trans.date}
              entries={trans.data.entries}
              images={trans.images}
              isToday={isSameDay(trans.date, today)}
              loading={trans.loading}
              className="page-layer-top tear-backward"
              onImageClick={handleImageClick}
            />
          ) : (
            <CalendarPage
              date={current.date}
              entries={current.data.entries}
              images={current.images}
              isToday={isToday}
              loading={current.loading}
              onImageClick={handleImageClick}
            />
          )}
        </div>

        {/* Navigation */}
        <div className="nav-row">
          <button className="nav-btn" onClick={() => navigate("backward")} disabled={busy}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {isToday ? (
            <button
              className="add-btn"
              onClick={() => setUploadOpen(true)}
              disabled={isFull}
              title={isFull ? "Today's page is full" : "Add your picture"}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add picture</span>
            </button>
          ) : (
            <button className="today-btn" onClick={() => {
              if (!animating) {
                fetchDay(new Date()).then((s) => {
                  setCurrent(s);
                });
              }
            }}>
              Jump to today
            </button>
          )}

          <button
            className="nav-btn"
            onClick={() => navigate("forward")}
            disabled={!canGoForward || busy}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      {viewImage && (
        <ImageViewer
          imageUrl={viewImage.url}
          name={viewImage.name}
          onClose={() => setViewImage(null)}
          onDelete={handleDelete}
        />
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={handleUpload}
        defaultName={lastName}
        isFull={isFull}
      />
    </div>
  );
}
