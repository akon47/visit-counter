import { describe, expect, it } from "vitest";
import { dayKey, dayKeyDaysAgo, isDayKey } from "../src/counter/day.js";

describe("dayKey", () => {
  it("uses the configured time zone's calendar day", () => {
    expect(dayKey(new Date("2026-10-20T14:59:59Z"), "Asia/Seoul")).toBe("2026-10-20");
    expect(dayKey(new Date("2026-10-20T15:00:00Z"), "Asia/Seoul")).toBe("2026-10-21");
    expect(dayKey(new Date("2026-10-20T15:00:00Z"), "UTC")).toBe("2026-10-20");
  });

  it("computes the retention cutoff", () => {
    expect(dayKeyDaysAgo(new Date("2026-10-21T03:00:00Z"), 7, "Asia/Seoul")).toBe("2026-10-14");
  });

  it("recognises day keys", () => {
    expect(isDayKey("2026-10-21")).toBe(true);
    expect(isDayKey("2026-1-1")).toBe(false);
  });
});
