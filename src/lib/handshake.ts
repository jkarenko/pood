const PHRASES_KEY = "pood:handshakes";
const ACTIVE_KEY = "pood:active-handshake";
const GROUP_IDS_KEY = "pood:group-ids";
const MAX_LENGTH = 20;
const MAX_GROUPS = 10;

function normalize(phrase: string): string {
  return phrase.trim().toLowerCase().slice(0, MAX_LENGTH);
}

// ── Group ID cache (phrase → HMAC hash from server) ──

function getGroupIds(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(GROUP_IDS_KEY) || "{}");
  } catch {
    return {};
  }
}

function setGroupIds(ids: Record<string, string>): void {
  try {
    localStorage.setItem(GROUP_IDS_KEY, JSON.stringify(ids));
  } catch {}
}

async function fetchGroupId(phrase: string): Promise<string> {
  const res = await fetch("/api/group-id", {
    headers: { "X-Handshake": phrase },
  });
  const data = await res.json();
  return data.id;
}

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

// ── Write ──

export async function addHandshake(phrase: string): Promise<string | null> {
  const normalized = normalize(phrase);

  const phrases = getStoredPhrases();
  if (!phrases.includes(normalized) && phrases.length >= MAX_GROUPS) {
    return null;
  }

  const groupId = await fetchGroupId(normalized);

  if (!phrases.includes(normalized)) {
    phrases.push(normalized);
  }

  const ids = getGroupIds();
  ids[normalized] = groupId;

  try {
    localStorage.setItem(PHRASES_KEY, JSON.stringify(phrases));
    localStorage.setItem(ACTIVE_KEY, normalized);
    setGroupIds(ids);
  } catch {}

  return groupId;
}

export async function switchHandshake(phrase: string): Promise<void> {
  const normalized = normalize(phrase);

  try {
    localStorage.setItem(ACTIVE_KEY, normalized);
  } catch {}
}

export function removeHandshake(phrase: string): string | null {
  const normalized = normalize(phrase);
  const phrases = getStoredPhrases().filter((p) => p !== normalized);

  const ids = getGroupIds();
  delete ids[normalized];

  try {
    localStorage.setItem(PHRASES_KEY, JSON.stringify(phrases));
    setGroupIds(ids);
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

// ── Lookup by hash ──

export function findPhraseByHash(hash: string): string | null {
  const ids = getGroupIds();
  for (const [phrase, groupId] of Object.entries(ids)) {
    if (groupId === hash) return phrase;
  }
  return null;
}

// ── Migration ──

export async function migrateIfNeeded(): Promise<void> {
  try {
    // Migrate from single-phrase format
    const old = localStorage.getItem("pood:handshake");
    if (old && !localStorage.getItem(PHRASES_KEY)) {
      const normalized = normalize(old);
      localStorage.setItem(PHRASES_KEY, JSON.stringify([normalized]));
      localStorage.setItem(ACTIVE_KEY, normalized);
      localStorage.removeItem("pood:handshake");
    }

    // Fetch missing group IDs (e.g. after HMAC migration)
    const phrases = getStoredPhrases();
    const ids = getGroupIds();
    let changed = false;
    for (const phrase of phrases) {
      if (!ids[phrase]) {
        try {
          ids[phrase] = await fetchGroupId(phrase);
          changed = true;
        } catch {}
      }
    }
    if (changed) setGroupIds(ids);
  } catch {}
}
