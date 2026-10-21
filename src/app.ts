import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono, type Context } from "hono";
import { DEFAULT_TITLE, MAX_TITLE_LENGTH, isHexColor, renderBadge } from "./badge/svg.js";
import { normalizeKey, type CounterService } from "./counter/service.js";
import { resolveClientIp } from "./http/client-ip.js";
import { errorFields, type Logger } from "./log.js";

export interface AppOptions {
  service: CounterService;
  trustProxy: boolean;
  version: string;
  logger: Logger;
}

const BADGE_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  // Every load must reach the server, otherwise visits are not counted (GitHub's camo honours this).
  "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export function createApp({ service, trustProxy, version, logger }: AppOptions) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const started = performance.now();
    await next();
    logger.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    });
  });

  app.onError((err, c) => {
    logger.error("unhandled error", { path: c.req.path, ...errorFields(err) });
    return c.text("internal server error", 500);
  });

  app.notFound((c) => c.text("not found", 404));

  app.get("/healthz", (c) => {
    service.ping();
    return c.json({ status: "ok", version });
  });

  // Public contract (unchanged since v1): GET /?key=<key> counts the visit and returns an SVG badge.
  const badge = (c: Context) => {
    const key = normalizeKey(c.req.query("key"));
    if (!key) {
      return c.req.query("key") === undefined ? usage(c) : c.text("invalid key", 400);
    }
    const result = service.recordVisit(key, clientIp(c, trustProxy));
    const title = normalizeTitle(c.req.query("title"));
    const color = c.req.query("color");
    const svg = renderBadge({
      title,
      value: `${formatNumber(result.today)} / ${formatNumber(result.total)}`,
      ...(color && isHexColor(color) ? { color } : {}),
    });
    return c.body(svg, 200, BADGE_HEADERS);
  };
  app.get("/", badge);
  app.get("/badge", badge);

  // JSON API for scripts and pages that render their own counter.
  app.get("/api/v1/counters/:key", (c) => {
    const key = normalizeKey(c.req.param("key"));
    if (!key) {
      return c.json({ error: "invalid key" }, 400);
    }
    return c.json(service.getStats(key), 200, CORS_HEADERS);
  });

  app.post("/api/v1/counters/:key/hits", (c) => {
    const key = normalizeKey(c.req.param("key"));
    if (!key) {
      return c.json({ error: "invalid key" }, 400);
    }
    return c.json(service.recordVisit(key, clientIp(c, trustProxy)), 200, CORS_HEADERS);
  });

  app.options("/api/v1/*", (c) => c.body(null, 204, CORS_HEADERS));

  return app;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

function clientIp(c: Context, trustProxy: boolean): string {
  let socketAddress: string | undefined;
  try {
    socketAddress = getConnInfo(c).remote.address;
  } catch {
    socketAddress = undefined; // not running on a real socket (tests)
  }
  return resolveClientIp(c.req.raw.headers, socketAddress, trustProxy);
}

function normalizeTitle(raw: string | undefined): string {
  const title = raw?.trim();
  return title && title.length <= MAX_TITLE_LENGTH ? title : DEFAULT_TITLE;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function usage(c: Context) {
  return c.html(
    `<!doctype html><meta charset="utf-8"><title>visit-counter</title>` +
      `<body style="font-family:system-ui;max-width:40rem;margin:3rem auto;line-height:1.6">` +
      `<h1>visit-counter</h1>` +
      `<p>방문자 수 배지 서비스입니다. 키 하나당 카운터 하나이고, 같은 방문자는 하루에 한 번만 셉니다.</p>` +
      `<pre>&lt;img src="https://counter.kimhwan.kr/?key=YOUR-KEY"&gt;</pre>` +
      `<p>옵션: <code>&amp;title=라벨</code>, <code>&amp;color=79c83d</code>. ` +
      `JSON: <code>GET /api/v1/counters/YOUR-KEY</code> (세지 않음), <code>POST /api/v1/counters/YOUR-KEY/hits</code> (셈).</p>` +
      `<p><a href="https://github.com/akon47/visit-counter">github.com/akon47/visit-counter</a></p>`,
  );
}
