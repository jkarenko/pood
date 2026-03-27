import { db, storage as fbStorage, isConfigured } from "./firebase";

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

// ── Firebase adapter (compat API) ──

async function fbLoadDayData(date: Date): Promise<DayData> {
  if (!db) return { entries: [] };
  const snap = await db.collection("days").doc(dateKey(date)).get();
  if (!snap.exists) return { entries: [] };
  return snap.data() as DayData;
}

async function fbSaveDayData(date: Date, data: DayData): Promise<void> {
  if (!db) return;
  await db
    .collection("days")
    .doc(dateKey(date))
    .set({ entries: data.entries.map((e) => ({ ...e })) });
}

async function fbLoadImage(date: Date, gridPos: number): Promise<string | null> {
  if (!fbStorage) return null;
  try {
    return await fbStorage
      .ref(`images/${dateKey(date)}/${gridPos}.jpg`)
      .getDownloadURL();
  } catch {
    return null;
  }
}

async function fbSaveImage(date: Date, gridPos: number, dataUrl: string): Promise<void> {
  if (!fbStorage) return;
  await fbStorage
    .ref(`images/${dateKey(date)}/${gridPos}.jpg`)
    .putString(dataUrl, "data_url");
}

// ── window.storage (Claude artifact) adapter ──

interface ArtifactStorage {
  get(key: string): Promise<{ value: string } | null>;
  set(key: string, value: string): Promise<unknown>;
}

function getArtifactStorage(): ArtifactStorage | null {
  const ws = (window as any).storage;
  if (ws && typeof ws.get === "function" && typeof ws.set === "function") {
    return ws;
  }
  return null;
}

// ── In-memory fallback ──

const mem = new Map<string, string>();

// ── Unified public API ──
// Priority: Firebase > window.storage > in-memory

export async function loadDayData(date: Date): Promise<DayData> {
  if (isConfigured) return fbLoadDayData(date);
  try {
    const s = getArtifactStorage();
    if (s) {
      const r = await s.get(`pood:day:${dateKey(date)}`);
      if (r) return JSON.parse(r.value);
    }
  } catch {}
  const v = mem.get(`pood:day:${dateKey(date)}`);
  return v ? JSON.parse(v) : { entries: [] };
}

export async function saveDayData(date: Date, data: DayData): Promise<void> {
  const json = JSON.stringify(data);
  if (isConfigured) return fbSaveDayData(date, data);
  try {
    const s = getArtifactStorage();
    if (s) { await s.set(`pood:day:${dateKey(date)}`, json); return; }
  } catch {}
  mem.set(`pood:day:${dateKey(date)}`, json);
}

export async function loadImage(date: Date, gridPos: number): Promise<string | null> {
  if (isConfigured) return fbLoadImage(date, gridPos);
  try {
    const s = getArtifactStorage();
    if (s) {
      const r = await s.get(`pood:img:${dateKey(date)}:${gridPos}`);
      return r ? r.value : null;
    }
  } catch {}
  return mem.get(`pood:img:${dateKey(date)}:${gridPos}`) ?? null;
}

export async function saveImage(date: Date, gridPos: number, dataUrl: string): Promise<void> {
  if (isConfigured) return fbSaveImage(date, gridPos, dataUrl);
  try {
    const s = getArtifactStorage();
    if (s) { await s.set(`pood:img:${dateKey(date)}:${gridPos}`, dataUrl); return; }
  } catch {}
  mem.set(`pood:img:${dateKey(date)}:${gridPos}`, dataUrl);
}

// ── Per-user last name (always local) ──

export async function loadLastName(): Promise<string> {
  try { return localStorage.getItem("pood:lastuser") ?? ""; } catch {}
  try {
    const s = getArtifactStorage();
    if (s) { const r = await s.get("pood:lastuser"); return r ? r.value : ""; }
  } catch {}
  return mem.get("pood:lastuser") ?? "";
}

export async function saveLastName(name: string): Promise<void> {
  try { localStorage.setItem("pood:lastuser", name); return; } catch {}
  try {
    const s = getArtifactStorage();
    if (s) { await s.set("pood:lastuser", name); return; }
  } catch {}
  mem.set("pood:lastuser", name);
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

export async function resizeImage(file: File, maxDim: number = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = (h / w) * maxDim; w = maxDim; }
          else { w = (w / h) * maxDim; h = maxDim; }
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
