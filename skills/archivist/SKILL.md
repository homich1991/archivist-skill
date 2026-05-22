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

## Step 1 — Find base directory

Determine `<BASE_DIR>` using the following logic:

- If the environment variable `SKILL_BASE_DIR` is set, use that value as `<BASE_DIR>`.
- Otherwise, derive it from the skill file's own location: this SKILL.md lives at `<BASE_DIR>/skills/archivist/SKILL.md`, so go two directory levels up from the skill file to get `<BASE_DIR>`.

Use the absolute, expanded path (no `~` or relative segments) for all subsequent steps.

---

## Step 2 — Check Node.js version

Run:

```bash
node --version
```

- If the version is **22 or higher**: proceed.
- If below 22: tell the user they need Node.js 22+ and stop. Link them to https://nodejs.org.

---

## Step 3 — Install dependencies

Run:

```bash
npm install --prefix <BASE_DIR>
```

Skip this step if `<BASE_DIR>/node_modules` already exists and `<BASE_DIR>/package.json` has not changed since last install — otherwise run it unconditionally.

---

## Step 4 — Configure MCP

Run:

```bash
node <BASE_DIR>/scripts/install.js <BASE_DIR>
```

This writes the `archivist` MCP server entry into `~/.claude/settings.json`, using `<BASE_DIR>` as the project root.

If `mcpServers.archivist` was already present, tell the user it was updated.

---

## Step 5 — Verify

Run:

```bash
node <BASE_DIR>/scripts/daemon-cli.js status
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
> (run these from `<BASE_DIR>`)"
