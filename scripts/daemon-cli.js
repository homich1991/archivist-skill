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
