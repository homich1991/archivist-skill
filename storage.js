import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

function dbPath() {
  return process.env.DEEP_THOUGHT_DB ?? join(homedir(), '.claude', 'storage', 'storage.db');
}

function openDb() {
  const path = dbPath();
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id         TEXT PRIMARY KEY,
      namespace  TEXT NOT NULL,
      scope      TEXT NOT NULL DEFAULT 'global',
      data       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
      namespace, data, content=records, content_rowid=rowid
    );
    CREATE TRIGGER IF NOT EXISTS records_ai AFTER INSERT ON records BEGIN
      INSERT INTO records_fts(rowid, namespace, data) VALUES (new.rowid, new.namespace, new.data);
    END;
    CREATE TRIGGER IF NOT EXISTS records_ad AFTER DELETE ON records BEGIN
      INSERT INTO records_fts(records_fts, rowid, namespace, data)
        VALUES('delete', old.rowid, old.namespace, old.data);
    END;
    CREATE TRIGGER IF NOT EXISTS records_au AFTER UPDATE ON records BEGIN
      INSERT INTO records_fts(records_fts, rowid, namespace, data)
        VALUES('delete', old.rowid, old.namespace, old.data);
      INSERT INTO records_fts(rowid, namespace, data) VALUES (new.rowid, new.namespace, new.data);
    END;
  `);
  return db;
}

function generateId() {
  const date = new Date().toISOString().slice(0, 10);
  const hex = randomBytes(3).toString('hex');
  return `${date}_${hex}`;
}

function toRecord(row) {
  return { ...row, data: JSON.parse(row.data) };
}

export function write({ namespace, data, id, scope = 'global' }) {
  const db = openDb();
  const now = new Date().toISOString();
  const recordId = id ?? generateId();
  const existing = db.prepare('SELECT id FROM records WHERE id = ?').get(recordId);
  if (existing) {
    db.prepare('UPDATE records SET data = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(data), now, recordId);
  } else {
    db.prepare(
      'INSERT INTO records (id, namespace, scope, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(recordId, namespace, scope, JSON.stringify(data), now, now);
  }
  return toRecord(db.prepare('SELECT * FROM records WHERE id = ?').get(recordId));
}

export function read({ namespace, id }) {
  const db = openDb();
  const row = db.prepare('SELECT * FROM records WHERE id = ? AND namespace = ?').get(id, namespace);
  return row ? toRecord(row) : null;
}

export function list({ namespace, scope, filter, since, before, limit = 50 }) {
  const db = openDb();
  const parts = ['SELECT * FROM records WHERE namespace = ?'];
  const params = [namespace];
  if (scope)  { parts.push('AND scope = ?');       params.push(scope); }
  if (since)  { parts.push('AND created_at >= ?'); params.push(since); }
  if (before) { parts.push('AND created_at < ?');  params.push(before); }
  parts.push('ORDER BY created_at DESC LIMIT ?');
  params.push(Math.min(limit, 500));
  let rows = db.prepare(parts.join(' ')).all(...params).map(toRecord);
  if (filter) {
    rows = rows.filter(r => Object.entries(filter).every(([k, v]) => r.data[k] === v));
  }
  return rows;
}

export function search({ query, namespace, scope, limit = 50 }) {
  const db = openDb();
  const parts = [
    'SELECT r.*, bm25(records_fts) as _score FROM records_fts',
    'JOIN records r ON r.rowid = records_fts.rowid',
    'WHERE records_fts MATCH ?',
  ];
  const params = [query];
  if (namespace) { parts.push('AND r.namespace = ?'); params.push(namespace); }
  if (scope)     { parts.push('AND r.scope = ?');     params.push(scope); }
  parts.push('ORDER BY _score LIMIT ?');
  params.push(Math.min(limit, 500));
  return db.prepare(parts.join(' ')).all(...params).map(r => {
    const { _score, ...rest } = r;
    return { ...toRecord(rest), _score };
  });
}

export function remove({ namespace, id }) {
  const db = openDb();
  const existing = db.prepare('SELECT id FROM records WHERE id = ? AND namespace = ?').get(id, namespace);
  if (!existing) return null;
  db.prepare('DELETE FROM records WHERE id = ? AND namespace = ?').run(id, namespace);
  return { deleted: id };
}

export function namespaces({ scope } = {}) {
  const db = openDb();
  const parts = [
    'SELECT namespace, COUNT(*) as count, MAX(updated_at) as last_updated FROM records',
  ];
  const params = [];
  if (scope) { parts.push('WHERE scope = ?'); params.push(scope); }
  parts.push('GROUP BY namespace ORDER BY last_updated DESC');
  return db.prepare(parts.join(' ')).all(...params);
}
