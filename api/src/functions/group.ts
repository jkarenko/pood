import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { getGroupId } from "../auth.js";

// GET /api/group-id — returns the HMAC group hash for the given phrase
app.http("getGroupId", {
  methods: ["GET"],
  route: "group-id",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const group = getGroupId(req);
    if (!group) return { status: 403 };
    return { jsonBody: { id: group } };
  },
});
