import { HttpRequest } from "@azure/functions";
import { createHmac } from "crypto";

const HMAC_SECRET = process.env.HMAC_SECRET!;

function hmacGroup(phrase: string): string {
  return createHmac("sha256", HMAC_SECRET)
    .update(phrase.trim().toLowerCase())
    .digest("hex")
    .slice(0, 16);
}

/**
 * Extract the group ID from the X-Handshake header.
 * Returns the HMAC-derived group ID, or null if no header present.
 */
export function getGroupId(req: HttpRequest): string | null {
  const phrase = req.headers.get("x-handshake");
  if (!phrase) return null;
  return hmacGroup(phrase);
}
