import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

process.env.ARCHIVIST_DB = join(import.meta.dirname, 'test-http.db');

const { startHttpServer } = await import('../http.js');
const { write } = await import('../storage.js');

let server;
let base;

before(async () => {
  server = await startHttpServer(0); // port 0 = OS picks a free port
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  server.close();
  const p = process.env.ARCHIVIST_DB;
  if (existsSync(p)) rmSync(p);
});

async function get(path) {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
}
async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
async function del(path) {
  const res = await fetch(`${base}${path}`, { method: 'DELETE' });
  return { status: res.status, body: await res.json() };
}

test('GET /health returns ok with record count', async () => {
  const { status, body } = await get('/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.ok(typeof body.records === 'number');
  assert.ok(body.db);
});

test('GET /api/namespaces returns array', async () => {
  write({ namespace: 'http-test', data: { x: 1 } });
  const { status, body } = await get('/api/namespaces');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.some(n => n.namespace === 'http-test'));
});

test('GET /api/records?namespace=X returns records array', async () => {
  write({ namespace: 'ns-list', data: { item: 1 } });
  const { status, body } = await get('/api/records?namespace=ns-list');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 1);
});

test('GET /api/records without namespace returns 400', async () => {
  const { status } = await get('/api/records');
  assert.equal(status, 400);
});

test('POST /api/records creates a record and returns 201', async () => {
  const { status, body } = await post('/api/records', { namespace: 'ns-create', data: { hello: 'world' } });
  assert.equal(status, 201);
  assert.ok(body.id);
  assert.deepEqual(body.data, { hello: 'world' });
});

test('GET /api/records/:id returns the record', async () => {
  const { body: created } = await post('/api/records', { namespace: 'ns-read', data: { val: 42 } });
  const { status, body } = await get(`/api/records/${created.id}?namespace=ns-read`);
  assert.equal(status, 200);
  assert.deepEqual(body.data, { val: 42 });
});

test('GET /api/records/:id returns 404 for unknown id', async () => {
  const { status } = await get('/api/records/unknown-id?namespace=ns-read');
  assert.equal(status, 404);
});

test('DELETE /api/records/:id deletes the record', async () => {
  const { body: created } = await post('/api/records', { namespace: 'ns-del', data: { tmp: true } });
  const { status, body } = await del(`/api/records/${created.id}?namespace=ns-del`);
  assert.equal(status, 200);
  assert.deepEqual(body, { deleted: created.id });
});

test('GET /api/search?q=X returns matching records', async () => {
  write({ namespace: 'ns-search', data: { content: 'purple unicorn gallops' } });
  const { status, body } = await get('/api/search?q=purple+unicorn&namespace=ns-search');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.some(r => r.data.content.includes('unicorn')));
});
