import { app, HttpRequest, HttpResponseInit } from "@azure/functions";
import { TableClient } from "@azure/data-tables";

const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const tableClient = TableClient.fromConnectionString(connStr, "days");

interface DayEntryEntity {
  partitionKey: string;
  rowKey: string;
  name: string;
  tilt: number;
  offsetX: number;
  offsetY: number;
}

// GET /api/days/{group}/{date}
app.http("getDayData", {
  methods: ["GET"],
  route: "days/{group}/{date}",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const { group, date } = req.params;
    const pk = `${group}#${date}`;
    const entries: DayEntryEntity[] = [];

    try {
      for await (const entity of tableClient.listEntities<DayEntryEntity>({
        queryOptions: { filter: `PartitionKey eq '${pk}'` },
      })) {
        entries.push(entity);
      }
    } catch (e: any) {
      if (e.statusCode === 404) {
        return { jsonBody: { entries: [] } };
      }
      throw e;
    }

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

// POST /api/days/{group}/{date}
app.http("saveDayData", {
  methods: ["POST"],
  route: "days/{group}/{date}",
  handler: async (req: HttpRequest): Promise<HttpResponseInit> => {
    const { group, date } = req.params;
    const pk = `${group}#${date}`;
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
