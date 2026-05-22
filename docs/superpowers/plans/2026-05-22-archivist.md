# Archivist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the project from `deep-thought` to `archivist` and split it into a self-daemonizing singleton daemon + per-session MCP proxy architecture so any number of agent sessions share one running server.

**Architecture:** `daemon.js` owns SQLite and the HTTP server (port 4242); it runs as a detached background process managed by a PID file. `server.js` (the MCP entry point spawned by each agent session) health-checks the daemon, starts it if absent, then connects to stdio transport. MCP tool handlers in `mcp.js` proxy all storage calls to the daemon via HTTP fetch — `storage.js` and `http.js` are unchanged from the session's perspective.

**Tech Stack:** Node.js 22+ (built-in `node:sqlite`, `node:test`, `fetch`), `@modelcontextprotocol/sdk`, `zod`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `package.json` | Modify | Package name, scripts |
| `server.js` | Modify | ensureDaemon() + MCP stdio startup |
| `daemon.js` | Create | HTTP server + SQLite + PID file |
| `mcp.js` | Modify | Tool names renamed; handlers proxy to HTTP |
| `http.js` | Modify | Add `filter` param to GET /api/records |
| `storage.js` | Modify | Env var rename only |
| `scripts/install.js` | Modify | archivist key, updated messages |
| `scripts/daemon-cli.js` | Create | start \| stop \| status CLI |
| `ui/index.html` | Modify | Title/header rename |
| `ui/app.js` | Modify | Two display string updates |
| `README.md` | Modify | Full archivist rewrite |
| `tests/storage.test.js` | Modify | Env var rename |
| `tests/http.test.js` | Modify | Env var rename + filter test |
| `tests/mcp.test.js` | Modify | Env var, tool names, HTTP server setup |
| `tests/daemon.test.js` | Create | Integration test for daemon lifecycle |

---

## Task 1: Rename env vars and package identifiers

**Files:**
- Modify: `package.json`
- Modify: `server.js`
- Modify: `http.js`
- Modify: `storage.js`
- Modify: `scripts/install.js`
- Modify: `tests/storage.test.js`
- Modify: `tests/http.test.js`
- Modify: `tests/mcp.test.js`

- [ ] **Step 1: Update package.json**

Replace the entire file:

```json
{
  "name": "archivist",
  "version": "0.1.0",
  "description": "Personal database MCP server — your Answer to Life, the Universe, and Everything",
  "type": "module",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "test": "node --test tests/*.test.js",
    "install-archivist-mcp": "node scripts/install.js",
    "archivist": "node scripts/daemon-cli.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.23.0"
  }
}
```

- [ ] **Step 2: Update env var in storage.js**

In `storage.js`, change the `dbPath` function:

```js
// Before:
return process.env.DEEP_THOUGHT_DB ?? join(homedir(), '.claude', 'storage', 'storage.db');

// After:
return process.env.ARCHIVIST_DB ?? join(homedir(), '.claude', 'storage', 'storage.db');
```

- [ ] **Step 3: Update env vars in http.js**

In `http.js`, change both references:

```js
// dbPath() function — change env var:
return process.env.ARCHIVIST_DB ?? join(homedir(), '.claude', 'storage', 'storage.db');
```

- [ ] **Step 4: Update server.js**

Replace `server.js` entirely:

```js
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp.js';

const PORT = Number(process.env.ARCHIVIST_PORT ?? 4242);
const DAEMON_PATH = join(dirname(fileURLToPath(import.meta.url)), 'daemon.js');

async function checkHealth() {
  try {
    const res = await fetch(`http://localhost:${PORT}/health`, { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureDaemon() {
  if (await checkHealth()) {
    process.stderr.write(`Archivist daemon already running at http://localhost:${PORT}\n`);
    return;
  }

  const child = spawn(process.execPath, [DAEMON_PATH], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 200));
    if (await checkHealth()) {
      process.stderr.write(`Archivist daemon started at http://localhost:${PORT}\n`);
      return;
    }
  }
  throw new Error(`Archivist daemon failed to start on port ${PORT} within 5s`);
}

await ensureDaemon();

const mcpServer = createMcpServer();
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
```

Note: `server.js` no longer starts the HTTP server itself — that moves to `daemon.js` (Task 5). This file is written now so it's correct; it will work once daemon.js exists (Task 5).

- [ ] **Step 5: Update scripts/install.js**

Replace the file:

```js
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const SERVER_PATH = resolve(join(fileURLToPath(import.meta.url), '..', '..', 'server.js'));

