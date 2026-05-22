import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

process.env.ARCHIVIST_DB = join(import.meta.dirname, 'test.db');

const { write, read, list, search, remove, namespaces } = await import('../storage.js');

after(() => {
  const p = process.env.ARCHIVIST_DB;
  if (existsSync(p)) rmSync(p);
});

test('write creates a record with auto-generated id and metadata', () => {
  const result = write({ namespace: 'test', data: { title: 'hello' } });
  assert.ok(result.id.match(/^\d{4}-\d{2}-\d{2}_[0-9a-f]{6}$/));
  assert.equal(result.namespace, 'test');
  assert.equal(result.scope, 'global');
  assert.deepEqual(result.data, { title: 'hello' });
  assert.ok(result.created_at);
  assert.ok(result.updated_at);
});

test('write with explicit id uses that id', () => {
  const result = write({ namespace: 'test', data: { x: 1 }, id: 'explicit-id' });
  assert.equal(result.id, 'explicit-id');
});

test('write with existing id upserts the record', () => {
  write({ namespace: 'test', data: { v: 1 }, id: 'upsert-me' });
  const result = write({ namespace: 'test', data: { v: 2 }, id: 'upsert-me' });
  assert.equal(result.id, 'upsert-me');
  assert.deepEqual(result.data, { v: 2 });
});

test('read returns the record by id and namespace', () => {
  const written = write({ namespace: 'test', data: { key: 'val' } });
  const result = read({ namespace: 'test', id: written.id });
  assert.deepEqual(result.data, { key: 'val' });
});

test('read returns null for unknown id', () => {
  assert.equal(read({ namespace: 'test', id: 'nope' }), null);
});

test('list returns records newest first', () => {
  write({ namespace: 'listns', data: { n: 1 } });
  write({ namespace: 'listns', data: { n: 2 } });
  const results = list({ namespace: 'listns' });
  assert.ok(results.length >= 2);
  assert.ok(results[0].created_at >= results[1].created_at);
});

test('list filter matches on data fields', () => {
  write({ namespace: 'filtertest', data: { status: 'done' } });
  write({ namespace: 'filtertest', data: { status: 'pending' } });
  const results = list({ namespace: 'filtertest', filter: { status: 'done' } });
  assert.equal(results.length, 1);
  assert.equal(results[0].data.status, 'done');
});

test('search finds records by content', () => {
  write({ namespace: 'searchns', data: { content: 'the quick brown fox' } });
  write({ namespace: 'searchns', data: { content: 'nothing interesting here' } });
  const results = search({ query: 'quick brown', namespace: 'searchns' });
  assert.equal(results.length, 1);
  assert.ok(results[0].data.content.includes('quick'));
});

test('remove deletes a record and returns deleted id', () => {
  const written = write({ namespace: 'test', data: { tmp: true } });
  const result = remove({ namespace: 'test', id: written.id });
  assert.deepEqual(result, { deleted: written.id });
  assert.equal(read({ namespace: 'test', id: written.id }), null);
});

test('remove returns null for unknown id', () => {
  assert.equal(remove({ namespace: 'test', id: 'ghost' }), null);
});

test('namespaces returns all namespaces with counts and last_updated', () => {
  write({ namespace: 'ns-alpha', data: { x: 1 } });
  write({ namespace: 'ns-beta', data: { x: 1 } });
  const result = namespaces();
  const names = result.map(n => n.namespace);
  assert.ok(names.includes('ns-alpha'));
  assert.ok(names.includes('ns-beta'));
  result.forEach(n => {
    assert.ok(typeof n.count === 'number');
    assert.ok(n.last_updated);
  });
});
