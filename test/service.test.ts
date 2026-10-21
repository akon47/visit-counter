import { beforeEach, describe, expect, it } from "vitest";
import { CounterRepository } from "../src/counter/repository.js";
import { CounterService, normalizeKey } from "../src/counter/service.js";
import { openDatabase } from "../src/db/database.js";

const options = { timeZone: "Asia/Seoul", retentionDays: 7 };

function setup() {
  const db = openDatabase(":memory:");
  const repo = new CounterRepository(db);
  return { db, repo, service: new CounterService(repo, options) };
}

describe("CounterService", () => {
  let s: ReturnType<typeof setup>;
  const at = new Date("2026-10-21T03:00:00Z"); // 2026-10-21 12:00 KST

  beforeEach(() => {
    s = setup();
  });

  it("counts a visitor once per day", () => {
    expect(s.service.recordVisit("k", "1.2.3.4", at)).toMatchObject({
      counted: true,
      total: 1,
      today: 1,
      day: "2026-10-21",
    });
    const later = new Date(at.getTime() + 3_600_000);
    expect(s.service.recordVisit("k", "1.2.3.4", later)).toMatchObject({
      counted: false,
      total: 1,
      today: 1,
    });
    expect(s.service.recordVisit("k", "5.6.7.8", at)).toMatchObject({ counted: true, total: 2, today: 2 });
  });

  it("counts the same visitor again on the next calendar day in the configured zone", () => {
    s.service.recordVisit("k", "1.2.3.4", new Date("2026-10-20T14:59:59Z")); // 23:59:59 KST, Oct 20
    const next = s.service.recordVisit("k", "1.2.3.4", new Date("2026-10-20T15:00:00Z")); // 00:00 KST, Oct 21
    expect(next).toMatchObject({ counted: true, total: 2, today: 1, day: "2026-10-21" });
    expect(s.repo.getDailyCount("k", "2026-10-20")).toBe(1);
  });

  it("keeps keys independent", () => {
    s.service.recordVisit("a", "1.2.3.4", at);
    expect(s.service.recordVisit("b", "1.2.3.4", at)).toMatchObject({ counted: true, total: 1, today: 1 });
    expect(s.service.getStats("a", at)).toMatchObject({ total: 1, today: 1 });
  });

  it("reads zero for unknown keys without creating them", () => {
    expect(s.service.getStats("nope", at)).toEqual({ key: "nope", day: "2026-10-21", total: 0, today: 0 });
    expect(s.repo.countCounters()).toBe(0);
  });

  it("prunes old dedup rows but keeps totals and daily counts", () => {
    s.service.recordVisit("k", "1.2.3.4", new Date("2026-10-01T03:00:00Z"));
    s.service.recordVisit("k", "1.2.3.4", at);
    expect(s.repo.countVisits()).toBe(2);

    expect(s.service.prune(at)).toBe(1);

    expect(s.repo.countVisits()).toBe(1);
    expect(s.service.getStats("k", at)).toMatchObject({ total: 2, today: 1 });
    expect(s.repo.getDailyCount("k", "2026-10-01")).toBe(1);
  });

  it("persists the visitor salt so hashes stay stable across restarts", () => {
    s.service.recordVisit("k", "1.2.3.4", at);
    const restarted = new CounterService(s.repo, options);
    expect(restarted.recordVisit("k", "1.2.3.4", at).counted).toBe(false);
  });

  it("never stores raw addresses", () => {
    s.service.recordVisit("k", "1.2.3.4", at);
    const rows = s.db.prepare("SELECT visitor_hash FROM visits").all() as { visitor_hash: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.visitor_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(rows)).not.toContain("1.2.3.4");
  });
});

describe("normalizeKey", () => {
  it("trims and accepts printable keys up to 512 characters", () => {
    expect(normalizeKey("  github-akon47 ")).toBe("github-akon47");
    expect(normalizeKey("한글 키")).toBe("한글 키");
    expect(normalizeKey("a".repeat(512))).toHaveLength(512);
  });

  it("rejects empty, oversized and control-character keys", () => {
    expect(normalizeKey(undefined)).toBeUndefined();
    expect(normalizeKey("   ")).toBeUndefined();
    expect(normalizeKey("a".repeat(513))).toBeUndefined();
    expect(normalizeKey("bad\nkey")).toBeUndefined();
  });
});