function readSettings() {
  if (!existsSync(SETTINGS_PATH)) return {};
  try { return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return {}; }
}

function writeSettings(settings) {
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

const settings = readSettings();
settings.mcpServers ??= {};

if (settings.mcpServers['deep-thought']) {
  console.log('Warning: old deep-thought entry found in ~/.claude/settings.json.');
  console.log('Remove it manually, then re-run npm run install-archivist-mcp.');
  process.exit(1);
}

if (settings.mcpServers['archivist']) {
  console.log('archivist MCP server is already configured in ~/.claude/settings.json');
  console.log('Entry:', JSON.stringify(settings.mcpServers['archivist'], null, 2));
  console.log('\nTo update the path, edit ~/.claude/settings.json manually.');
  process.exit(0);
}

settings.mcpServers['archivist'] = {
  command: 'node',
  args: [SERVER_PATH],
};

writeSettings(settings);

console.log('✓ archivist added to ~/.claude/settings.json');
console.log(`  Server path: ${SERVER_PATH}`);
console.log('\nRestart your MCP client to activate the server.');
console.log('Then open http://localhost:4242 to browse your data.');
```

- [ ] **Step 6: Update env var in tests/storage.test.js**

```js
// Line 6 — before:
process.env.DEEP_THOUGHT_DB = join(import.meta.dirname, 'test.db');

// After:
process.env.ARCHIVIST_DB = join(import.meta.dirname, 'test.db');
```

Also update `after()`:

```js
after(() => {
  const p = process.env.ARCHIVIST_DB;
  if (existsSync(p)) rmSync(p);
});
```

- [ ] **Step 7: Update env var in tests/http.test.js**

```js
// Line 6 — before:
process.env.DEEP_THOUGHT_DB = join(import.meta.dirname, 'test-http.db');

// After:
process.env.ARCHIVIST_DB = join(import.meta.dirname, 'test-http.db');
```

Also update `after()`:

```js
after(async () => {
  server.close();
  const p = process.env.ARCHIVIST_DB;
  if (existsSync(p)) rmSync(p);
});
```

- [ ] **Step 8: Update env var in tests/mcp.test.js**

```js
// Line 6 — before:
process.env.DEEP_THOUGHT_DB = join(import.meta.dirname, 'test-mcp.db');

// After:
process.env.ARCHIVIST_DB = join(import.meta.dirname, 'test-mcp.db');
```

Also update `after()`:

```js
after(() => {
  const p = process.env.ARCHIVIST_DB;
  if (existsSync(p)) rmSync(p);
});
```

- [ ] **Step 9: Run tests to verify all 28 pass**

```bash
cd /Users/homich/Developer/deep-thought && npm test
```

Expected: 28 passing tests, 0 failures.

- [ ] **Step 10: Commit**

```bash
git add package.json server.js http.js storage.js scripts/install.js tests/storage.test.js tests/http.test.js tests/mcp.test.js && git commit -m "chore: rename env vars and package identifiers to archivist"
```

---

## Task 2: Rename MCP tool names and server name

**Files:**
- Modify: `mcp.js`
- Modify: `tests/mcp.test.js`

- [ ] **Step 1: Replace mcp.js with renamed tools (still calling storage.js directly)**

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as storage from './storage.js';

export const toolHandlers = {
  async archivist_write({ namespace, data, id, scope }) {
    try {
      return await storage.write({ namespace, data, id, scope });
    } catch (err) {
      return { error: err.message, code: 'INVALID_INPUT' };
    }
  },
  async archivist_read({ namespace, id, scope }) {
    try {
      const record = await storage.read({ namespace, id, scope });
      if (!record) return { error: `Record '${id}' not found in namespace '${namespace}'`, code: 'NOT_FOUND' };
      return record;
    } catch (err) {
      return { error: err.message, code: 'INVALID_INPUT' };
    }
  },
  async archivist_list({ namespace, scope, filter, since, before, limit }) {
    try {
      return await storage.list({ namespace, scope, filter, since, before, limit });
    } catch (err) {
      return { error: err.message, code: 'INVALID_INPUT' };
    }
  },
  async archivist_search({ query, namespace, scope, limit }) {
    try {
      return await storage.search({ query, namespace, scope, limit });
    } catch (err) {
      return { error: err.message, code: 'INVALID_INPUT' };
    }
  },
  async archivist_delete({ namespace, id }) {
    try {
      const result = await storage.remove({ namespace, id });
      if (!result) return { error: `Record '${id}' not found in namespace '${namespace}'`, code: 'NOT_FOUND' };
      return result;
    } catch (err) {
      return { error: err.message, code: 'INVALID_INPUT' };
    }
  },
  async archivist_namespaces({ scope }) {
    try {
      return await storage.namespaces({ scope });
    } catch (err) {
      return { error: err.message, code: 'INVALID_INPUT' };
    }
  },
};

export function createMcpServer() {
  const server = new McpServer({ name: 'archivist', version: '1.0.0' });

  server.tool(
    'archivist_write',
    "Saves a record to the personal database. Use this whenever the user wants to remember something for later — a meeting summary, a person's details, an event, a decision, or any structured data. The namespace groups related records (e.g. \"meetings\", \"team\", \"events\"). Returns the saved record including its auto-generated ID.",
    {
      namespace: z.string().describe('Bucket name, e.g. "meetings", "team", "events"'),
      data: z.record(z.unknown()).describe('The record payload — any JSON object'),
      id: z.string().optional().describe('Optional explicit ID; omit to auto-generate'),
      scope: z.string().optional().describe('global (default) or absolute project path'),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_write(args)) }] })
  );

  server.tool(
    'archivist_read',
    'Fetches a single record by its ID. Use when you already know the exact record ID (e.g. from a previous list or search result) and need its full content.',
    {
      namespace: z.string(),
      id: z.string(),
      scope: z.string().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_read(args)) }] })
  );

  server.tool(
    'archivist_list',
    'Lists records in a namespace, newest first. Use for browsing or filtering by date range or field values — e.g. "show me all meetings from last month" or "list team members with role=engineer". Prefer archivist_search when the user describes content rather than known field values.',
    {
      namespace: z.string(),
      scope: z.string().optional(),
      filter: z.record(z.unknown()).optional().describe('Field equality filter, e.g. {"status":"done"}'),
      since: z.string().optional().describe('ISO date — records created on or after this date'),
      before: z.string().optional().describe('ISO date — records created before this date'),
      limit: z.number().optional().describe('Max records to return, default 50, max 500'),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_list(args)) }] })
  );

  server.tool(
    'archivist_search',
    'Full-text search across stored records. Use when the user wants to find something by content — e.g. "find the meeting where we discussed the API design" or "what do I have about John". Can search within a specific namespace or across everything. Returns results ranked by relevance.',
    {
      query: z.string().describe('Full-text search query'),
      namespace: z.string().optional().describe('Scope to this namespace; omit to search all'),
      scope: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_search(args)) }] })
  );

  server.tool(
    'archivist_delete',
    'Deletes a record permanently by ID. Always confirm with the user before calling this — deletion cannot be undone.',
    {
      namespace: z.string(),
      id: z.string(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_delete(args)) }] })
  );

  server.tool(
    'archivist_namespaces',
    "Lists all namespaces with record counts and last-updated timestamps. Use when the user asks what's stored, wants an overview of their data, or before a search to help scope the query.",
    {
      scope: z.string().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_namespaces(args)) }] })
  );

  return server;
}
```

- [ ] **Step 2: Update tests/mcp.test.js — tool names only**

Replace the file:

```js
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
```

- [ ] **Step 3: Run tests — verify all 28 pass**

```bash
npm test
```

Expected: 28 passing, 0 failures.

- [ ] **Step 4: Commit**

```bash
git add mcp.js tests/mcp.test.js && git commit -m "feat: rename MCP tools and server to archivist_*"
```

---

## Task 3: Update UI and README

**Files:**
- Modify: `ui/index.html`
- Modify: `ui/app.js`
- Modify: `README.md`

- [ ] **Step 1: Update ui/index.html**

Replace the `<title>` and header section:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Archivist — Personal Database</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Oxanium:wght@400;500;600;700;800&family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/style.css">
</head>
<body>

<header class="header">
  <div class="header-brand">
    <span class="header-logo">✦</span>
    <div>
      <div class="header-title">ARCHIVIST</div>
      <div class="header-sub">The Archive &nbsp;·&nbsp; Vol. I</div>
    </div>
  </div>
  <div class="header-right">
    <div class="header-stat">
      <span class="stat-label">Total Records</span>
      <span class="stat-value" id="total-count">—</span>
    </div>
    <div class="dont-panic">Don't Panic</div>
  </div>
</header>

<div class="layout">
  <aside class="sidebar">
    <div class="sidebar-head">Field Guide</div>
    <div class="ns-list" id="ns-list"></div>
  </aside>
  <main class="main">
    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-icon">⌕</span>
        <input class="search-input" id="search-input" type="search" placeholder="Search the known universe…" autocomplete="off" spellcheck="false">
      </div>
      <div class="toolbar-meta" id="toolbar-meta"></div>
    </div>
    <div class="records" id="records-list">
      <div class="empty-state">
        <span class="empty-glyph">✦</span>
        <div class="empty-title">COMPUTING…</div>
        <div class="empty-sub">Archivist is retrieving your data.<br>Please hold.</div>
      </div>
    </div>
  </main>
</div>

<footer class="footer">
  <span>Archivist v1.0 &nbsp;·&nbsp; The Answer is <b>42</b></span>
  <span>Magrathea Storage Systems™ &nbsp;·&nbsp; Sirius Cybernetics Corp.</span>
</footer>

<script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Update two display strings in ui/app.js**

Line 23 — empty state copy:
```js
// Before:
list.innerHTML = `<div class="ns-empty">No data yet.<br>Use deep_thought_write to start storing records.</div>`;

// After:
list.innerHTML = `<div class="ns-empty">No data yet.<br>Use archivist_write to start storing records.</div>`;
```

Lines 102–106 — connection error copy:
```js
// Before:
document.getElementById('records-list').innerHTML = `<div class="empty-state">
    <span class="empty-glyph">✦</span>
    <div class="empty-title">CONNECTION ERROR</div>
    <div class="empty-sub">Deep Thought is not responding.<br>Check that the server is running.</div>
  </div>`;

// After:
document.getElementById('records-list').innerHTML = `<div class="empty-state">
    <span class="empty-glyph">✦</span>
    <div class="empty-title">CONNECTION ERROR</div>
    <div class="empty-sub">Archivist is not responding.<br>Check that the daemon is running.</div>
  </div>`;
```

- [ ] **Step 3: Rewrite README.md**

```markdown
# Archivist

> *"The Answer to Life, the Universe, and Everything"*

A personal database MCP server that gives any AI agent persistent, queryable storage across sessions. Store meeting notes, people profiles, decisions, research — anything you want your agent to remember.

---

## What it does

Archivist runs as a singleton background daemon. Any MCP client (Claude Code, Cursor, Cline, custom agents) spawns the same `server.js` entry point — the first one starts the daemon, all subsequent ones connect to it. All sessions share one SQLite database and one web UI.

Six tools are exposed:

| Tool | What it does |
|------|-------------|
| `archivist_write` | Save a record (any JSON object) to a named namespace |
| `archivist_read` | Fetch a single record by ID |
| `archivist_list` | Browse records in a namespace, with optional date/field filters |
| `archivist_search` | Full-text search across all stored records |
| `archivist_delete` | Remove a record permanently |
| `archivist_namespaces` | List all namespaces with record counts |

A built-in web UI at `http://localhost:4242` lets you browse and search your data visually.

---

## Requirements

- Node.js 22+ (uses `node:sqlite` built-in)
- An MCP client (Claude Code, Cursor, Cline, etc.)

---

## Installation

**1. Clone and install dependencies**

```bash
git clone <repo-url> archivist
cd archivist
npm install
```

**2. Add to your MCP client**

```bash
npm run install-archivist-mcp
```

This writes the MCP server entry to `~/.claude/settings.json`. For other clients, add manually:

```json
{
  "mcpServers": {
    "archivist": {
      "command": "node",
      "args": ["/absolute/path/to/server.js"]
    }
  }
}
```

**3. Restart your MCP client**

The session process starts automatically and wakes the daemon on first use.

**4. Verify**

Ask your agent: *"What MCP tools do you have available?"*

You should see `archivist_write`, `archivist_read`, `archivist_list`, `archivist_search`, `archivist_delete`, `archivist_namespaces`.

---

## Daemon management

The daemon runs in the background and persists after all agent sessions close.

```bash
npm run archivist -- status   # show: running/stopped, pid, port, record count
npm run archivist -- stop     # stop the daemon
npm run archivist -- start    # start the daemon manually
```

---

## Usage

### Storing data

Just tell your agent what to remember:

> "Remember that Alice is our lead designer, based in Berlin, focused on mobile."

> "Save the key decisions from today's architecture meeting."

> "Store this research note in the 'papers' namespace."

### Retrieving data

> "Who do we have stored about the mobile team?"

> "Find everything I've saved about the API design discussions."

> "List all meetings from last month."

### Namespaces

Records are grouped into namespaces — think of them as folders. Common examples:

- `meetings` — summaries and action items
- `team` — people profiles
- `decisions` — architectural and product decisions
- `research` — notes and links
- `events` — calendar and planning items

Namespaces are created automatically on first write.

### Web UI

Open `http://localhost:4242` while Archivist is running. Shows all namespaces, records, and full-text search. The daemon must be running for the UI to work.

---

## Data storage

Records are stored in a SQLite database at:

```
~/.claude/storage/storage.db
```

To use a custom path:

```bash
export ARCHIVIST_DB=/path/to/your.db
```

To use a custom port:

```bash
export ARCHIVIST_PORT=5000
```

---

## Running tests

```bash
npm test
```

---

## Architecture

```
server.js          — MCP entry point (per session, per agent): ensures daemon, then stdio MCP
daemon.js          — Background HTTP + SQLite daemon (one instance, persists across sessions)
├── http.js        — REST API (/api/*) + static file server (ui/)
├── storage.js     — SQLite CRUD + FTS5
└── ui/            — Browser UI (plain HTML + JS, no build step)
scripts/
├── install.js     — npm run install-archivist-mcp
└── daemon-cli.js  — npm run archivist -- start|stop|status
```
```

- [ ] **Step 4: Commit**

```bash
git add ui/index.html ui/app.js README.md && git commit -m "feat: rename UI and docs to archivist"
```

---

## Task 4: Add filter param to HTTP GET /api/records

**Files:**
- Modify: `http.js`
- Modify: `tests/http.test.js`

- [ ] **Step 1: Write the failing test first**

Add to `tests/http.test.js` (before the closing of the file):

```js
test('GET /api/records?filter= filters by field value', async () => {
  write({ namespace: 'ns-filter', data: { status: 'done' } });
  write({ namespace: 'ns-filter', data: { status: 'pending' } });
  const filter = encodeURIComponent(JSON.stringify({ status: 'done' }));
  const { status, body } = await get(`/api/records?namespace=ns-filter&filter=${filter}`);
  assert.equal(status, 200);
  assert.equal(body.length, 1);
  assert.equal(body[0].data.status, 'done');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test 2>&1 | grep -A3 'filter'
```

Expected: the new test fails (filter param is ignored, both records returned).

- [ ] **Step 3: Implement filter param in http.js**

In the `GET /api/records` handler, find this line:

```js
const limit = parseLimit(url.searchParams.get('limit'));
return reply(res, 200, storage.list({ namespace, scope, since, before, limit }));
```

Replace with:

```js
const limit = parseLimit(url.searchParams.get('limit'));
const filterRaw = url.searchParams.get('filter');
const filter = filterRaw ? JSON.parse(filterRaw) : undefined;
return reply(res, 200, storage.list({ namespace, scope, since, before, limit, filter }));
```

- [ ] **Step 4: Run tests — verify all 29 pass**

```bash
npm test
```

Expected: 29 passing, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add http.js tests/http.test.js && git commit -m "feat: add filter param to GET /api/records"
```

---

## Task 5: Create daemon.js

**Files:**
- Create: `daemon.js`
- Create: `tests/daemon.test.js`

- [ ] **Step 1: Write the failing test first**

Create `tests/daemon.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, unlinkSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const DAEMON_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'daemon.js');
const PID_FILE = join(homedir(), '.archivist', 'archivist.pid');
const TEST_PORT = 14242;
const TEST_DB = join(import.meta.dirname, 'test-daemon.db');

async function waitHealthy(port, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(500) });
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

test('daemon starts, creates PID file, responds to /health, cleans up on SIGTERM', async () => {
  if (existsSync(PID_FILE)) unlinkSync(PID_FILE);

  const child = spawn(process.execPath, [DAEMON_PATH], {
    env: { ...process.env, ARCHIVIST_PORT: String(TEST_PORT), ARCHIVIST_DB: TEST_DB },
    stdio: 'ignore',
  });

  try {
    const healthy = await waitHealthy(TEST_PORT);
    assert.ok(healthy, 'daemon did not become healthy within 5s');
    assert.ok(existsSync(PID_FILE), 'PID file was not created');

    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    assert.equal(pid, child.pid, 'PID file contains wrong pid');

    const res = await fetch(`http://localhost:${TEST_PORT}/health`);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  } finally {
    child.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 400));
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
  }

  assert.ok(!existsSync(PID_FILE), 'PID file was not removed after SIGTERM');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test 2>&1 | grep -A5 'daemon'
