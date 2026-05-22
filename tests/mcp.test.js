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

test('deep_thought_write stores and returns record', async () => {
  const result = await toolHandlers.deep_thought_write({ namespace: 'test', data: { title: 'notes' } });
  assert.ok(result.id);
  assert.deepEqual(result.data, { title: 'notes' });
});

test('deep_thought_read returns stored record', async () => {
  const written = await toolHandlers.deep_thought_write({ namespace: 'test', data: { key: 'val' } });
  const result = await toolHandlers.deep_thought_read({ namespace: 'test', id: written.id });
  assert.deepEqual(result.data, { key: 'val' });
});

test('deep_thought_read returns NOT_FOUND error for unknown id', async () => {
  const result = await toolHandlers.deep_thought_read({ namespace: 'test', id: 'nope' });
  assert.ok(result.error);
  assert.equal(result.code, 'NOT_FOUND');
});

test('deep_thought_list returns records array', async () => {
  await toolHandlers.deep_thought_write({ namespace: 'listns', data: { n: 1 } });
  await toolHandlers.deep_thought_write({ namespace: 'listns', data: { n: 2 } });
  const result = await toolHandlers.deep_thought_list({ namespace: 'listns' });
  assert.ok(Array.isArray(result));
  assert.ok(result.length >= 2);
});

test('deep_thought_search finds records by content', async () => {
  await toolHandlers.deep_thought_write({ namespace: 'sns', data: { body: 'blue elephant walks' } });
  await toolHandlers.deep_thought_write({ namespace: 'sns', data: { body: 'red cat runs' } });
  const result = await toolHandlers.deep_thought_search({ query: 'elephant', namespace: 'sns' });
  assert.equal(result.length, 1);
  assert.ok(result[0].data.body.includes('elephant'));
});

test('deep_thought_delete removes a record', async () => {
  const written = await toolHandlers.deep_thought_write({ namespace: 'test', data: { tmp: true } });
  const result = await toolHandlers.deep_thought_delete({ namespace: 'test', id: written.id });
  assert.deepEqual(result, { deleted: written.id });
});

test('deep_thought_delete returns NOT_FOUND for unknown id', async () => {
  const result = await toolHandlers.deep_thought_delete({ namespace: 'test', id: 'ghost' });
  assert.ok(result.error);
  assert.equal(result.code, 'NOT_FOUND');
});

test('deep_thought_namespaces returns namespace list with counts', async () => {
  await toolHandlers.deep_thought_write({ namespace: 'ns-check', data: { x: 1 } });
  const result = await toolHandlers.deep_thought_namespaces({});
  assert.ok(Array.isArray(result));
  assert.ok(result.some(n => n.namespace === 'ns-check'));
});
