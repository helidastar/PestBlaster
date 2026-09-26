import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_DEVICE_ID = "turret-1";

export function dataDir(): string {
  return path.resolve(process.env.PESTBLASTER_DATA_DIR ?? "./data");
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS device (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_seen TEXT,
  pan REAL NOT NULL DEFAULT 0,
  lift REAL NOT NULL DEFAULT 300,
  swivel REAL NOT NULL DEFAULT 60,
  reservoir_pct REAL NOT NULL DEFAULT 100,
  mode TEXT NOT NULL DEFAULT 'auto' CHECK (mode IN ('auto','paused')),
  firmware TEXT,
  auto_fire INTEGER NOT NULL DEFAULT 1,
  confidence_threshold REAL NOT NULL DEFAULT 0.6,
  burst_ms INTEGER NOT NULL DEFAULT 400,
  cooldown_s INTEGER NOT NULL DEFAULT 10,
  reservoir_low_pct INTEGER NOT NULL DEFAULT 20
);
CREATE TABLE IF NOT EXISTS captures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES device(id),
  created_at TEXT NOT NULL,
  image TEXT,
  pan REAL NOT NULL, lift REAL NOT NULL, swivel REAL NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('fire','hold')),
  hold_reason TEXT
);
CREATE INDEX IF NOT EXISTS captures_created ON captures(created_at);
CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  capture_id INTEGER NOT NULL REFERENCES captures(id) ON DELETE CASCADE,
  pest TEXT NOT NULL,
  confidence REAL NOT NULL,
  x REAL NOT NULL, y REAL NOT NULL, w REAL NOT NULL, h REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS detections_capture ON detections(capture_id);
CREATE TABLE IF NOT EXISTS fire_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES device(id),
  created_at TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('auto','manual')),
  duration_ms INTEGER NOT NULL,
  pan REAL NOT NULL, lift REAL NOT NULL, swivel REAL NOT NULL,
  capture_id INTEGER REFERENCES captures(id) ON DELETE SET NULL,
  pest TEXT
);
CREATE INDEX IF NOT EXISTS fire_events_created ON fire_events(created_at);
CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL REFERENCES device(id),
  created_at TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('fire','move','home','set_mode')),
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','done','failed')),
  done_at TEXT
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pest','reservoir_low','device')),
  message TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0
);
`;

export function openDb(file: string): DatabaseSync {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  db.prepare("INSERT OR IGNORE INTO device (id, name) VALUES (?, ?)").run(
    DEFAULT_DEVICE_ID,
    "Lettuce bed turret",
  );
  return db;
}

const globalForDb = globalThis as unknown as { pestblasterDb?: DatabaseSync };

/** One shared connection per server process (survives Next.js hot reload in dev). */
export function getDb(): DatabaseSync {
  if (!globalForDb.pestblasterDb) {
    globalForDb.pestblasterDb = openDb(path.join(dataDir(), "pestblaster.db"));
  }
  return globalForDb.pestblasterDb;
}