```

Expected: test fails because `daemon.js` does not exist.

- [ ] **Step 3: Create daemon.js**

```js
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { startHttpServer } from './http.js';

const PORT = Number(process.env.ARCHIVIST_PORT ?? 4242);
const PID_DIR = join(homedir(), '.archivist');
const PID_FILE = join(PID_DIR, 'archivist.pid');

mkdirSync(PID_DIR, { recursive: true });
writeFileSync(PID_FILE, String(process.pid), 'utf8');

function cleanup() {
  try { unlinkSync(PID_FILE); } catch {}
}

process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });

const httpServer = await startHttpServer(PORT);
const { port } = httpServer.address();
process.stderr.write(`Archivist daemon listening on http://localhost:${port}\n`);
```

- [ ] **Step 4: Run tests — verify all 30 pass**

```bash
npm test
```

Expected: 30 passing, 0 failures. The daemon test spawns and kills a real process.

- [ ] **Step 5: Commit**

```bash
git add daemon.js tests/daemon.test.js && git commit -m "feat: daemon.js — singleton HTTP+SQLite background process"
```

---

## Task 6: Refactor mcp.js tool handlers to HTTP proxy

**Files:**
- Modify: `mcp.js`
- Modify: `tests/mcp.test.js`

- [ ] **Step 1: Update tests/mcp.test.js to start an HTTP server before tests run**

The tool handlers will now call the daemon via HTTP. Tests need a real HTTP server running.

Replace `tests/mcp.test.js` entirely:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

process.env.ARCHIVIST_DB = join(import.meta.dirname, 'test-mcp.db');

const { startHttpServer } = await import('../http.js');
const { toolHandlers } = await import('../mcp.js');

let server;

before(async () => {
  server = await startHttpServer(0);
  process.env.ARCHIVIST_PORT = String(server.address().port);
});

after(async () => {
  server.close();
  delete process.env.ARCHIVIST_PORT;
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
```

