# Archivist — Design Spec

**Date**: 2026-05-22
**Status**: Approved

---

## Overview

Two changes to the `deep-thought` project:

1. **Rename** — project becomes `archivist` at every level (directory, package, MCP server name, tool names, env vars, UI title). HHG2G visual design and all "42" references stay unchanged.
2. **Singleton daemon** — the server becomes a self-daemonizing background process. Any MCP client (Claude Code, Cursor, Cline, custom agents) spawns the same `server.js` entry point; the first one wakes the daemon, all subsequent ones proxy to it. The daemon persists after all agent sessions close and stops only via explicit `archivist stop`.

---

## Part 1: Rename

### What changes

| Before | After |
|---|---|
| Directory: `deep-thought/` | `archivist/` |
| `package.json` `name` | `archivist` |
| `package.json` `description` | updated to "archivist" |
| npm script `install-deep-thought-mcp` | `install-archivist-mcp` |
| MCP server name: `deep-thought` | `archivist` |
| Tool prefix: `deep_thought_*` | `archivist_*` (6 tools) |
| Env var `DEEP_THOUGHT_PORT` | `ARCHIVIST_PORT` |
| Env var `DEEP_THOUGHT_DB` | `ARCHIVIST_DB` |
| `mcpServers["deep-thought"]` in settings | `mcpServers["archivist"]` |
| UI `<title>` and header: `DEEP THOUGHT` | `ARCHIVIST` |
| UI sub-header: `Personal Database · Vol. II` | `The Archive · Vol. II` |

### What stays the same

- All HHG2G copy: "Don't Panic", "Magrathea Storage Systems™", "Sirius Cybernetics Corp.", "Field Guide", "Search the known universe…"
- Footer: `The Answer is **42**`
- Visual design: fonts (Oxanium, Space Mono), colors, layout
- Default port: 4242
- Database path: `~/.claude/storage/storage.db` (env override becomes `ARCHIVIST_DB`)

---

## Part 2: Singleton Daemon Architecture

### Problem

Currently each MCP client session spawns a fresh `node server.js` process — its own HTTP server and its own SQLite connection. Multiple open sessions = port conflicts + multiple DB connections.

### Solution

Split into two process roles:

- **Daemon** (`daemon.js`): owns SQLite, runs the HTTP server. Runs as a detached background process. One instance ever.
- **Session process** (`server.js`): spawned per MCP client session. Handles stdio MCP transport, proxies all storage calls to the daemon via HTTP.

### File structure

```
archivist/
├── daemon.js          NEW  — background HTTP + SQLite process
├── server.js          MOD  — MCP stdio proxy (per session, per agent)
├── mcp.js             MOD  — tool handlers proxy to HTTP API
├── http.js            unchanged
├── storage.js         unchanged
└── scripts/
    ├── install.js     MOD  — updated for archivist, registers server.js as MCP
    └── daemon-cli.js  NEW  — start | stop | status CLI
```

### Daemon (`daemon.js`)

- Calls `startHttpServer(port)` from `http.js` — HTTP server + REST API + web UI + SQLite
- Writes its PID to `~/.archivist/archivist.pid`
- On SIGTERM: closes HTTP server cleanly and removes PID file
- Spawned with `{ detached: true, stdio: 'ignore' }` and `.unref()` so it outlives the parent

### Session process (`server.js`)

Startup sequence:
1. Read `ARCHIVIST_PORT` (default 4242)
2. `GET http://localhost:{port}/health` — if 200, daemon is running
3. If not running: spawn `daemon.js` detached, poll `/health` every 200ms up to 5s; throw if timeout
4. Log `Archivist daemon ready at http://localhost:{port}` to stderr
5. Create MCP server (`mcp.js`), connect to `StdioServerTransport`

Session process exits when the MCP client disconnects. Daemon keeps running.

### MCP tool → HTTP mapping

All tool handlers in `mcp.js` make HTTP calls to the daemon instead of calling `storage.js` directly.

| MCP tool | HTTP call |
|---|---|
| `archivist_write` | `POST /api/records` `{namespace, data, id, scope}` |
| `archivist_read` | `GET /api/records/:id?namespace=&scope=` |
| `archivist_list` | `GET /api/records?namespace=&scope=&since=&before=&limit=&filter=` |
| `archivist_search` | `GET /api/search?q=&namespace=&scope=&limit=` |
| `archivist_delete` | `DELETE /api/records/:id?namespace=` |
| `archivist_namespaces` | `GET /api/namespaces?scope=` |

The `filter` parameter (field equality filter, currently only in storage/MCP) must be added to `GET /api/records` in `http.js`.

### Daemon CLI (`scripts/daemon-cli.js`)

```
npm run archivist -- start    # spawn daemon if not running
npm run archivist -- stop     # SIGTERM to daemon PID
npm run archivist -- status   # show: running|stopped, pid, port, record count
```

Added as `"archivist": "node scripts/daemon-cli.js"` in `package.json` scripts.

### PID file location

`~/.archivist/archivist.pid` — directory created on first daemon start.

### Concurrency

The daemon is the sole SQLite writer. All MCP sessions and the web UI go through the daemon's HTTP API, so there is no direct SQLite access from multiple processes. SQLite WAL mode is not required but may be enabled as a simple improvement.

### Error cases

| Scenario | Behavior |
|---|---|
| Daemon fails to start within 5s | `server.js` exits with error message |
| Daemon dies mid-session | Each tool call catches `ECONNREFUSED`; on failure it re-runs the health-check + spawn sequence before returning an error to the MCP client |
| Two sessions start simultaneously | Both race to spawn daemon; second spawn is a no-op (daemon already up) |
| Port 4242 in use by unrelated process | Daemon startup fails with clear port-conflict error |

---

## Installation

`npm run install-archivist-mcp` writes to `~/.claude/settings.json`:

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

Works identically for any MCP client that supports `command`/`args` (Claude Code, Cursor, Cline, etc.) — just point their config at the same `server.js`.

If an existing `mcpServers["deep-thought"]` entry is found in the target settings file, the install script warns the user and skips writing — they must remove the old entry manually before re-running.

---

## Out of scope

- HTTP/SSE MCP transport (stdio remains, simpler for all clients)
- launchd / systemd service (daemon-cli covers manual lifecycle management)
- Multi-user or network-accessible daemon
- Data migration for existing `deep_thought_*` tool name references
