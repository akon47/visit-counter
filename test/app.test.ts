import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { CounterRepository } from "../src/counter/repository.js";
import { CounterService } from "../src/counter/service.js";
import { openDatabase } from "../src/db/database.js";
import { silentLogger } from "../src/log.js";

function makeApp(trustProxy = true) {
  const repo = new CounterRepository(openDatabase(":memory:"));
  const service = new CounterService(repo, { timeZone: "Asia/Seoul", retentionDays: 7 });
  return createApp({ service, trustProxy, version: "test", logger: silentLogger });
}

const from = (ip: string) => ({ headers: { "x-real-ip": ip } });

describe("badge endpoint", () => {
  it("returns an SVG badge and counts each visitor once per day", async () => {
    const app = makeApp();

    const res = await app.request("/?key=demo", from("1.2.3.4"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const svg = await res.text();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("방문자");
    expect(svg).toContain("1 / 1");

    const again = await app.request("/?key=demo", from("1.2.3.4"));
    expect(await again.text()).toContain("1 / 1");

    const other = await app.request("/badge?key=demo", from("9.9.9.9"));
    expect(await other.text()).toContain("2 / 2");
  });

  it("ignores proxy headers when no proxy is trusted", async () => {
    const app = makeApp(false);
    await app.request("/?key=demo", from("1.2.3.4"));
    const res = await app.request("/?key=demo", from("5.6.7.8"));
    expect(await res.text()).toContain("1 / 1"); // same (unknown) socket address -> same visitor
  });

  it("escapes the title and validates the colour", async () => {
    const app = makeApp();
    const res = await app.request("/?key=x&title=%3Cb%3Ehi%3C%2Fb%3E&color=zzz", from("1.2.3.4"));
    const svg = await res.text();
    expect(svg).toContain("&lt;b&gt;hi&lt;/b&gt;");
    expect(svg).not.toContain("<b>");
    expect(svg).toContain('fill="#79c83d"');

    const red = await (await app.request("/?key=x&color=ff0000", from("1.2.3.4"))).text();
    expect(red).toContain('fill="#ff0000"');
  });

  it("formats large numbers with separators", async () => {
    const app = makeApp();
    for (let i = 0; i < 1001; i += 1) {
      await app.request("/?key=big", from(`10.0.${Math.floor(i / 256)}.${i % 256}`));
    }
    const svg = await (await app.request("/api/v1/counters/big")).json();
    expect(svg).toMatchObject({ total: 1001, today: 1001 });
    const badge = await (await app.request("/?key=big", from("10.0.3.232"))).text(); // visitor #1001 again
    expect(badge).toContain("1,001 / 1,001");
  });

  it("shows usage without a key and rejects invalid keys", async () => {
    const app = makeApp();
    const usage = await app.request("/");
    expect(usage.status).toBe(200);
    expect(usage.headers.get("content-type")).toContain("text/html");

    expect((await app.request("/?key=%20")).status).toBe(400);
    expect((await app.request(`/?key=${"a".repeat(513)}`)).status).toBe(400);
    expect((await app.request("/nope")).status).toBe(404);
  });
});

describe("JSON API", () => {
  it("reads without counting and counts on POST", async () => {
    const app = makeApp();
    expect(await (await app.request("/api/v1/counters/demo")).json()).toMatchObject({
      key: "demo",
      total: 0,
      today: 0,
    });

    const hit = await app.request("/api/v1/counters/demo/hits", { method: "POST", ...from("1.2.3.4") });
    expect(hit.status).toBe(200);
    expect(hit.headers.get("access-control-allow-origin")).toBe("*");
    expect(await hit.json()).toMatchObject({ counted: true, total: 1, today: 1 });

    expect(await (await app.request("/api/v1/counters/demo")).json()).toMatchObject({ total: 1, today: 1 });
    expect((await app.request("/api/v1/counters/%20")).status).toBe(400);
  });

  it("answers CORS preflight", async () => {
    const app = makeApp();
    const res = await app.request("/api/v1/counters/demo/hits", { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("reports health and version", async () => {
    const app = makeApp();
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", version: "test" });
  });
});
