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

import { getActivePhrase } from "./handshake";

const API = "/api";

function authHeaders(): Record<string, string> {
  const phrase = getActivePhrase();
  return phrase ? { "X-Handshake": phrase } : {};
}

// ── Day data ──

export async function loadDayData(date: Date): Promise<DayData> {
  const phrase = getActivePhrase();
  if (!phrase) return { entries: [] };
  try {
    const res = await fetch(`${API}/days/${dateKey(date)}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return { entries: [] };
    return await res.json();
  } catch {
    return { entries: [] };
  }
}

export async function saveDayData(date: Date, data: DayData): Promise<void> {
  const phrase = getActivePhrase();
  if (!phrase) return;
  await fetch(`${API}/days/${dateKey(date)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
}

// ── Images ──

export async function loadImage(
  date: Date,
  gridPos: number
): Promise<string | null> {
  const phrase = getActivePhrase();
  if (!phrase) return null;
  try {
    const res = await fetch(
      `${API}/images/${dateKey(date)}/${gridPos}`,
      { headers: authHeaders() }
    );
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
  dataUrl: string,
  name?: string
): Promise<void> {
  const phrase = getActivePhrase();
  if (!phrase) return;
  // Convert data URL to binary
  const res = await fetch(dataUrl);
  const blob = await res.blob();

  const params = name ? `?name=${encodeURIComponent(name)}` : "";
  await fetch(`${API}/images/${dateKey(date)}/${gridPos}${params}`, {
    method: "POST",
    headers: authHeaders(),
    body: blob,
  });
}

// ── Delete entry ──

export async function deleteEntry(
  date: Date,
  gridPos: number
): Promise<void> {
  const phrase = getActivePhrase();
  if (!phrase) return;
  await fetch(`${API}/days/${dateKey(date)}/${gridPos}`, {
    method: "DELETE",
    headers: authHeaders(),
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

export function getAvailableSlot(entries: DayEntry[]): number {
  const taken = new Set(entries.map((e) => e.gridPos));
  // Find empty slots within current row-aligned capacity (multiples of 3, min 9)
  const capacity = Math.max(9, Math.ceil(taken.size / 3) * 3);
  const available = [];
  for (let i = 0; i < capacity; i++) {
    if (!taken.has(i)) available.push(i);
  }
  if (available.length > 0) {
    return available[Math.floor(Math.random() * available.length)];
  }
  // All current slots full — open a new row and pick randomly within it
  const newRowStart = capacity;
  const slot = newRowStart + Math.floor(Math.random() * 3);
  return slot;
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
