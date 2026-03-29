import { HttpRequest, HttpResponseInit } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { createHash } from "crypto";

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const table = TableClient.fromConnectionString(connStr, "ratelimits");

const MAX_REQUESTS_PER_MIN = 200;
const MAX_PHRASES_SHORT = 15;       // per hour
const MAX_PHRASES_LONG = 50;        // per 30 days
const SHORT_WINDOW_MS = 3600_000;   // 1 hour
const LONG_WINDOW_MS = 30 * 24 * 3600_000; // 30 days
const SHORT_JAIL_MS = 3600_000;     // 1 hour
const LONG_JAIL_MS = 24 * 3600_000; // 24 hours
const MIN_RESPONSE_MS = 200;

interface RateLimitEntity {
  partitionKey: string;
  rowKey: string;
  requests: number;
  requestWindowStart: number;
  recentPhrases: string;
  recentWindowStart: number;
  allPhrases: string;
  allWindowStart: number;
  jailedUntil: number;
}

function getClientIp(req: HttpRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-client-ip") ||
    "unknown"
  );
}

function hashIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function hashPhrase(phrase: string): string {
  return createHash("sha256").update(phrase).digest("hex").slice(0, 8);
}

function freshEntity(ipHash: string, now: number): RateLimitEntity {
  return {
    partitionKey: "ip",
    rowKey: ipHash,
    requests: 0,
    requestWindowStart: now,
    recentPhrases: "[]",
    recentWindowStart: now,
    allPhrases: "[]",
    allWindowStart: now,
    jailedUntil: 0,
  };
}

/**
 * Check rate limits. Returns a 429 response if blocked, or null to proceed.
 */
export async function checkRateLimit(
  req: HttpRequest
): Promise<HttpResponseInit | null> {
  const ip = getClientIp(req);
  const ipHash = hashIp(ip);
  const phrase = req.headers.get("x-handshake");
  const now = Date.now();

  await table.createTable().catch(() => {});

  let entity: RateLimitEntity;
  try {
    entity = await table.getEntity<RateLimitEntity>("ip", ipHash);
  } catch {
    entity = freshEntity(ipHash, now);
  }

  // Check jail
  if (entity.jailedUntil > now) {
    const retryAfter = Math.ceil((entity.jailedUntil - now) / 1000);
    return { status: 429, headers: { "Retry-After": String(retryAfter) } };
  }

  // --- Request rate ---
  if (now - entity.requestWindowStart > 60_000) {
    entity.requests = 0;
    entity.requestWindowStart = now;
  }
  entity.requests++;

  if (entity.requests > MAX_REQUESTS_PER_MIN) {
    entity.jailedUntil = now + SHORT_JAIL_MS;
    await table.upsertEntity(entity);
    return { status: 429, headers: { "Retry-After": "3600" } };
  }

  // --- Unique phrase tracking ---
  if (phrase) {
    const ph = hashPhrase(phrase);

    // Short window (hourly)
    if (now - entity.recentWindowStart > SHORT_WINDOW_MS) {
      entity.recentPhrases = "[]";
      entity.recentWindowStart = now;
    }
    const recent: string[] = JSON.parse(entity.recentPhrases);
    if (!recent.includes(ph)) {
      recent.push(ph);
      entity.recentPhrases = JSON.stringify(recent);
    }
    if (recent.length > MAX_PHRASES_SHORT) {
      entity.jailedUntil = now + SHORT_JAIL_MS;
      await table.upsertEntity(entity);
      return { status: 429, headers: { "Retry-After": "3600" } };
    }

    // Long window (30 days)
    if (now - entity.allWindowStart > LONG_WINDOW_MS) {
      entity.allPhrases = "[]";
      entity.allWindowStart = now;
    }
    const all: string[] = JSON.parse(entity.allPhrases);
    if (!all.includes(ph)) {
      all.push(ph);
      entity.allPhrases = JSON.stringify(all);
    }
    if (all.length > MAX_PHRASES_LONG) {
      entity.jailedUntil = now + LONG_JAIL_MS;
      await table.upsertEntity(entity);
      return { status: 429, headers: { "Retry-After": "86400" } };
    }
  }

  await table.upsertEntity(entity);
  return null;
}

/**
 * Ensure a minimum response time to prevent timing-based enumeration.
 * Call at the start of the handler, await the returned function at the end.
 */
export function constantTime(): () => Promise<void> {
  const start = Date.now();
  return async () => {
    const elapsed = Date.now() - start;
    if (elapsed < MIN_RESPONSE_MS) {
      await new Promise((r) => setTimeout(r, MIN_RESPONSE_MS - elapsed));
    }
  };
}
