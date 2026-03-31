import initSqlJs, { type Database } from "sql.js";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "tvg.db");
const WASM_PATH = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  throw new Error("DB not initialized — call initDb() first");
}

export async function initDb(): Promise<Database> {
  if (_db) return _db;

  const SQL = await initSqlJs({
    wasmBinary: fs.readFileSync(WASM_PATH),
  });

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    _db = new SQL.Database(buf);
  } else {
    _db = new SQL.Database();
  }

  _db.run("PRAGMA journal_mode = WAL");
  _db.run("PRAGMA foreign_keys = ON");

  _db.run(`
    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      broadcast_type TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      channel_number TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      visible INTEGER NOT NULL DEFAULT 1,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      UNIQUE(broadcast_type, channel_name)
    )
  `);

  _db.run(`
    CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      broadcast_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      detail_url TEXT DEFAULT '',
      genre TEXT DEFAULT '',
      pid TEXT DEFAULT ''
    )
  `);

  _db.run("CREATE INDEX IF NOT EXISTS idx_programs_date ON programs(broadcast_date)");
  _db.run("CREATE INDEX IF NOT EXISTS idx_programs_channel_date ON programs(channel_id, broadcast_date)");

  return _db;
}

export function saveDb() {
  if (!_db) return;
  const data = _db.export();
  const buf = Buffer.from(data);
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, buf);
}
