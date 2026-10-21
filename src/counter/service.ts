import { createHash, randomBytes } from "node:crypto";
import { dayKey, dayKeyDaysAgo } from "./day.js";
import type { CounterRepository } from "./repository.js";

export interface CounterServiceOptions {
  /** IANA time zone defining the calendar day. */
  timeZone: string;
  /** Raw visit rows older than this are pruned. */
  retentionDays: number;
}

export interface CounterStats {
  key: string;
  /** Calendar day (YYYY-MM-DD) that `today` refers to. */
  day: string;
  /** Unique visitors over all time. */
  total: number;
  /** Unique visitors on `day`. */
  today: number;
}

export interface VisitResult extends CounterStats {
  /** True when this request was counted (first time this visitor hit the key on this day). */
  counted: boolean;
}

const MAX_KEY_LENGTH = 512;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/** A key is any printable string up to 512 characters (the legacy service accepted the same). */
export function normalizeKey(raw: string | undefined): string | undefined {
  const key = raw?.trim();
  if (!key || key.length > MAX_KEY_LENGTH || CONTROL_CHARS.test(key)) {
    return undefined;
  }
  return key;
}

const SALT_META_KEY = "visitor_salt";

/** Business rules: one count per visitor per key per calendar day; totals never decrease. */
export class CounterService {
  private readonly salt: string;
  private readonly recordVisitTx: (key: string, day: string, hash: string, nowIso: string) => VisitResult;

  constructor(
    private readonly repo: CounterRepository,
    private readonly options: CounterServiceOptions,
  ) {
    this.salt = this.loadOrCreateSalt();
    this.recordVisitTx = (key, day, hash, nowIso) =>
      this.repo.transaction(() => {
        this.repo.ensureCounter(key, nowIso);
        const counted = this.repo.insertVisit(key, day, hash);
        if (counted) {
          this.repo.incrementDaily(key, day);
          this.repo.incrementTotal(key, nowIso);
        }
        return { key, day, counted, ...this.readCounts(key, day) };
      });
  }

  /** Counts a visit (if not seen today) and returns the up-to-date numbers. */
  recordVisit(key: string, visitorAddress: string, now: Date = new Date()): VisitResult {
    const day = dayKey(now, this.options.timeZone);
    return this.recordVisitTx(key, day, this.hashVisitor(visitorAddress), now.toISOString());
  }

  /** Current numbers without counting anything. Unknown keys read as zero. */
  getStats(key: string, now: Date = new Date()): CounterStats {
    const day = dayKey(now, this.options.timeZone);
    return { key, day, ...this.readCounts(key, day) };
  }

  /** Deletes dedup rows older than the retention window. Returns the number of rows removed. */
  prune(now: Date = new Date()): number {
    const cutoff = dayKeyDaysAgo(now, this.options.retentionDays, this.options.timeZone);
    return this.repo.deleteVisitsBefore(cutoff);
  }

  /** Cheap liveness check against the database. */
  ping(): void {
    this.repo.ping();
  }

  private readCounts(key: string, day: string): { total: number; today: number } {
    return { total: this.repo.getCounter(key)?.total ?? 0, today: this.repo.getDailyCount(key, day) };
  }

  private hashVisitor(address: string): string {
    return createHash("sha256").update(`${this.salt}:${address}`).digest("hex");
  }

  private loadOrCreateSalt(): string {
    return this.repo.transaction(() => {
      const existing = this.repo.getMeta(SALT_META_KEY);
      if (existing) {
        return existing;
      }
      const salt = randomBytes(32).toString("hex");
      this.repo.setMeta(SALT_META_KEY, salt);
      return salt;
    });
  }
}
