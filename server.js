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
  // intentional: continue in degraded mode — tools fail per-call rather than losing all tools
  process.stderr.write(`Warning: Archivist daemon failed to start on port ${PORT} within 5s\n`);
}

await ensureDaemon();

const mcpServer = createMcpServer();
const transport = new StdioServerTransport();
await mcpServer.connect(transport);
