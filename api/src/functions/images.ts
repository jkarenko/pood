import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { notifyDiscord } from "../discord.js";

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const blobService = BlobServiceClient.fromConnectionString(connStr);
const container = blobService.getContainerClient("images");

// GET /api/images/{group}/{date}/{gridPos}
app.http("getImage", {
  methods: ["GET"],
  route: "images/{group}/{date}/{gridPos}",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const { group, date, gridPos } = req.params;
    const blob = container.getBlobClient(`${group}/${date}/${gridPos}.jpg`);

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
          "Cache-Control": "public, max-age=86400",
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

// POST /api/images/{group}/{date}/{gridPos}
app.http("saveImage", {
  methods: ["POST"],
  route: "images/{group}/{date}/{gridPos}",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const { group, date, gridPos } = req.params;
    const blob = container.getBlockBlobClient(`${group}/${date}/${gridPos}.jpg`);

    const body = await req.arrayBuffer();
    await blob.uploadData(Buffer.from(body), {
      blobHTTPHeaders: { blobContentType: "image/jpeg" },
    });

    const name = req.query.get("name") || "Someone";
    await notifyDiscord(group!, name);

    return { status: 204 };
  },
});
