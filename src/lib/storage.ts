// ── Types ──

export interface DayEntry {
  gridPos: number;
  name: string;
  tilt: number;
  offsetX: number;
  offsetY: number;
}

export interface DayData {
  entries: DayEntry[];
}

// ── Date key ──

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// ── API base ──

const API = "/api";

// ── Day data ──

export async function loadDayData(date: Date): Promise<DayData> {
  try {
    const res = await fetch(`${API}/days/${dateKey(date)}`);
    if (!res.ok) return { entries: [] };
    return await res.json();
  } catch {
    return { entries: [] };
  }
}

export async function saveDayData(date: Date, data: DayData): Promise<void> {
  await fetch(`${API}/days/${dateKey(date)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ── Images ──

export async function loadImage(
  date: Date,
  gridPos: number
): Promise<string | null> {
  try {
    const res = await fetch(`${API}/images/${dateKey(date)}/${gridPos}`);
    if (!res.ok) return null;
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export async function saveImage(
  date: Date,
  gridPos: number,
  dataUrl: string
): Promise<void> {
  // Convert data URL to binary
  const res = await fetch(dataUrl);
  const blob = await res.blob();

  await fetch(`${API}/images/${dateKey(date)}/${gridPos}`, {
    method: "POST",
    body: blob,
  });
}

// ── Per-user last name (always local) ──

export async function loadLastName(): Promise<string> {
  try {
    return localStorage.getItem("pood:lastuser") ?? "";
  } catch {
    return "";
  }
}

export async function saveLastName(name: string): Promise<void> {
  try {
    localStorage.setItem("pood:lastuser", name);
  } catch {}
}

// ── Utility functions ──

export function getAvailableSlot(entries: DayEntry[]): number | null {
  const taken = new Set(entries.map((e) => e.gridPos));
  const available = [];
  for (let i = 0; i < 9; i++) {
    if (!taken.has(i)) available.push(i);
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function randomTilt(): number {
  return (Math.random() - 0.5) * 8;
}

export function randomOffset(): number {
  return (Math.random() - 0.5) * 12;
}

export async function resizeImage(
  file: File,
  maxDim: number = 1200
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = (h / w) * maxDim;
            w = maxDim;
          } else {
            w = (w / h) * maxDim;
            h = maxDim;
          }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
