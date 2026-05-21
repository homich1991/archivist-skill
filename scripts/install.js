import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const SETTINGS_PATH = join(homedir(), '.claude', 'settings.json');
const SERVER_PATH = resolve(join(fileURLToPath(import.meta.url), '..', '..', 'server.js'));

function readSettings() {
  if (!existsSync(SETTINGS_PATH)) return {};
  try { return JSON.parse(readFileSync(SETTINGS_PATH, 'utf8')); }
  catch { return {}; }
}

function writeSettings(settings) {
  mkdirSync(dirname(SETTINGS_PATH), { recursive: true });
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}

const settings = readSettings();
settings.mcpServers ??= {};

if (settings.mcpServers['deep-thought']) {
  console.log('deep-thought MCP server is already configured in ~/.claude/settings.json');
  console.log('Entry:', JSON.stringify(settings.mcpServers['deep-thought'], null, 2));
  console.log('\nTo update the path, edit ~/.claude/settings.json manually.');
  process.exit(0);
}

settings.mcpServers['deep-thought'] = {
  command: 'node',
  args: [SERVER_PATH],
};

writeSettings(settings);

console.log('✓ deep-thought added to ~/.claude/settings.json');
console.log(`  Server path: ${SERVER_PATH}`);
console.log('\nRestart Claude Code to activate the MCP server.');
console.log('Then open http://localhost:4242 to browse your data.');
