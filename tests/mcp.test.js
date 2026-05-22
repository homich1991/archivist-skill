import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

process.env.ARCHIVIST_DB = join(import.meta.dirname, 'test-mcp.db');

const { toolHandlers } = await import('../mcp.js');

after(() => {
  const p = process.env.ARCHIVIST_DB;
  if (existsSync(p)) rmSync(p);
});

test('archivist_write stores and returns record', async () => {
  const result = await toolHandlers.archivist_write({ namespace: 'test', data: { title: 'notes' } });
  assert.ok(result.id);
  assert.deepEqual(result.data, { title: 'notes' });
});

test('archivist_read returns stored record', async () => {
  const written = await toolHandlers.archivist_write({ namespace: 'test', data: { key: 'val' } });
  const result = await toolHandlers.archivist_read({ namespace: 'test', id: written.id });
  assert.deepEqual(result.data, { key: 'val' });
});

test('archivist_read returns NOT_FOUND error for unknown id', async () => {
  const result = await toolHandlers.archivist_read({ namespace: 'test', id: 'nope' });
  assert.ok(result.error);
  assert.equal(result.code, 'NOT_FOUND');
});

test('archivist_list returns records array', async () => {
  await toolHandlers.archivist_write({ namespace: 'listns', data: { n: 1 } });
  await toolHandlers.archivist_write({ namespace: 'listns', data: { n: 2 } });
  const result = await toolHandlers.archivist_list({ namespace: 'listns' });
  assert.ok(Array.isArray(result));
  assert.ok(result.length >= 2);
});

test('archivist_search finds records by content', async () => {
  await toolHandlers.archivist_write({ namespace: 'sns', data: { body: 'blue elephant walks' } });
  await toolHandlers.archivist_write({ namespace: 'sns', data: { body: 'red cat runs' } });
  const result = await toolHandlers.archivist_search({ query: 'elephant', namespace: 'sns' });
  assert.equal(result.length, 1);
  assert.ok(result[0].data.body.includes('elephant'));
});

test('archivist_delete removes a record', async () => {
  const written = await toolHandlers.archivist_write({ namespace: 'test', data: { tmp: true } });
  const result = await toolHandlers.archivist_delete({ namespace: 'test', id: written.id });
  assert.deepEqual(result, { deleted: written.id });
});

test('archivist_delete returns NOT_FOUND for unknown id', async () => {
  const result = await toolHandlers.archivist_delete({ namespace: 'test', id: 'ghost' });
  assert.ok(result.error);
  assert.equal(result.code, 'NOT_FOUND');
});

test('archivist_namespaces returns namespace list with counts', async () => {
  await toolHandlers.archivist_write({ namespace: 'ns-check', data: { x: 1 } });
  const result = await toolHandlers.archivist_namespaces({});
  assert.ok(Array.isArray(result));
  assert.ok(result.some(n => n.namespace === 'ns-check'));
});
