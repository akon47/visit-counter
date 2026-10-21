import type { Db } from "../db/database.js";

export interface CounterRow {
  key: string;
  total: number;
  created_at: string;
  updated_at: string;
}

/** Thin data-access layer over the counter tables. All statements are prepared once. */
export class CounterRepository {
  private readonly stmts;

  constructor(private readonly db: Db) {
    this.stmts = {
      ensureCounter: db.prepare(
        "INSERT INTO counters (key, total, created_at, updated_at) VALUES (?, 0, ?, ?) ON CONFLICT(key) DO NOTHING",
      ),
      insertVisit: db.prepare(
        "INSERT INTO visits (key, day, visitor_hash) VALUES (?, ?, ?) ON CONFLICT(key, day, visitor_hash) DO NOTHING",
      ),
      incrementDaily: db.prepare(
        "INSERT INTO daily_counts (key, day, count) VALUES (?, ?, 1) ON CONFLICT(key, day) DO UPDATE SET count = count + 1",
      ),
      incrementTotal: db.prepare("UPDATE counters SET total = total + 1, updated_at = ? WHERE key = ?"),
      getCounter: db.prepare("SELECT key, total, created_at, updated_at FROM counters WHERE key = ?"),
      getDailyCount: db.prepare("SELECT count FROM daily_counts WHERE key = ? AND day = ?"),
      deleteVisitsBefore: db.prepare("DELETE FROM visits WHERE day < ?"),
      countVisits: db.prepare("SELECT COUNT(*) AS n FROM visits"),
      countCounters: db.prepare("SELECT COUNT(*) AS n FROM counters"),
      getMeta: db.prepare("SELECT v FROM meta WHERE k = ?"),
      setMeta: db.prepare(
        "INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
      ),
      ping: db.prepare("SELECT 1"),
      markLegacyImported: db.prepare(
        "INSERT INTO legacy_imported (id) VALUES (?) ON CONFLICT(id) DO NOTHING",
      ),
    };
  }

  /** Runs `fn` inside a transaction (nested calls join the outer transaction). */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  ensureCounter(key: string, nowIso: string): void {
    this.stmts.ensureCounter.run(key, nowIso, nowIso);
  }

  /** Returns true when the visitor had not been seen for this key on this day yet. */
  insertVisit(key: string, day: string, visitorHash: string): boolean {
    return this.stmts.insertVisit.run(key, day, visitorHash).changes === 1;
  }

  incrementDaily(key: string, day: string): void {
    this.stmts.incrementDaily.run(key, day);
  }

  incrementTotal(key: string, nowIso: string): void {
    this.stmts.incrementTotal.run(nowIso, key);
  }

  getCounter(key: string): CounterRow | undefined {
    return this.stmts.getCounter.get(key) as CounterRow | undefined;
  }

  getDailyCount(key: string, day: string): number {
    const row = this.stmts.getDailyCount.get(key, day) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  deleteVisitsBefore(day: string): number {
    return this.stmts.deleteVisitsBefore.run(day).changes;
  }

  countVisits(): number {
    return (this.stmts.countVisits.get() as { n: number }).n;
  }

  countCounters(): number {
    return (this.stmts.countCounters.get() as { n: number }).n;
  }

  getMeta(k: string): string | undefined {
    return (this.stmts.getMeta.get(k) as { v: string } | undefined)?.v;
  }

  setMeta(k: string, v: string): void {
    this.stmts.setMeta.run(k, v);
  }

  /** Records a v1 document id; returns false when that document was imported before. */
  markLegacyImported(id: string): boolean {
    return this.stmts.markLegacyImported.run(id).changes === 1;
  }

  ping(): void {
    this.stmts.ping.get();
  }
}