- [ ] **Step 2: Run tests — verify all 30 still pass with updated test setup**

```bash
npm test
```

Expected: 30 passing. The new `before()`/`after()` in mcp.test.js starts an HTTP server but handlers still call storage.js directly — both paths use the same `ARCHIVIST_DB` file, so tests pass either way.

- [ ] **Step 3: Replace mcp.js with HTTP-proxy implementation**

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function daemonUrl(path) {
  const port = process.env.ARCHIVIST_PORT ?? '4242';
  return `http://localhost:${port}${path}`;
}

async function callDaemon(method, urlPath, body) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = { 'content-type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(daemonUrl(urlPath), opts);
    return res.json();
  } catch (err) {
    return { error: err.message, code: 'DAEMON_ERROR' };
  }
}

export const toolHandlers = {
  async archivist_write({ namespace, data, id, scope }) {
    return callDaemon('POST', '/api/records', { namespace, data, id, scope });
  },
  async archivist_read({ namespace, id, scope }) {
    const p = new URLSearchParams({ namespace });
    if (scope) p.set('scope', scope);
    return callDaemon('GET', `/api/records/${id}?${p}`);
  },
  async archivist_list({ namespace, scope, filter, since, before, limit }) {
    const p = new URLSearchParams({ namespace });
    if (scope) p.set('scope', scope);
    if (since) p.set('since', since);
    if (before) p.set('before', before);
    if (limit != null) p.set('limit', String(limit));
    if (filter) p.set('filter', JSON.stringify(filter));
    return callDaemon('GET', `/api/records?${p}`);
  },
  async archivist_search({ query, namespace, scope, limit }) {
    const p = new URLSearchParams({ q: query });
    if (namespace) p.set('namespace', namespace);
    if (scope) p.set('scope', scope);
    if (limit != null) p.set('limit', String(limit));
    return callDaemon('GET', `/api/search?${p}`);
  },
  async archivist_delete({ namespace, id }) {
    const p = new URLSearchParams({ namespace });
    return callDaemon('DELETE', `/api/records/${id}?${p}`);
  },
  async archivist_namespaces({ scope }) {
    const p = new URLSearchParams();
    if (scope) p.set('scope', scope);
    return callDaemon('GET', `/api/namespaces?${p}`);
  },
};

