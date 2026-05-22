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
