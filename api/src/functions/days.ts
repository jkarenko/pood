import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { TableClient } from "@azure/data-tables";
import { BlobServiceClient } from "@azure/storage-blob";
import { getGroupId } from "../auth.js";
import { checkRateLimit, constantTime } from "../ratelimit.js";

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const tableClient = TableClient.fromConnectionString(connStr, "days");
const blobService = BlobServiceClient.fromConnectionString(connStr);
const imageContainer = blobService.getContainerClient("images");

interface DayEntryEntity {
  partitionKey: string;
  rowKey: string; // imageId
  gridPos: number;
  name: string;
  tilt: number;
  offsetX: number;
  offsetY: number;
}

// GET /api/days/{date}
app.http("getDayData", {
  methods: ["GET"],
  route: "days/{date}",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const wait = constantTime();
    const blocked = await checkRateLimit(req);
    if (blocked) return blocked;

    const { date } = req.params;
    const group = getGroupId(req);
    if (!group) { await wait(); return { status: 403 }; }

    const pk = `${group}_${date}`;
    const entries: DayEntryEntity[] = [];

    try {
      for await (const entity of tableClient.listEntities<DayEntryEntity>({
        queryOptions: { filter: `PartitionKey eq '${pk}'` },
      })) {
        entries.push(entity);
      }
    } catch (e: any) {
      if (e.statusCode === 404) {
        await wait();
        return { jsonBody: { entries: [] } };
      }
      throw e;
    }

    await wait();
    return {
      jsonBody: {
        entries: entries.map((e) => ({
          imageId: e.rowKey,
          gridPos: e.gridPos ?? parseInt(e.rowKey, 10), // fallback for legacy entries without gridPos
          name: e.name,
          tilt: e.tilt,
          offsetX: e.offsetX,
          offsetY: e.offsetY,
        })),
      },
    };
  },
});

// POST /api/days/{date}
app.http("saveDayData", {
  methods: ["POST"],
  route: "days/{date}",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const blocked = await checkRateLimit(req);
    if (blocked) return blocked;

    const { date } = req.params;
    const group = getGroupId(req);
    if (!group) return { status: 403 };

    const pk = `${group}_${date}`;
    const body = (await req.json()) as {
      entries: Array<{
        imageId: string;
        gridPos: number;
        name: string;
        tilt: number;
        offsetX: number;
        offsetY: number;
      }>;
    };

    await tableClient.createTable().catch(() => {});

    // Find existing rows so we can delete stale ones
    const existingRows = new Set<string>();
    try {
      for await (const entity of tableClient.listEntities({
        queryOptions: { filter: `PartitionKey eq '${pk}'` },
      })) {
        existingRows.add(entity.rowKey!);
      }
    } catch {}

    const newRows = new Set(body.entries.map((e) => e.imageId));

    // Upsert current entries
    for (const entry of body.entries) {
      await tableClient.upsertEntity({
        partitionKey: pk,
        rowKey: entry.imageId,
        gridPos: entry.gridPos,
        name: entry.name,
        tilt: entry.tilt,
        offsetX: entry.offsetX,
        offsetY: entry.offsetY,
      });
    }

    // Delete rows that no longer exist
    for (const rowKey of existingRows) {
      if (!newRows.has(rowKey)) {
        try {
          await tableClient.deleteEntity(pk, rowKey);
          // Also delete the orphaned image blob
          const blob = imageContainer.getBlobClient(`${group}/${date}/${rowKey}.jpg`);
          await blob.deleteIfExists();
        } catch {}
      }
    }

    return { status: 204 };
  },
});

// DELETE /api/days/{date}/{imageId}
app.http("deleteEntry", {
  methods: ["DELETE"],
  route: "days/{date}/{imageId}",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const blocked = await checkRateLimit(req);
    if (blocked) return blocked;

    const { date, imageId } = req.params;
    const group = getGroupId(req);
    if (!group) return { status: 403 };

    const pk = `${group}_${date}`;

    try {
      await tableClient.deleteEntity(pk, imageId!);
    } catch (e: any) {
      if (e.statusCode !== 404) throw e;
    }

    try {
      const blob = imageContainer.getBlobClient(`${group}/${date}/${imageId}.jpg`);
      await blob.deleteIfExists();
    } catch {}

    return { status: 204 };
  },
});
