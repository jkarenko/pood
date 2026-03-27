import type { DayEntry } from "@/lib/storage";
import { PolaroidImage } from "@/components/PolaroidImage";

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
  onImageClick?: (url: string, name: string) => void;
}

export function CalendarPage({ date, entries, images, isToday, loading, className = "", onImageClick }: Props) {
  const dayNum = date.getDate();
  const weekday = WEEKDAYS[date.getDay()];
  const monthYear = `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

  const grid: (DayEntry | null)[] = Array(9).fill(null);
  entries.forEach((e) => {
    grid[e.gridPos] = e;
  });

  return (
    <div className={`calendar-page ${className}`}>
      <div className="page-header">
        <div className="page-weekday">{weekday}</div>
        <div className="page-day-number">
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
        </div>
        <div className="page-month-year">{monthYear}</div>
      </div>

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
                  onClick={() => onImageClick?.(images[entry.gridPos], entry.name)}
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
