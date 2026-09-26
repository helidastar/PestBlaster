/** Deletes the local database and snapshots so a demo can start from zero. Stop the app first. */
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.env.PESTBLASTER_DATA_DIR ?? "./data");
for (const name of ["pestblaster.db", "pestblaster.db-wal", "pestblaster.db-shm", "snapshots"]) {
  fs.rmSync(path.join(dir, name), { recursive: true, force: true });
}
console.log(`Cleared PestBlaster data in ${dir}`);
