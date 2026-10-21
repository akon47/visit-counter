/**
 * Schema migrations, applied in order inside a transaction each; never edit an entry once it has shipped,
 * append a new one instead. Versions are recorded in schema_migrations.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "initial",
    sql: `
      -- One row per counter key. total is authoritative (incremented in the same transaction as a visit).
      CREATE TABLE counters (
        key        TEXT PRIMARY KEY,
        total      INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      -- Unique visitors per key per day (day = YYYY-MM-DD in the configured time zone). Kept forever.
      CREATE TABLE daily_counts (
        key   TEXT    NOT NULL REFERENCES counters(key) ON DELETE CASCADE,
        day   TEXT    NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (key, day)
      ) STRICT, WITHOUT ROWID;

      -- Deduplication set: one row per (key, day, visitor). visitor_hash = sha256(salt + ip), so raw
      -- addresses are never stored. Rows older than VISIT_RETENTION_DAYS are pruned.
      CREATE TABLE visits (
        key          TEXT NOT NULL,
        day          TEXT NOT NULL,
        visitor_hash TEXT NOT NULL,
        PRIMARY KEY (key, day, visitor_hash)
      ) STRICT, WITHOUT ROWID;
      CREATE INDEX visits_by_day ON visits(day);

      -- Small key/value store (visitor hash salt, import markers).
      CREATE TABLE meta (
        k TEXT PRIMARY KEY,
        v TEXT NOT NULL
      ) STRICT;
    `,
  },
];
