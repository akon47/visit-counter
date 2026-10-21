/**
 * One-off import of the v1 (MongoDB) data.
 *
 *   node dist/scripts/import-legacy.js <visitors.json>
 *
 * Input: the `visitors` collection exported by mongo-express or mongoexport, either a JSON array or one
 * JSON object per line. Each document has { _id, key, address, visitedDate } (dates as ISO strings or
 * {"$date": "..."}). Safe to run repeatedly and with newer exports (see src/legacy/import.ts).
 * Uses DATA_DIR / TIMEZONE / VISIT_RETENTION_DAYS like the server.
 */
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { loadConfig } from "../config.js";
import { CounterRepository } from "../counter/repository.js";
import { CounterService } from "../counter/service.js";
import { openDatabase } from "../db/database.js";
import { importLegacyDocuments, type LegacyDoc } from "../legacy/import.js";

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
    buffered += line; // JSON array, possibly spread over lines
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

  const summary = await importLegacyDocuments(readDocuments(file), { repo, service });
  // Keep the dedup set small after a bulk import; totals and daily counts stay, and legacy_imported
  // guards against re-counting.
  const pruned = service.prune();
  repo.setMeta("legacy_import", JSON.stringify({ file, at: new Date().toISOString(), ...summary }));
  db.close();
  console.log(JSON.stringify({ ...summary, pruned }));
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
