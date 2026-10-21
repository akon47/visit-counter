import { describe, expect, it } from "vitest";
import { CounterRepository } from "../src/counter/repository.js";
import { CounterService } from "../src/counter/service.js";
import { openDatabase } from "../src/db/database.js";
import { importLegacyDocuments, parseDate, type LegacyDoc } from "../src/legacy/import.js";

function setup() {
  const repo = new CounterRepository(openDatabase(":memory:"));
  const service = new CounterService(repo, { timeZone: "Asia/Seoul", retentionDays: 7 });
  return { repo, service };
}

const docs: LegacyDoc[] = [
  { _id: { $oid: "a1" }, key: "k", address: "1.1.1.1", visitedDate: { $date: "2022-09-05T14:15:41.418Z" } },
  { _id: { $oid: "a2" }, key: "k", address: "1.1.1.1", visitedDate: { $date: "2022-09-05T14:59:00.000Z" } }, // same KST day
  { _id: { $oid: "a3" }, key: "k", address: "1.1.1.1", visitedDate: { $date: "2022-09-05T15:00:00.000Z" } }, // next KST day
  { _id: { $oid: "a4" }, key: "other", address: "2.2.2.2", visitedDate: "2024-01-01T00:00:00Z" },
  { _id: { $oid: "a5" }, key: "", address: "3.3.3.3", visitedDate: "2024-01-01T00:00:00Z" }, // invalid
  { key: "noid", address: "4.4.4.4", visitedDate: "2024-01-01T00:00:00Z" }, // no _id -> content hash
];

describe("importLegacyDocuments", () => {
  it("replays documents with the per-day rule", async () => {
    const { repo, service } = setup();
    const summary = await importLegacyDocuments(docs, { repo, service, batchSize: 2 });
    expect(summary).toEqual({ seen: 6, counted: 4, alreadyImported: 0, duplicates: 1, skipped: 1, keys: 3 });
    expect(service.getStats("k")).toMatchObject({ total: 2 });
    expect(repo.getDailyCount("k", "2022-09-05")).toBe(1);
    expect(repo.getDailyCount("k", "2022-09-06")).toBe(1);
    expect(service.getStats("other")).toMatchObject({ total: 1 });
    expect(service.getStats("noid")).toMatchObject({ total: 1 });
  });

  it("is idempotent, also after the dedup rows were pruned", async () => {
    const { repo, service } = setup();
    await importLegacyDocuments(docs, { repo, service });
    expect(service.prune(new Date("2026-10-21T03:00:00Z"))).toBeGreaterThan(0);

    const again = await importLegacyDocuments(docs, { repo, service });
    expect(again).toMatchObject({ counted: 0, alreadyImported: 5, skipped: 1 });
    expect(service.getStats("k")).toMatchObject({ total: 2 });
    expect(service.getStats("other")).toMatchObject({ total: 1 });
    expect(service.getStats("noid")).toMatchObject({ total: 1 });
  });

  it("imports only the new documents of a newer export", async () => {
    const { repo, service } = setup();
    await importLegacyDocuments(docs, { repo, service });
    const newer = [
      ...docs,
      { _id: { $oid: "a6" }, key: "k", address: "9.9.9.9", visitedDate: "2026-10-20T00:00:00Z" },
    ];
    const delta = await importLegacyDocuments(newer, { repo, service });
    expect(delta).toMatchObject({ counted: 1, alreadyImported: 5 });
    expect(service.getStats("k")).toMatchObject({ total: 3 });
  });
});

describe("parseDate", () => {
  it("accepts ISO strings, epoch numbers and Mongo extended JSON", () => {
    expect(parseDate("2024-01-01T00:00:00Z")?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(parseDate(0)?.toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(parseDate({ $date: "2024-01-01T00:00:00Z" })?.toISOString()).toBe("2024-01-01T00:00:00.000Z");
    expect(parseDate("nope")).toBeUndefined();
    expect(parseDate(null)).toBeUndefined();
  });
});
