---
name: archivist
description: >
  Archivist setup assistant — installs the Archivist MCP server and configures it in
  Claude Code settings. Use when the user says "install archivist", "set up archivist",
  "configure archivist MCP", or wants to get Archivist running.
---

# Archivist Setup

Walk the user through installing Archivist step by step. Complete each step before moving to the next.

---

## Step 1 — Check Node.js version

Run:

```bash
node --version
```

- If the version is **22 or higher**: proceed.
- If below 22: tell the user they need Node.js 22+ and stop. Link them to https://nodejs.org.

---

## Step 2 — Choose install location

Ask the user:

> "Where would you like to install Archivist? The default is `~/archivist`. Press Enter to accept or type a different path."

Use their answer as `<INSTALL_PATH>` in the steps below. If they press Enter or say nothing, use `~/archivist`.

---

## Step 3 — Clone and install

Run these commands (substitute the actual install path — expand `~` to the full home directory):

```bash
git clone https://github.com/homich1991/archivist-skill <INSTALL_PATH>
cd <INSTALL_PATH>
npm install
```

If `git clone` fails because the directory already exists, tell the user and ask whether to remove it and retry, or pick a different path.

---

## Step 4 — Write MCP config

Read `~/.claude/settings.json`. If it doesn't exist, treat it as `{}`.

Add or update the `mcpServers.archivist` key with the absolute install path:

```json
{
  "mcpServers": {
    "archivist": {
      "command": "node",
      "args": ["<ABSOLUTE_INSTALL_PATH>/server.js"]
    }
  }
}
```

Preserve all existing keys. Write the result back to `~/.claude/settings.json`.

If `mcpServers.archivist` was already present, tell the user it was updated to the new path.

---

## Step 5 — Verify

Run:

```bash
node <ABSOLUTE_INSTALL_PATH>/scripts/daemon-cli.js status
```

- If the output contains `status: running`: tell the user the daemon is already up.
- If the output contains `status: stopped`: that's expected before the first MCP session — nothing to fix.
- If the command errors: show the error and ask the user to check that `npm install` completed successfully.

---

## Step 6 — Done

Tell the user:

> "Archivist is installed and configured. **Restart Claude Code** (or your MCP client) to activate it.
>
> Once running, the web UI is at **http://localhost:4242**.
>
> You can manage the daemon any time with:
> ```
> npm run archivist -- status
> npm run archivist -- stop
> npm run archivist -- start
> ```
> (run these from your Archivist install directory)"
