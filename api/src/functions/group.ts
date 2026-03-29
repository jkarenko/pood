import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { getGroupId } from "../auth.js";
import { checkRateLimit, constantTime } from "../ratelimit.js";

// GET /api/group-id — returns the HMAC group hash for the given phrase
app.http("getGroupId", {
  methods: ["GET"],
  route: "group-id",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const wait = constantTime();
    const blocked = await checkRateLimit(req);
    if (blocked) return blocked;

    const group = getGroupId(req);
    if (!group) { await wait(); return { status: 403 }; }

    await wait();
    return { jsonBody: { id: group } };
  },
});
