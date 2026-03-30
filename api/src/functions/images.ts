import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { notifyDiscord } from "../discord.js";
import { getGroupId } from "../auth.js";
import { checkRateLimit } from "../ratelimit.js";

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const blobService = BlobServiceClient.fromConnectionString(connStr);
const container = blobService.getContainerClient("images");

// GET /api/images/{date}/{imageId} — exempt from rate limiting
app.http("getImage", {
  methods: ["GET"],
  route: "images/{date}/{imageId}",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const { date, imageId } = req.params;
    const group = getGroupId(req);
    if (!group) return { status: 403 };

    const blob = container.getBlobClient(`${group}/${date}/${imageId}.jpg`);

    try {
      const props = await blob.getProperties();
      const downloadResponse = await blob.download();
      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody!) {
        chunks.push(Buffer.from(chunk));
      }
      return {
        body: Buffer.concat(chunks),
        headers: {
          "Content-Type": props.contentType || "image/jpeg",
          "Cache-Control": "no-store",
        },
      };
    } catch (e: any) {
      if (e.statusCode === 404) {
        return { status: 404 };
      }
      throw e;
    }
  },
});

// POST /api/images/{date}/{imageId}
app.http("saveImage", {
  methods: ["POST"],
  route: "images/{date}/{imageId}",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const blocked = await checkRateLimit(req);
    if (blocked) return blocked;

    const { date, imageId } = req.params;
    const group = getGroupId(req);
    if (!group) return { status: 403 };

    const blob = container.getBlockBlobClient(`${group}/${date}/${imageId}.jpg`);

    const body = await req.arrayBuffer();
    await blob.uploadData(Buffer.from(body), {
      blobHTTPHeaders: { blobContentType: "image/jpeg" },
    });

    const name = req.query.get("name");
    if (name) await notifyDiscord(group, name);

    return { status: 204 };
  },
});
