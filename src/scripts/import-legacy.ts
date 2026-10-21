/**
 * One-off import of the v1 (MongoDB) data.
 *
 *   node dist/scripts/import-legacy.js <visitors.json>
 *
 * Input: the `visitors` collection exported by mongo-express or mongoexport, either a JSON array or one
 * JSON object per line. Each document has { key, address, visitedDate } (dates as ISO strings or
 * {"$date": "..."}). Every document is replayed through the normal visit path, so the same rules apply
 * (one count per visitor per key per day in TIMEZONE) and re-running the import is harmless: visitors
 * already recorded for that day are skipped. Uses DATA_DIR / TIMEZONE / VISIT_RETENTION_DAYS like the server.
 */
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { loadConfig } from "../config.js";
import { CounterRepository } from "../counter/repository.js";
import { CounterService } from "../counter/service.js";
import { openDatabase } from "../db/database.js";

interface LegacyDoc {
  key?: unknown;
  address?: unknown;
  visitedDate?: unknown;
  createdAt?: unknown;
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (value && typeof value === "object" && "$date" in value) {
    return parseDate(value.$date);
  }
  return undefined;
}

async function* readDocuments(path: string): AsyncGenerator<LegacyDoc> {
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  let buffered = "";
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.startsWith("{") && trimmed.endsWith("}") && !buffered) {
      yield JSON.parse(trimmed) as LegacyDoc; // JSON lines
      continue;
    }
    buffered += line; // JSON array spread over lines (or on one line)
  }
  if (buffered.trim()) {
    const parsed = JSON.parse(buffered) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("expected a JSON array or JSON lines");
    }
    for (const doc of parsed) {
      yield doc as LegacyDoc;
    }
  }
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: import-legacy <visitors.json>");
    process.exit(2);
  }
  const config = loadConfig();
  const db = openDatabase(join(config.DATA_DIR, "visit-counter.db"));
  const repo = new CounterRepository(db);
  const service = new CounterService(repo, {
    timeZone: config.TIMEZONE,
    retentionDays: config.VISIT_RETENTION_DAYS,
  });

  let seen = 0;
  let counted = 0;
  let skipped = 0;
  const keys = new Set<string>();
  // Replay in one transaction per batch for speed.
  let batch: { key: string; address: string; at: Date }[] = [];
  const flush = () => {
    repo.transaction(() => {
      for (const doc of batch) {
        if (service.recordVisit(doc.key, doc.address, doc.at).counted) {
          counted += 1;
        }
        keys.add(doc.key);
      }
    });
    batch = [];
  };

  for await (const doc of readDocuments(file)) {
    seen += 1;
    const key = typeof doc.key === "string" ? doc.key.trim() : "";
    const address = typeof doc.address === "string" ? doc.address.trim() : "";
    const at = parseDate(doc.visitedDate) ?? parseDate(doc.createdAt);
    if (!key || !address || !at) {
      skipped += 1;
      continue;
    }
    batch.push({ key, address, at });
    if (batch.length >= 1000) {
      flush();
    }
  }
  flush();

  // Keep the dedup set small after a bulk import (totals and daily counts stay).
  const pruned = service.prune();
  repo.setMeta(
    "legacy_import",
    JSON.stringify({ file, at: new Date().toISOString(), seen, counted, skipped }),
  );
  db.close();
  console.log(JSON.stringify({ seen, counted, skipped, keys: keys.size, pruned }));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