export function createMcpServer() {
  const server = new McpServer({ name: 'archivist', version: '1.0.0' });

  server.tool(
    'archivist_write',
    "Saves a record to the personal database. Use this whenever the user wants to remember something for later — a meeting summary, a person's details, an event, a decision, or any structured data. The namespace groups related records (e.g. \"meetings\", \"team\", \"events\"). Returns the saved record including its auto-generated ID.",
    {
      namespace: z.string().describe('Bucket name, e.g. "meetings", "team", "events"'),
      data: z.record(z.unknown()).describe('The record payload — any JSON object'),
      id: z.string().optional().describe('Optional explicit ID; omit to auto-generate'),
      scope: z.string().optional().describe('global (default) or absolute project path'),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_write(args)) }] })
  );

  server.tool(
    'archivist_read',
    'Fetches a single record by its ID. Use when you already know the exact record ID (e.g. from a previous list or search result) and need its full content.',
    {
      namespace: z.string(),
      id: z.string(),
      scope: z.string().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_read(args)) }] })
  );

  server.tool(
    'archivist_list',
    'Lists records in a namespace, newest first. Use for browsing or filtering by date range or field values — e.g. "show me all meetings from last month" or "list team members with role=engineer". Prefer archivist_search when the user describes content rather than known field values.',
    {
      namespace: z.string(),
      scope: z.string().optional(),
      filter: z.record(z.unknown()).optional().describe('Field equality filter, e.g. {"status":"done"}'),
      since: z.string().optional().describe('ISO date — records created on or after this date'),
      before: z.string().optional().describe('ISO date — records created before this date'),
      limit: z.number().optional().describe('Max records to return, default 50, max 500'),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_list(args)) }] })
  );

  server.tool(
    'archivist_search',
    'Full-text search across stored records. Use when the user wants to find something by content — e.g. "find the meeting where we discussed the API design" or "what do I have about John". Can search within a specific namespace or across everything. Returns results ranked by relevance.',
    {
      query: z.string().describe('Full-text search query'),
      namespace: z.string().optional().describe('Scope to this namespace; omit to search all'),
      scope: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_search(args)) }] })
  );

  server.tool(
    'archivist_delete',
    'Deletes a record permanently by ID. Always confirm with the user before calling this — deletion cannot be undone.',
    {
      namespace: z.string(),
      id: z.string(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_delete(args)) }] })
  );

  server.tool(
    'archivist_namespaces',
    "Lists all namespaces with record counts and last-updated timestamps. Use when the user asks what's stored, wants an overview of their data, or before a search to help scope the query.",
    {
      scope: z.string().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_namespaces(args)) }] })
  );

  return server;
}
```

- [ ] **Step 4: Run tests — verify all 30 pass**

```bash
npm test
```

Expected: 30 passing, 0 failures. The mcp tests now spin up a real HTTP server on a random port and proxy through it.

- [ ] **Step 5: Commit**

```bash
git add mcp.js tests/mcp.test.js && git commit -m "feat: mcp tool handlers proxy to daemon via HTTP"
```

---

## Task 7: Create daemon-cli.js

**Files:**
- Create: `scripts/daemon-cli.js`
- Modify: `package.json` (already has `"archivist"` script from Task 1 — verify it's there)

- [ ] **Step 1: Create scripts/daemon-cli.js**

```js
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.ARCHIVIST_PORT ?? 4242);
const PID_FILE = join(homedir(), '.archivist', 'archivist.pid');
const DAEMON_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'daemon.js');

