import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrations, type Migration } from "./migrations.js";

export type Db = Database.Database;

/** Opens (creating if needed) the SQLite database with production pragmas and applies pending migrations. */
export function openDatabase(path: string): Db {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

/** Applies migrations that are not yet recorded in schema_migrations. Returns how many were applied. */
export function migrate(db: Db): number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT
  `);
  const applied = new Set(
    (db.prepare("SELECT version FROM schema_migrations").all() as { version: number }[]).map(
      (r) => r.version,
    ),
  );
  const record = db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)");
  const apply = db.transaction((m: Migration) => {
    db.exec(m.sql);
    record.run(m.version, m.name, new Date().toISOString());
  });

  let count = 0;
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (!applied.has(m.version)) {
      apply(m);
      count += 1;
    }
  }
  return count;
}
