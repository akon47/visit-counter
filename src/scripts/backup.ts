/**
 * Consistent online snapshot of the SQLite database (safe while the server is running, WAL included).
 *
 *   node dist/scripts/backup.js <destination.db>
 */
import { join } from "node:path";
import { loadConfig } from "../config.js";
import { openDatabase } from "../db/database.js";

async function main(): Promise<void> {
  const dest = process.argv[2];
  if (!dest) {
    console.error("usage: backup <destination.db>");
    process.exit(2);
  }
  const config = loadConfig();
  const db = openDatabase(join(config.DATA_DIR, "visit-counter.db"));
  try {
    await db.backup(dest);
    console.log(JSON.stringify({ backup: dest }));
  } finally {
    db.close();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
