import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { startHttpServer } from './http.js';

const PORT = Number(process.env.ARCHIVIST_PORT ?? 4242);
const PID_DIR = join(homedir(), '.archivist');
const PID_FILE = join(PID_DIR, 'archivist.pid');

mkdirSync(PID_DIR, { recursive: true });
writeFileSync(PID_FILE, String(process.pid), 'utf8');

function cleanup() {
  try { unlinkSync(PID_FILE); } catch {}
}

process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('SIGINT', () => { cleanup(); process.exit(0); });

const httpServer = await startHttpServer(PORT);
const { port } = httpServer.address();
process.stderr.write(`Archivist daemon listening on http://localhost:${port}\n`);
