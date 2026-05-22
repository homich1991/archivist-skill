import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SETTINGS_PATH = join(homedir(), '.claude.json');
const _baseDir = process.argv[2]?.trim();
const SERVER_PATH = _baseDir
  ? resolve(join(_baseDir, 'server.js'))
  : resolve(join(fileURLToPath(import.meta.url), '..', '..', 'server.js'));

function readSettings() {
  if (!existsSync(SETTINGS_PATH)) return {};
  try { return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return {}; }
}

function writeSettings(settings) {
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

const settings = readSettings();
settings.mcpServers ??= {};

if (settings.mcpServers['deep-thought']) {
  console.log('Warning: old deep-thought entry found in ~/.claude/settings.json.');
  console.log('Remove it manually, then re-run npm run install-archivist-mcp.');
  process.exit(1);
}

if (settings.mcpServers['archivist']) {
  console.log('archivist MCP server is already configured in ~/.claude/settings.json');
  console.log('Entry:', JSON.stringify(settings.mcpServers['archivist'], null, 2));
  console.log('\nTo update the path, edit ~/.claude/settings.json manually.');
  process.exit(0);
}

settings.mcpServers['archivist'] = {
  command: 'node',
  args: [SERVER_PATH],
};

writeSettings(settings);

console.log('✓ archivist added to ~/.claude.json');
console.log(`  Server path: ${SERVER_PATH}`);
console.log('\nRestart your MCP client to activate the server.');
console.log('Then open http://localhost:4242 to browse your data.');
