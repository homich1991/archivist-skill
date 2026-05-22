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
