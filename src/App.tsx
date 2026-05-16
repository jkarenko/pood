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
  findPhraseByHash,
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
  calcSlotCount,
  generateImageId,
  randomTilt,
  randomOffset,
  resizeImage,
  addReaction,
  getAllMyReactions,
  getMyReactions,
  setMyReaction,
} from "@/lib/storage";

function dateImageKey(date: Date, imageId: string): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}:${imageId}`;
}

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
  images: Record<string, string>;
  loading: boolean;
}

async function fetchDay(date: Date): Promise<DayState> {
  const data = await loadDayData(date);
  const imgs: Record<string, string> = {};
  await Promise.all(
    data.entries.map(async (e) => {
      const img = await loadImage(date, e.imageId);
      if (img) imgs[e.imageId] = img;
    })
  );
  return { date, data, images: imgs, loading: false };
}

function getHashFromUrl(): string | null {
  const path = window.location.pathname.slice(1);
  return path || null;
}

export default function App() {
  const [activePhrase, setActivePhrase] = useState(() => getActivePhrase());
  const [phrases, setPhrases] = useState(() => getStoredPhrases());

  // Run migrations, then handle /{hash} URL
  useEffect(() => {
    migrateIfNeeded().then(() => {
      const hash = getHashFromUrl();
      if (hash) {
        const phrase = findPhraseByHash(hash);
        if (phrase) {
          switchHandshake(phrase);
          setActivePhrase(phrase);
        }
        window.history.replaceState(null, "", "/");
      }
    });
  }, []);
  const [current, setCurrent] = useState<DayState>({
    date: new Date(),
    data: { entries: [] },
    images: {},
    loading: true,
  });
  const [trans, setTrans] = useState<DayState | null>(null);
  const [animDir, setAnimDir] = useState<"forward" | "backward" | null>(null);
  const [animating, setAnimating] = useState(false);

  const [viewImage, setViewImage] = useState<{ url: string; name: string; imageId: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lastName, setLastName] = useState("");
  const [myReactions, setMyReactionsState] = useState<Record<string, string[]>>(() => getAllMyReactions());

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
    const result = await addHandshake(phrase);
    if (!result) return;
    setActivePhrase(phrase.trim().toLowerCase().slice(0, 20));
    setPhrases(getStoredPhrases());
  }

  async function handleSwitch(phrase: string) {
    await switchHandshake(phrase);
    setActivePhrase(phrase);
    setCurrent((prev) => ({ ...prev, loading: true, data: { entries: [] }, images: {} }));
  }

  async function handleAddGroup(phrase: string) {
    const result = await addHandshake(phrase);
    if (!result) return;
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
    const visibleSlots = calcSlotCount(current.data.entries);
    const slot = getAvailableSlot(current.data.entries, visibleSlots);
    const imageId = generateImageId();

    const dataUrl = await resizeImage(file);
    const entry: DayEntry = {
      imageId,
      gridPos: slot,
      name,
      tilt: randomTilt(),
      offsetX: randomOffset(),
      offsetY: randomOffset(),
    };

    const newData: DayData = { entries: [...current.data.entries, entry] };
    await saveDayData(current.date, newData);
    await saveImage(current.date, imageId, dataUrl, name);
    await saveLastName(name);
    setLastName(name);
    setCurrent((prev) => ({
      ...prev,
      data: newData,
      images: { ...prev.images, [imageId]: dataUrl },
    }));
    setUploadOpen(false);
  }

  function handleImageClick(url: string, name: string, imageId: string) {
    if (!busy) setViewImage({ url, name, imageId });
  }

  async function handleDelete() {
    if (!viewImage) return;
    const { imageId } = viewImage;
    await deleteEntry(current.date, imageId);
    const newEntries = current.data.entries.filter((e) => e.imageId !== imageId);
    const newImages = { ...current.images };
    delete newImages[imageId];
    setCurrent((prev) => ({
      ...prev,
      data: { entries: newEntries },
      images: newImages,
    }));
    setViewImage(null);
  }

  // Toggle a reaction from THIS device. localStorage tracks ownership so the
  // same device can take back what it added; the server stays aggregate.
  async function handleToggleReaction(imageId: string, emoji: string) {
    const target = current.data.entries.find((e) => e.imageId === imageId);
    if (!target) return;
    const before = target.reactions ?? {};
    const wasMine = getMyReactions(current.date, imageId).includes(emoji);
    const delta: 1 | -1 = wasMine ? -1 : 1;

    const optimistic: Record<string, number> = { ...before };
    const next = (optimistic[emoji] ?? 0) + delta;
    if (next <= 0) delete optimistic[emoji];
    else optimistic[emoji] = next;

    const applyReactions = (rx: Record<string, number>) =>
      setCurrent((prev) => ({
        ...prev,
        data: {
          entries: prev.data.entries.map((e) =>
            e.imageId === imageId ? { ...e, reactions: rx } : e
          ),
        },
      }));

    setMyReaction(current.date, imageId, emoji, !wasMine);
    setMyReactionsState(getAllMyReactions());
    applyReactions(optimistic);

    const server = await addReaction(current.date, imageId, emoji, delta);
    if (server) {
      applyReactions(server);
    } else {
      // Revert both count and ownership.
      setMyReaction(current.date, imageId, emoji, wasMine);
      setMyReactionsState(getAllMyReactions());
      applyReactions(before);
    }
  }

  async function handleReorder(from: number, to: number) {
    const newEntries = current.data.entries.map((e) => {
      if (e.gridPos === from) {
        return { ...e, gridPos: to, tilt: randomTilt(), offsetX: randomOffset(), offsetY: randomOffset() };
      }
      if (e.gridPos === to) {
        return { ...e, gridPos: from, tilt: randomTilt(), offsetX: randomOffset(), offsetY: randomOffset() };
      }
      return e;
    });

    const newData: DayData = { entries: newEntries };
    setCurrent((prev) => ({
      ...prev,
      data: newData,
    }));
    await saveDayData(current.date, newData);
  }

  const canGoForward = !isSameDay(current.date, today);

  function goToDate(date: Date) {
    if (busy) return;
    fetchDay(date).then(setCurrent);
  }

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

  const navProps = {
    onNavigate: navigate,
    onGoToDate: goToDate,
    onReorder: handleReorder,
    canGoForward,
    busy,
  };

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
              {...navProps}
              onImageClick={handleImageClick}
              onImageReact={handleToggleReaction}
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
              {...navProps}
              onImageClick={handleImageClick}
              onImageReact={handleToggleReaction}
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
              {...navProps}
              onImageClick={handleImageClick}
              onImageReact={handleToggleReaction}
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
              {...navProps}
              onImageClick={handleImageClick}
              onImageReact={handleToggleReaction}
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
                {...navProps}
              onImageClick={handleImageClick}
              onImageReact={handleToggleReaction}
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
                {...navProps}
              onImageClick={handleImageClick}
              onImageReact={handleToggleReaction}
              />
            ) : (
              <CalendarPage
                date={current.date}
                entries={current.data.entries}
                images={current.images}
                isToday={isToday}
                loading={current.loading}
                {...navProps}
              onImageClick={handleImageClick}
              onImageReact={handleToggleReaction}
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
              {...navProps}
              onImageClick={handleImageClick}
              onImageReact={handleToggleReaction}
            />
          ) : animDir === "backward" && trans ? (
            <CalendarPage
              date={trans.date}
              entries={trans.data.entries}
              images={trans.images}
              isToday={isSameDay(trans.date, today)}
              loading={trans.loading}
              className="page-layer-top tear-backward"
              {...navProps}
              onImageClick={handleImageClick}
              onImageReact={handleToggleReaction}
            />
          ) : (
            <CalendarPage
              date={current.date}
              entries={current.data.entries}
              images={current.images}
              isToday={isToday}
              loading={current.loading}
              {...navProps}
              onImageClick={handleImageClick}
              onImageReact={handleToggleReaction}
            />
          )}
        </div>

        {/* Floating add button */}
        <button
          className="fab-add"
          onClick={() => setUploadOpen(true)}
          title="Add your picture"
          disabled={busy}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {viewImage && (
        <ImageViewer
          imageUrl={viewImage.url}
          name={viewImage.name}
          reactions={
            current.data.entries.find((e) => e.imageId === viewImage.imageId)?.reactions ?? {}
          }
          myReactions={myReactions[dateImageKey(current.date, viewImage.imageId)] ?? []}
          onClose={() => setViewImage(null)}
          onDelete={handleDelete}
          onToggleReaction={(emoji) => handleToggleReaction(viewImage.imageId, emoji)}
        />
      )}

      <UploadDialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={handleUpload}
        defaultName={lastName}
      />
    </div>
  );
}
