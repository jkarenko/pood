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
  reactionsJson?: string;
}

function parseReactions(json: string | undefined): Record<string, number> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
  } catch {}
  return {};
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
          reactions: parseReactions(e.reactionsJson),
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

    // Upsert current entries — Merge mode so reactionsJson (managed by the
    // dedicated reactions endpoint) is preserved across reorder/tilt writes.
    for (const entry of body.entries) {
      await tableClient.upsertEntity({
        partitionKey: pk,
        rowKey: entry.imageId,
        gridPos: entry.gridPos,
        name: entry.name,
        tilt: entry.tilt,
        offsetX: entry.offsetX,
        offsetY: entry.offsetY,
      }, "Merge");
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

// POST /api/days/{date}/{imageId}/reactions
// Atomic read-modify-write on a single emoji counter using ETag concurrency.
app.http("addReaction", {
  methods: ["POST"],
  route: "days/{date}/{imageId}/reactions",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const blocked = await checkRateLimit(req);
    if (blocked) return blocked;

    const { date, imageId } = req.params;
    const group = getGroupId(req);
    if (!group) return { status: 403 };

    const body = (await req.json().catch(() => null)) as
      | { emoji?: unknown; delta?: unknown }
      | null;
    const emoji = typeof body?.emoji === "string" ? body.emoji : "";
    const delta = body?.delta === -1 ? -1 : body?.delta === 1 ? 1 : 0;
    // Validate: non-empty, bounded length, single grapheme cluster (no compound junk).
    if (!emoji || !delta || new Blob([emoji]).size > 16) return { status: 400 };
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: "grapheme" });
    const graphemes = Array.from(segmenter.segment(emoji)) as Array<{ segment: string }>;
    if (graphemes.length !== 1) return { status: 400 };

    const pk = `${group}_${date}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      let entity: DayEntryEntity & { etag?: string };
      try {
        entity = await tableClient.getEntity<DayEntryEntity>(pk, imageId!);
      } catch (e: any) {
        if (e.statusCode === 404) return { status: 404 };
        throw e;
      }

      const reactions = parseReactions(entity.reactionsJson);
      const next = (reactions[emoji] ?? 0) + delta;
      if (next <= 0) delete reactions[emoji];
      else reactions[emoji] = next;

      try {
        await tableClient.updateEntity(
          {
            partitionKey: pk,
            rowKey: imageId!,
            reactionsJson: JSON.stringify(reactions),
          },
          "Merge",
          { etag: entity.etag }
        );
        return { jsonBody: { reactions } };
      } catch (e: any) {
        if (e.statusCode === 412) continue; // etag mismatch — retry
        throw e;
      }
    }

    return { status: 409 };
  },
});
