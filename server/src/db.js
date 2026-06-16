import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '..', 'data.sqlite');

let SQL;
let db;

function now() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function colNames(result) {
  if (!result || !result.length) return [];
  return result[0].map(c => c.column || c);
}

class Statement {
  constructor(sqlStr) {
    this.sql = sqlStr;
  }
  run(...params) {
    db.run(this.sql, params);
  }
  get(...params) {
    const results = db.exec(this.sql, params);
    if (!results.length || !results[0].values.length) return undefined;
    const cols = results[0].columns;
    const row = results[0].values[0];
    const obj = {};
    cols.forEach((c, i) => { obj[c] = row[i]; });
    return obj;
  }
  all(...params) {
    const results = db.exec(this.sql, params);
    if (!results.length) return [];
    const cols = results[0].columns;
    return results[0].values.map(row => {
      const obj = {};
      cols.forEach((c, i) => { obj[c] = row[i]; });
      return obj;
    });
  }
}

const wrapper = {
  prepare(sqlStr) {
    return new Statement(sqlStr);
  },
  exec(sqlStr) {
    db.run(sqlStr);
  },
  pragma(_) {},
  save() {
    if (db) {
      const data = db.export();
      const buffer = Buffer.from(data);
      writeFileSync(DB_PATH, buffer);
    }
  }
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS activities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  venue TEXT NOT NULL,
  show_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  area TEXT NOT NULL,
  row_num INTEGER NOT NULL,
  col_num INTEGER NOT NULL,
  price REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',
  locked_by TEXT,
  locked_at TEXT,
  UNIQUE(activity_id, area, row_num, col_num)
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  leader_name TEXT NOT NULL,
  leader_phone TEXT NOT NULL,
  area TEXT NOT NULL,
  min_members INTEGER NOT NULL,
  payment_deadline TEXT NOT NULL,
  refund_rule TEXT NOT NULL DEFAULT 'before_show',
  status TEXT NOT NULL DEFAULT 'forming',
  formed_at TEXT,
  created_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_phone TEXT NOT NULL,
  seat_id TEXT,
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment',
  paid_at TEXT,
  ticket_id TEXT,
  created_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'online',
  status TEXT NOT NULL DEFAULT 'pending',
  paid_at TEXT,
  created_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  activity_id TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'issued',
  issued_at TEXT DEFAULT '',
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS refunds (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  amount REAL NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  processed_at TEXT,
  created_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS verifications (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  operator TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'scan',
  status TEXT NOT NULL DEFAULT 'success',
  note TEXT,
  verified_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS reconciliations (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  expected_amount REAL NOT NULL,
  actual_amount REAL NOT NULL,
  difference REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS state_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  operator TEXT NOT NULL,
  reason TEXT,
  created_at TEXT DEFAULT ''
);
`;

export async function initDatabase() {
  SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const fileBuffer = readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run("PRAGMA foreign_keys = ON;");

  const tables = wrapper.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='activities'").get();
  if (!tables) {
    const statements = SCHEMA.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) db.run(stmt);
    }
  }

  setInterval(() => { wrapper.save(); }, 5000);

  return wrapper;
}

export function getDb() {
  return wrapper;
}

export default wrapper;
