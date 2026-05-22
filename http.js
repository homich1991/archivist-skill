import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import * as storage from './storage.js';

const UI_DIR = join(fileURLToPath(import.meta.url), '..', 'ui');
const RESOLVED_UI_DIR = resolve(UI_DIR);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('error', reject);
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('Invalid JSON')); }
    });
  });
}

function reply(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function serveStatic(res, filePath) {
  const mime = MIME[extname(filePath)] ?? 'text/plain';
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, { 'content-type': mime });
    res.end(content);
  } catch {
    reply(res, 404, { error: 'Not found' });
  }
}

function dbPath() {
  return process.env.ARCHIVIST_DB ?? join(homedir(), '.claude', 'storage', 'storage.db');
}

function parseLimit(raw, def = 50) {
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : def;
}

export function startHttpServer(port = 4242) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    res.setHeader('access-control-allow-origin', '*');

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type',
        });
        return res.end();
      }

      if (req.method === 'GET' && path === '/health') {
        const ns = storage.namespaces();
        const records = ns.reduce((sum, n) => sum + n.count, 0);
        return reply(res, 200, { status: 'ok', db: dbPath(), records });
      }

      if (req.method === 'GET' && path === '/api/namespaces') {
        const scope = url.searchParams.get('scope') ?? undefined;
        return reply(res, 200, storage.namespaces({ scope }));
      }

      if (req.method === 'GET' && path === '/api/search') {
        const query = url.searchParams.get('q');
        if (!query) return reply(res, 400, { error: 'q is required' });
        const namespace = url.searchParams.get('namespace') ?? undefined;
        const scope = url.searchParams.get('scope') ?? undefined;
        const limit = parseLimit(url.searchParams.get('limit'));
        return reply(res, 200, storage.search({ query, namespace, scope, limit }));
      }

      if (req.method === 'GET' && path === '/api/records') {
        const namespace = url.searchParams.get('namespace');
        if (!namespace) return reply(res, 400, { error: 'namespace is required' });
        const scope = url.searchParams.get('scope') ?? undefined;
        const since = url.searchParams.get('since') ?? undefined;
        const before = url.searchParams.get('before') ?? undefined;
        const limit = parseLimit(url.searchParams.get('limit'));
        return reply(res, 200, storage.list({ namespace, scope, since, before, limit }));
      }

      if (req.method === 'POST' && path === '/api/records') {
        const { namespace, data, id, scope } = await parseBody(req);
        if (!namespace || !data) return reply(res, 400, { error: 'namespace and data are required' });
        return reply(res, 201, storage.write({ namespace, data, id, scope }));
      }

      const recordPath = path.match(/^\/api\/records\/([^/]+)$/);
      if (recordPath) {
        const id = recordPath[1];
        const namespace = url.searchParams.get('namespace');
        if (!namespace) return reply(res, 400, { error: 'namespace is required' });

        if (req.method === 'GET') {
          const record = storage.read({ namespace, id });
          return record ? reply(res, 200, record) : reply(res, 404, { error: 'Not found' });
        }
        if (req.method === 'DELETE') {
          const result = storage.remove({ namespace, id });
          return result ? reply(res, 200, result) : reply(res, 404, { error: 'Not found' });
        }
      }

      if (req.method === 'GET') {
        const filePath = path === '/'
          ? join(RESOLVED_UI_DIR, 'index.html')
          : join(RESOLVED_UI_DIR, path);
        const resolved = resolve(filePath);
        if (!resolved.startsWith(RESOLVED_UI_DIR + '/') && resolved !== resolve(join(RESOLVED_UI_DIR, 'index.html'))) {
          return reply(res, 403, { error: 'Forbidden' });
        }
        return serveStatic(res, filePath);
      }

      reply(res, 404, { error: 'Not found' });
    } catch (err) {
      if (!res.headersSent) reply(res, 500, { error: err.message, code: 'IO_ERROR' });
    }
  });

  return new Promise(resolve => server.listen(port, () => resolve(server)));
}
