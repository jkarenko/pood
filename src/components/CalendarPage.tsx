import { useState } from "react";
import type { DayEntry } from "@/lib/storage";
import { PolaroidImage } from "@/components/PolaroidImage";
import { CalendarPicker } from "@/components/CalendarPicker";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  date: Date;
  entries: DayEntry[];
  images: Record<number, string>;
  isToday: boolean;
  loading: boolean;
  className?: string;
  style?: React.CSSProperties;
  onImageClick?: (url: string, name: string, gridPos: number) => void;
  onNavigate?: (dir: "forward" | "backward") => void;
  onGoToDate?: (date: Date) => void;
  canGoForward?: boolean;
  busy?: boolean;
}

export function CalendarPage({ date, entries, images, isToday, loading, className = "", style, onImageClick, onNavigate, onGoToDate, canGoForward = true, busy = false }: Props) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const dayNum = date.getDate();
  const weekday = WEEKDAYS[date.getDay()];
  const monthYear = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

  const maxPos = entries.reduce((max, e) => Math.max(max, e.gridPos), -1);
  const slotCount = Math.max(9, Math.ceil((maxPos + 1) / 3) * 3);
  const grid: (DayEntry | null)[] = Array(slotCount).fill(null);
  entries.forEach((e) => {
    grid[e.gridPos] = e;
  });

  return (
    <div className={`calendar-page ${className}`} style={style}>
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

      <div className="photo-grid">
        {loading ? (
          <div className="grid-loading">Loading...</div>
        ) : (
          grid.map((entry, i) => (
            <div key={i} className="grid-cell">
              {entry && images[entry.gridPos] ? (
                <PolaroidImage
                  entry={entry}
                  imageUrl={images[entry.gridPos]}
                  onClick={() => onImageClick?.(images[entry.gridPos], entry.name, entry.gridPos)}
                />
              ) : null}
            </div>
          ))
        )}
      </div>

      {!loading && entries.length === 0 && (
        <div className="empty-state">
          No pictures yet{isToday ? " — be the first!" : ""}
        </div>
      )}
    </div>
  );
}