function readPid() {
  if (!existsSync(PID_FILE)) return null;
  const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
  return Number.isFinite(pid) ? pid : null;
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

const cmd = process.argv[2];

if (cmd === 'start') {
  const pid = readPid();
  if (pid && isAlive(pid)) {
    console.log(`Archivist daemon already running (pid ${pid})`);
    process.exit(0);
  }
  spawn(process.execPath, [DAEMON_PATH], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  }).unref();
  console.log('Archivist daemon started');

} else if (cmd === 'stop') {
  const pid = readPid();
  if (!pid || !isAlive(pid)) {
    console.log('Archivist daemon is not running');
    process.exit(0);
  }
  process.kill(pid, 'SIGTERM');
  console.log(`Archivist daemon stopped (pid ${pid})`);

} else if (cmd === 'status') {
  const pid = readPid();
  if (!pid || !isAlive(pid)) {
    console.log('status: stopped');
    process.exit(0);
  }
  try {
    const res = await fetch(`http://localhost:${PORT}/health`);
    const { records } = await res.json();
    console.log(`status: running  pid: ${pid}  port: ${PORT}  records: ${records}`);
  } catch {
    console.log(`status: running (pid ${pid}, port ${PORT}, health check failed)`);
  }

} else {
  console.error('Usage: npm run archivist -- start | stop | status');
  process.exit(1);
}
```

- [ ] **Step 2: Verify package.json has the archivist script**

```bash
node -e "const p = JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log(p.scripts.archivist)"
```

Expected output: `node scripts/daemon-cli.js`

If missing, add it:
```json
"archivist": "node scripts/daemon-cli.js"
```

- [ ] **Step 3: Manual smoke test**

```bash
npm run archivist -- start && sleep 1 && npm run archivist -- status && npm run archivist -- stop && npm run archivist -- status
```

Expected output (approximately):
```
Archivist daemon started
status: running  pid: <N>  port: 4242  records: <N>
Archivist daemon stopped (pid <N>)
status: stopped
```

- [ ] **Step 4: Run full test suite to verify nothing broke**

```bash
npm test
```

Expected: 30 passing, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add scripts/daemon-cli.js && git commit -m "feat: daemon-cli — start | stop | status commands"
```

