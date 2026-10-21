import { serve } from "@hono/node-server";
import { join } from "node:path";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { CounterRepository } from "./counter/repository.js";
import { CounterService } from "./counter/service.js";
import { openDatabase } from "./db/database.js";
import { createLogger, errorFields } from "./log.js";

const logger = createLogger();

function main(): void {
  const config = loadConfig();
  const dbPath = join(config.DATA_DIR, "visit-counter.db");
  const db = openDatabase(dbPath);
  const service = new CounterService(new CounterRepository(db), {
    timeZone: config.TIMEZONE,
    retentionDays: config.VISIT_RETENTION_DAYS,
  });

  const prune = () => {
    try {
      const removed = service.prune();
      if (removed > 0) {
        logger.info("pruned old visit rows", { removed });
      }
    } catch (err) {
      logger.error("prune failed", errorFields(err));
    }
  };
  prune();
  const pruneTimer = setInterval(prune, 60 * 60 * 1000);
  pruneTimer.unref();

  const app = createApp({
    service,
    trustProxy: config.TRUSTED_PROXY,
    version: config.APP_VERSION,
    logger,
  });

  const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
    logger.info("listening", {
      address: info.address,
      port: info.port,
      db: dbPath,
      timeZone: config.TIMEZONE,
      trustProxy: config.TRUSTED_PROXY,
      version: config.APP_VERSION,
    });
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info("shutting down", { signal });
    clearInterval(pruneTimer);
    const force = setTimeout(() => {
      logger.warn("forced exit after timeout");
      process.exit(1);
    }, 10_000);
    force.unref();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

try {
  main();
} catch (err) {
  logger.error("startup failed", errorFields(err));
  process.exit(1);
}
