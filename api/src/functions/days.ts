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
  rowKey: string;
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
          gridPos: parseInt(e.rowKey, 10),
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
        gridPos: number;
        name: string;
        tilt: number;
        offsetX: number;
        offsetY: number;
      }>;
    };

    await tableClient.createTable().catch(() => {});

    for (const entry of body.entries) {
      await tableClient.upsertEntity({
        partitionKey: pk,
        rowKey: String(entry.gridPos),
        name: entry.name,
        tilt: entry.tilt,
        offsetX: entry.offsetX,
        offsetY: entry.offsetY,
      });
    }

    return { status: 204 };
  },
});

// DELETE /api/days/{date}/{gridPos}
app.http("deleteEntry", {
  methods: ["DELETE"],
  route: "days/{date}/{gridPos}",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const blocked = await checkRateLimit(req);
    if (blocked) return blocked;

    const { date, gridPos } = req.params;
    const group = getGroupId(req);
    if (!group) return { status: 403 };

    const pk = `${group}_${date}`;

    try {
      await tableClient.deleteEntity(pk, gridPos!);
    } catch (e: any) {
      if (e.statusCode !== 404) throw e;
    }

    try {
      const blob = imageContainer.getBlobClient(`${group}/${date}/${gridPos}.jpg`);
      await blob.deleteIfExists();
    } catch {}

    return { status: 204 };
  },
});
