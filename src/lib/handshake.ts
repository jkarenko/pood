const STORAGE_KEY = "pood:handshake";

async function hashPhrase(phrase: string): Promise<string> {
  const data = new TextEncoder().encode(phrase.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hex = Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 12);
}

let cachedGroupId: string | null = null;

export function getStoredPhrase(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setHandshake(phrase: string): Promise<string> {
  const groupId = await hashPhrase(phrase);
  cachedGroupId = groupId;
  try {
    localStorage.setItem(STORAGE_KEY, phrase);
  } catch {}
  return groupId;
}

export async function getGroupId(): Promise<string | null> {
  if (cachedGroupId) return cachedGroupId;
  const phrase = getStoredPhrase();
  if (!phrase) return null;
  cachedGroupId = await hashPhrase(phrase);
  return cachedGroupId;
}

export function clearHandshake(): void {
  cachedGroupId = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
