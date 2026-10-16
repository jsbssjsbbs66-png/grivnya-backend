"use strict";
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "grivnya.db");
require("node:fs").mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  ref_code TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  cat TEXT NOT NULL,
  title TEXT NOT NULL,
  price INTEGER NOT NULL,
  time_label TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  icon TEXT NOT NULL,
  link TEXT NOT NULL,
  slots INTEGER
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  amount INTEGER NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  auto_approved INTEGER NOT NULL DEFAULT 0 -- 1 when the test-mode timeout approved it, not a human admin
);
CREATE INDEX IF NOT EXISTS idx_submissions_task ON submissions(task_id, status);
CREATE INDEX IF NOT EXISTS idx_submissions_user ON submissions(user_id);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing', -- processing is the only honest status until a payment processor is connected
  requested_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Safe migration for databases created before the auto_approved column existed.
const submissionCols = db.prepare("PRAGMA table_info(submissions)").all().map((c) => c.name);
if (!submissionCols.includes("auto_approved")) {
  db.exec("ALTER TABLE submissions ADD COLUMN auto_approved INTEGER NOT NULL DEFAULT 0;");
}

module.exports = db;
