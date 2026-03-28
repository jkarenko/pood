const PHRASES_KEY = "pood:handshakes";
const ACTIVE_KEY = "pood:active-handshake";
const MAX_LENGTH = 20;

async function hashPhrase(phrase: string): Promise<string> {
  const str = normalize(phrase);
  if (globalThis.crypto?.subtle) {
    const data = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hex.slice(0, 12);
  }
  // Fallback for non-HTTPS (e.g. LAN dev): simple string hash
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 12);
}

function normalize(phrase: string): string {
  return phrase.trim().toLowerCase().slice(0, MAX_LENGTH);
}

let cachedGroupId: string | null = null;

// ── Read ──

export function getStoredPhrases(): string[] {
  try {
    const raw = localStorage.getItem(PHRASES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getActivePhrase(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export async function getGroupId(): Promise<string | null> {
  if (cachedGroupId) return cachedGroupId;
  const phrase = getActivePhrase();
  if (!phrase) return null;
  cachedGroupId = await hashPhrase(phrase);
  return cachedGroupId;
}

// ── Write ──

export async function addHandshake(phrase: string): Promise<string> {
  const normalized = normalize(phrase);
  const groupId = await hashPhrase(normalized);
  cachedGroupId = groupId;

  const phrases = getStoredPhrases();
  if (!phrases.includes(normalized)) {
    phrases.push(normalized);
  }

  try {
    localStorage.setItem(PHRASES_KEY, JSON.stringify(phrases));
    localStorage.setItem(ACTIVE_KEY, normalized);
  } catch {}

  return groupId;
}

export async function switchHandshake(phrase: string): Promise<string> {
  const normalized = normalize(phrase);
  const groupId = await hashPhrase(normalized);
  cachedGroupId = groupId;

  try {
    localStorage.setItem(ACTIVE_KEY, normalized);
  } catch {}

  return groupId;
}

export function removeHandshake(phrase: string): string | null {
  const normalized = normalize(phrase);
  const phrases = getStoredPhrases().filter((p) => p !== normalized);
  cachedGroupId = null;

  try {
    localStorage.setItem(PHRASES_KEY, JSON.stringify(phrases));
    if (getActivePhrase() === normalized) {
      if (phrases.length > 0) {
        localStorage.setItem(ACTIVE_KEY, phrases[0]);
        return phrases[0];
      } else {
        localStorage.removeItem(ACTIVE_KEY);
        return null;
      }
    }
  } catch {}

  return getActivePhrase();
}

// ── Migration from single-phrase format ──

export function migrateIfNeeded(): void {
  try {
    const old = localStorage.getItem("pood:handshake");
    if (old && !localStorage.getItem(PHRASES_KEY)) {
      const normalized = normalize(old);
      localStorage.setItem(PHRASES_KEY, JSON.stringify([normalized]));
      localStorage.setItem(ACTIVE_KEY, normalized);
      localStorage.removeItem("pood:handshake");
    }
  } catch {}
}
