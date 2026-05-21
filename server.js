import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcp.js';
import { startHttpServer } from './http.js';

const PORT = Number(process.env.DEEP_THOUGHT_PORT ?? 4242);

async function main() {
  const httpServer = await startHttpServer(PORT);
  const { port } = httpServer.address();
  process.stderr.write(`Deep Thought web UI: http://localhost:${port}\n`);

  const mcpServer = createMcpServer();
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err.message}\n`);
  process.exit(1);
});
