import { useState } from "react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface Props {
  currentDate: Date;
  onSelect: (date: Date) => void;
  onClose: () => void;
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function CalendarPicker({ currentDate, onSelect, onClose }: Props) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth());

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  function prevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else {
      setViewMonth(viewMonth - 1);
    }
  }

  function nextMonth() {
    const nextDate = new Date(viewYear, viewMonth + 1, 1);
    if (nextDate > new Date(today.getFullYear(), today.getMonth() + 1, 0)) return;
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(viewMonth + 1);
    }
  }

  const isCurrentMonth = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  function handleDayClick(day: number) {
    const selected = new Date(viewYear, viewMonth, day);
    if (selected > today) return;
    onSelect(selected);
  }

  function handleToday() {
    onSelect(new Date());
  }

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="calendar-picker-backdrop" onClick={onClose}>
      <div className="calendar-picker" onClick={(e) => e.stopPropagation()}>
        <div className="calendar-picker-header">
          <button className="calendar-picker-nav" onClick={prevMonth}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="calendar-picker-title">
            {MONTHS[viewMonth]} {viewYear}
          </span>
          <button className="calendar-picker-nav" onClick={nextMonth} disabled={isCurrentMonth}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>

        <div className="calendar-picker-days">
          {DAY_LABELS.map((l) => (
            <div key={l} className="calendar-picker-day-label">{l}</div>
          ))}
        </div>

        <div className="calendar-picker-grid">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e${i}`} />;
            const d = new Date(viewYear, viewMonth, day);
            const isFuture = d > today;
            const isSelected = isSameDay(d, currentDate);
            const isToday = isSameDay(d, today);
            return (
              <button
                key={day}
                className={`calendar-picker-cell${isSelected ? " selected" : ""}${isToday ? " today" : ""}${isFuture ? " future" : ""}`}
                onClick={() => handleDayClick(day)}
                disabled={isFuture}
              >
                {day}
              </button>
            );
          })}
        </div>

        <button className="calendar-picker-today-btn" onClick={handleToday}>
          Today
        </button>
      </div>
    </div>
  );
}
