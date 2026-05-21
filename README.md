# Deep Thought

> *"The Answer to Life, the Universe, and Everything"*

A personal database MCP server that gives Claude persistent, queryable storage across sessions. Store meeting notes, people profiles, decisions, research — anything you want Claude to remember.

---

## What it does

Deep Thought runs alongside Claude Code as an MCP server. It exposes six tools Claude can call to store and retrieve your data:

| Tool | What it does |
|------|-------------|
| `deep_thought_write` | Save a record (any JSON object) to a named namespace |
| `deep_thought_read` | Fetch a single record by ID |
| `deep_thought_list` | Browse records in a namespace, with optional date/field filters |
| `deep_thought_search` | Full-text search across all stored records |
| `deep_thought_delete` | Remove a record permanently |
| `deep_thought_namespaces` | List all namespaces with record counts |

A built-in web UI at `http://localhost:4242` lets you browse and search your data visually.

---

## Requirements

- Node.js 22+ (uses `node:sqlite` built-in)
- Claude Code (Claude's CLI)

---

## Installation

**1. Clone and install dependencies**

```bash
git clone <repo-url> deep-thought
cd deep-thought
npm install
```

**2. Add to Claude Code**

```bash
npm run install-deep-thought-mcp
```

This writes the MCP server entry to `~/.claude/settings.json`. Output:

```
✓ deep-thought added to ~/.claude/settings.json
  Server path: /absolute/path/to/server.js

Restart Claude Code to activate the MCP server.
Then open http://localhost:4242 to browse your data.
```

**3. Restart Claude Code**

The MCP server starts automatically with Claude Code. On next launch you'll see:

```
Deep Thought web UI: http://localhost:4242
```

**4. Verify**

In Claude Code, ask:
> "What MCP tools do you have available?"

You should see `deep_thought_write`, `deep_thought_read`, `deep_thought_list`, `deep_thought_search`, `deep_thought_delete`, `deep_thought_namespaces`.

---

## Usage

### Storing data

Just tell Claude what to remember — it decides the structure:

> "Remember that Alice is our lead designer, she's based in Berlin and focuses on mobile."

> "Save the key decisions from today's architecture meeting."

> "Store this research note in the 'papers' namespace."

Claude calls `deep_thought_write` with an appropriate namespace and JSON payload.

### Retrieving data

> "Who do we have stored about the mobile team?"

> "Find everything I've saved about the API design discussions."

> "List all meetings from last month."

Claude uses `deep_thought_list` or `deep_thought_search` depending on whether you're browsing or searching by content.

### Namespaces

Records are grouped into namespaces — think of them as folders. Common examples:

- `meetings` — summaries and action items
- `team` — people profiles
- `decisions` — architectural and product decisions
- `research` — notes and links
- `events` — calendar and planning items

Namespaces are created automatically on first write.

### Web UI

Open `http://localhost:4242` while Deep Thought is running. The UI shows:

- **Left sidebar** — all namespaces with record counts
- **Main panel** — records in the selected namespace, newest first
- **Search bar** — full-text search across the current namespace

The server must be running (i.e. Claude Code must be open with the MCP server active) for the UI to work.

---

## Data storage

Records are stored in a SQLite database at:

```
~/.claude/storage/storage.db
```

Full-text search uses SQLite FTS5. Data persists across Claude Code sessions.

To use a custom database path, set the environment variable:

```bash
export DEEP_THOUGHT_DB=/path/to/your.db
```

---

## Running tests

```bash
npm test
```

28 tests covering the storage layer, MCP tool handlers, and HTTP endpoints.

---

## Architecture

```
server.js          — Entry point: starts MCP (stdio) + HTTP server on port 4242
├── mcp.js         — MCP server + tool definitions
├── http.js        — REST API (/api/*) + static file server (ui/)
├── storage.js     — SQLite CRUD + FTS5 (pure data layer)
└── ui/            — Browser UI (plain HTML + JS, no build step)
    ├── index.html
    ├── app.js
    └── style.css
```

The MCP server communicates over stdio (managed by Claude Code). The HTTP server runs on port 4242 and serves both the REST API and the web UI from the same process.