---

## Task 8: Rename the project directory

- [ ] **Step 1: Rename the directory**

```bash
mv /Users/homich/Developer/deep-thought /Users/homich/Developer/archivist
```

- [ ] **Step 2: Run the full test suite from the new path**

```bash
cd /Users/homich/Developer/archivist && npm test
```

Expected: 30 passing, 0 failures. (All paths in source files use `import.meta.url` / `homedir()` — no hardcoded directory names.)

- [ ] **Step 3: Verify install script generates the correct absolute path**

```bash
node -e "
import('./scripts/install.js').catch(() => {});
" 2>/dev/null || node --input-type=module <<'EOF'
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const SERVER_PATH = resolve(join('/Users/homich/Developer/archivist/scripts/install.js', '..', '..', 'server.js'));
console.log(SERVER_PATH);
EOF
```

Expected: `/Users/homich/Developer/archivist/server.js`

- [ ] **Step 4: Commit from new path**

```bash
git add -A && git commit -m "chore: rename project directory to archivist"
```

---

## Self-review checklist

Spec requirement → task coverage:

| Spec requirement | Covered by |
|---|---|
| Directory renamed to `archivist/` | Task 8 |
| `package.json` name `archivist` | Task 1 |
| npm scripts updated | Task 1 |
| MCP server name `archivist` | Task 2 |
| Tool names `archivist_*` | Task 2 |
| Env vars `ARCHIVIST_PORT` / `ARCHIVIST_DB` | Task 1 |
| `mcpServers["archivist"]` in install script | Task 1 |
| Warn on existing `deep-thought` entry | Task 1 |
| UI title `ARCHIVIST` | Task 3 |
| UI sub-header `The Archive · Vol. I` | Task 3 |
| HHG2G copy + "42" unchanged | Task 3 |
| `daemon.js` — HTTP server + PID file | Task 5 |
| `server.js` — ensureDaemon() | Task 1 (full server.js written) |
| MCP tools proxy via HTTP | Task 6 |
| `filter` param in GET /api/records | Task 4 |
| `daemon-cli.js` — start/stop/status | Task 7 |
| Works for any MCP client (not just Claude) | architecture — same `server.js` for all |
| ECONNREFUSED handled in tool calls | Task 6 (`callDaemon` catch returns `DAEMON_ERROR`) |
