import { useState, useEffect } from "react";
import "./App.css";
import { CalendarPage } from "@/components/CalendarPage";
import { ImageViewer } from "@/components/ImageViewer";
import { UploadDialog } from "@/components/UploadDialog";
import type { DayData, DayEntry } from "@/lib/storage";
import {
  loadDayData,
  saveDayData,
  loadImage,
  saveImage,
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
  const [current, setCurrent] = useState<DayState>({
    date: new Date(),
    data: { entries: [] },
    images: {},
    loading: true,
  });
  const [trans, setTrans] = useState<DayState | null>(null);
  const [animDir, setAnimDir] = useState<"forward" | "backward" | null>(null);
  const [animating, setAnimating] = useState(false);

  const [viewImage, setViewImage] = useState<{ url: string; name: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lastName, setLastName] = useState("");

  const today = new Date();
  const isToday = isSameDay(current.date, today);

  // Initial load
  useEffect(() => {
    fetchDay(new Date()).then(setCurrent);
    loadLastName().then(setLastName);
  }, []);

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

  function handleImageClick(url: string, name: string) {
    if (!animating) setViewImage({ url, name });
  }

  const isFull = current.data.entries.length >= 9;
  const canGoForward = !isSameDay(current.date, today);

  /*
   * Layer stacking during animation:
   *   Forward (tear-off):  bottom = trans (next day, static)
   *                        top    = current (tearing off, animated)
   *   Backward (put-back): bottom = current (stays visible)
   *                        top    = trans (prev day, flying in)
   */

  return (
    <div className="app-root">
      <div className="calendar-container">
        {/* Torn stubs */}
        <div className="torn-stubs" />

        {/* Page stack */}
        <div className="page-stack">
          {/* --- Forward: next day sits underneath, current tears off on top --- */}
          {animDir === "forward" && trans && (
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

          {/* --- Backward: current day stays underneath --- */}
          {animDir === "backward" && (
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
          {animDir === "forward" ? (
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
          <button className="nav-btn" onClick={() => navigate("backward")} disabled={animating}>
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
            disabled={!canGoForward || animating}
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
