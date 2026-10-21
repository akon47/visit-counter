/**
 * Replays v1 (MongoDB) `visitors` documents through the normal visit path, so the same rules apply
 * (one count per visitor per key per day in the configured time zone).
 *
 * Idempotent: every document id is recorded in `legacy_imported` before it is counted, so running the
 * import again, or importing a newer export that still contains the old documents, never counts a
 * document twice, even after the dedup rows in `visits` were pruned.
 */
import { createHash } from "node:crypto";
import type { CounterRepository } from "../counter/repository.js";
import type { CounterService } from "../counter/service.js";

export interface LegacyDoc {
  _id?: unknown;
  key?: unknown;
  address?: unknown;
  visitedDate?: unknown;
  createdAt?: unknown;
}

export interface ImportSummary {
  /** Documents read. */
  seen: number;
  /** Documents that produced a new count. */
  counted: number;
  /** Documents already imported earlier. */
  alreadyImported: number;
  /** Documents whose visitor had already been counted for that key and day (duplicates inside v1). */
  duplicates: number;
  /** Documents missing key, address or date. */
  skipped: number;
  /** Distinct keys touched. */
  keys: number;
}

export interface ImportDeps {
  repo: CounterRepository;
  service: CounterService;
  /** Documents per transaction. */
  batchSize?: number;
}

export async function importLegacyDocuments(
  docs: AsyncIterable<LegacyDoc> | Iterable<LegacyDoc>,
  { repo, service, batchSize = 1000 }: ImportDeps,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    seen: 0,
    counted: 0,
    alreadyImported: 0,
    duplicates: 0,
    skipped: 0,
    keys: 0,
  };
  const keys = new Set<string>();
  let batch: ParsedDoc[] = [];

  const flush = () => {
    repo.transaction(() => {
      for (const doc of batch) {
        if (!repo.markLegacyImported(doc.id)) {
          summary.alreadyImported += 1;
          continue;
        }
        keys.add(doc.key);
        if (service.recordVisit(doc.key, doc.address, doc.at).counted) {
          summary.counted += 1;
        } else {
          summary.duplicates += 1;
        }
      }
    });
    batch = [];
  };

  for await (const raw of docs) {
    summary.seen += 1;
    const doc = parseDoc(raw);
    if (!doc) {
      summary.skipped += 1;
      continue;
    }
    batch.push(doc);
    if (batch.length >= batchSize) {
      flush();
    }
  }
  flush();
  summary.keys = keys.size;
  return summary;
}

interface ParsedDoc {
  id: string;
  key: string;
  address: string;
  at: Date;
}

export function parseDoc(doc: LegacyDoc): ParsedDoc | undefined {
  const key = typeof doc.key === "string" ? doc.key.trim() : "";
  const address = typeof doc.address === "string" ? doc.address.trim() : "";
  const at = parseDate(doc.visitedDate) ?? parseDate(doc.createdAt);
  if (!key || !address || !at) {
    return undefined;
  }
  return { id: documentId(doc, key, address, at), key, address, at };
}

/** Mongo ObjectId when present, otherwise a stable hash of the document's content. */
function documentId(doc: LegacyDoc, key: string, address: string, at: Date): string {
  const id = doc._id;
  if (typeof id === "string" && id) {
    return id;
  }
  if (id && typeof id === "object" && "$oid" in id && typeof id.$oid === "string") {
    return id.$oid;
  }
  return "sha256:" + createHash("sha256").update(`${key}\n${address}\n${at.toISOString()}`).digest("hex");
}

export function parseDate(value: unknown): Date | undefined {
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (value && typeof value === "object" && "$date" in value) {
    return parseDate(value.$date);
  }
  return undefined;
}
