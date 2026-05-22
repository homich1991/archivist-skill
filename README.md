# Archivist

![Archivist](assets/banner.png)

> *"The Answer to Life, the Universe, and Everything"*

A personal database MCP server that gives any AI agent persistent, queryable storage across sessions. Store meeting notes, decisions, research — anything you want your agent to remember.

---

## Install — Claude Code

The fastest way to get started:

**1. Add this repo as a marketplace source**

In Claude Code, run:

```
/plugin marketplace add https://github.com/homich1991/archivist-skill.git
```

**2. Install the skill**

```
/plugin install archivist
```

**3. Run the setup skill**

Ask Claude: *"install archivist"* — it will verify Node.js 22+, clone the repo, run `npm install`, and write the MCP entry to `~/.claude/settings.json` for you.

**4. Restart Claude Code**

The MCP server activates on the next session start.

---

## Install — Other MCP clients

**1. Clone and install**

```bash
git clone https://github.com/homich1991/archivist-skill archivist
cd archivist
npm install
```

**2. Add to your client's MCP config**

```json
{
  "mcpServers": {
    "archivist": {
      "command": "node",
      "args": ["/absolute/path/to/archivist/server.js"]
    }
  }
}
```

Config file locations for common clients:

| Client | Config file |
|---|---|
| **Cursor** | `~/.cursor/mcp.json` |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` |
| **Cline** | VS Code settings → Cline → MCP Servers |
| **Continue** | `~/.continue/config.json` → `mcpServers` |
| **Other** | See your client's MCP documentation |

**3. Restart your MCP client**

---

## Requirements

- Node.js 22+ (uses `node:sqlite` built-in)
- An MCP client (Claude Code, Cursor, Cline, etc.)

---

## MCP Tools

Six tools are available to any connected agent:

| Tool | What it does |
|------|-------------|
| `archivist_write` | Save a record (any JSON object) to a named namespace |
| `archivist_read` | Fetch a single record by ID |
| `archivist_list` | Browse records in a namespace, with optional date/field filters |
| `archivist_search` | Full-text search across all stored records |
| `archivist_delete` | Remove a record permanently |
| `archivist_namespaces` | List all namespaces with record counts |

---

## Daemon

Archivist runs as a **singleton background daemon** — one process per machine, shared by all MCP sessions.

**Auto-start:** When an MCP session starts, `server.js` pings the daemon's health endpoint. If it doesn't respond within 1 second, `server.js` spawns `daemon.js` and waits up to 5 seconds for it to come up. Subsequent sessions skip the spawn and connect directly.

**Persistence:** The daemon keeps running after all MCP sessions disconnect. It stops only when you explicitly shut it down (see CLI Commands below) or the machine restarts.

**PID file:** `~/.archivist/archivist.pid` — created on start, removed on clean shutdown.

**Port:** Defaults to `4242`. Change with `ARCHIVIST_PORT` (see Configuration).

---

## CLI Commands

Run from your Archivist install directory:

```bash
npm run archivist -- status   # show running/stopped, PID, port, record count
npm run archivist -- start    # start the daemon (no-op if already running)
npm run archivist -- stop     # graceful shutdown, removes PID file
```

Possible outputs:

```
status: running  pid: 12345  port: 4242  records: 42   # daemon is up
status: stopped                                         # daemon is not running
status: running (pid 12345, port 4242, health check failed)  # up but not responding
```

---

## Web UI

Open **http://localhost:4242** while Archivist is running. Browse all namespaces, view records, and run full-text searches — no agent required.

---

## Usage

### Storing data

Tell your agent what to remember:

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

Namespaces are created automatically on first write.

---

## Configuration

| Variable | Default | Description |
|---|---|---|
| `ARCHIVIST_DB` | `~/.archivist/storage.db` | SQLite database path |
| `ARCHIVIST_PORT` | `4242` | HTTP daemon port |

Set these in your shell profile or prefix them to the start command:

```bash
ARCHIVIST_PORT=5000 npm run archivist -- start
```

---

## Architecture

```
server.js          — MCP entry point (per session, per agent): ensures daemon is up, then serves stdio MCP
daemon.js          — Background HTTP + SQLite process (one instance, persists across sessions)
├── http.js        — REST API (/api/*) + static file server (ui/)
├── storage.js     — SQLite CRUD + FTS5 full-text search
└── ui/            — Browser UI (plain HTML + JS, no build step)
scripts/
├── install.js     — npm run install-archivist-mcp
└── daemon-cli.js  — npm run archivist -- start|stop|status
skills/
└── archivist/     — Interactive setup skill (Claude Code marketplace)
```

**Two-process model:** `server.js` is short-lived — one instance per MCP session, exits when the session ends. `daemon.js` is long-lived — one instance per machine. All MCP tool calls flow through `server.js` → HTTP → `daemon.js` → SQLite. This means the database is always accessed through a single process, with no locking conflicts between concurrent agent sessions.

---

## Running tests

```bash
npm test
```
