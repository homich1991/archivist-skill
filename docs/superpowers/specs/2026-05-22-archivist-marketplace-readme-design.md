# Archivist — Marketplace Skill & README Design

**Date:** 2026-05-22
**Repo:** https://github.com/homich1991/archivist-skill

---

## Goal

1. Make Archivist installable via the Claude Code plugin marketplace (`/plugin marketplace add` + `/plugin install archivist`).
2. Rewrite the README to be the definitive reference for installation, the daemon, CLI commands, and architecture.

---

## 1. Marketplace Skill

### File

`skills/archivist/SKILL.md`

### Frontmatter

```yaml
name: archivist
description: >
  Archivist setup assistant — installs the Archivist MCP server and configures it for your
  MCP client. Triggers when the user says "install archivist", "set up archivist", or
  "configure archivist MCP".
```

### Behavior (interactive, option A)

When invoked, the skill walks through these steps in order:

1. **Environment check**
   - Run `node --version` and confirm Node.js 22+.
   - If below 22, tell the user to upgrade and stop.

2. **Choose install location**
   - Suggest `~/archivist` as default.
   - Ask user if they want a different path.

3. **Clone & install**
   - `git clone https://github.com/homich1991/archivist-skill <path>`
   - `cd <path> && npm install`

4. **Write MCP config**
   - Default target: `~/.claude/settings.json` (Claude Code).
   - Add `mcpServers.archivist` entry with absolute path to `server.js`.
   - If the file doesn't exist or the key is already set, handle gracefully (create / skip with note).

5. **Verify**
   - Run `node <path>/scripts/daemon-cli.js status`.
   - Report result to user.

6. **Done**
   - Tell user to restart their MCP client.
   - Remind them the web UI will be at `http://localhost:4242` once the daemon is running.

---

## 2. README Structure

Primary audience: developer who just found the repo and wants to get it running.

### Sections (in order)

#### What it does *(keep existing, minor polish)*
One-paragraph summary + tools table.

#### Install via Claude Code marketplace *(new — primary path)*
```
/plugin marketplace add https://github.com/homich1991/archivist-skill.git
/plugin install archivist
```
Then: follow the interactive setup skill.

#### Install manually *(existing — keep as fallback)*
Clone → `npm install` → write MCP config → restart client.

#### MCP Tools *(existing table, unchanged)*

#### Daemon *(expanded)*
- What it is: singleton HTTP+SQLite process, persists after all agent sessions close.
- Auto-start: the first `server.js` to run spawns the daemon if it isn't up; subsequent sessions just proxy to it via HTTP.
- PID file: `~/.claude/storage/archivist.pid`.
- The daemon keeps running when MCP sessions disconnect. Use the CLI to stop it.

#### CLI Commands *(new full reference)*

| Command | Description |
|---|---|
| `npm run archivist -- status` | Show running/stopped, PID, port, record count |
| `npm run archivist -- start` | Start daemon manually (no-op if already running) |
| `npm run archivist -- stop` | Graceful shutdown; removes PID file |

#### Web UI *(brief, unchanged)*

#### Configuration *(env vars, slight expansion)*

| Variable | Default | Description |
|---|---|---|
| `ARCHIVIST_DB` | `~/.claude/storage/storage.db` | SQLite database path |
| `ARCHIVIST_PORT` | `4242` | HTTP daemon port |

#### Data storage *(unchanged)*

#### Architecture *(existing diagram + prose)*
Prose to add: explain the two-process model — `server.js` is short-lived (one per MCP session), `daemon.js` is long-lived (one per machine). MCP tool calls hit `server.js` → HTTP → `daemon.js` → SQLite.

#### Running tests *(unchanged)*

---

## Out of scope

- Publishing to npm.
- Auth / multi-user.
- Any UI changes.
