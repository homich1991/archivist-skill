import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

function daemonUrl(path) {
  const port = process.env.ARCHIVIST_PORT ?? '4242';
  return `http://localhost:${port}${path}`;
}

async function callDaemon(method, urlPath, body) {
  const opts = { method };
  if (body !== undefined) {
    opts.headers = { 'content-type': 'application/json' };
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(daemonUrl(urlPath), opts);
    return res.json();
  } catch (err) {
    return { error: err.message, code: 'DAEMON_ERROR' };
  }
}

export const toolHandlers = {
  async archivist_write({ namespace, data, id, scope }) {
    return callDaemon('POST', '/api/records', { namespace, data, id, scope });
  },
  async archivist_read({ namespace, id, scope }) {
    const p = new URLSearchParams({ namespace });
    if (scope) p.set('scope', scope);
    return callDaemon('GET', `/api/records/${id}?${p}`);
  },
  async archivist_list({ namespace, scope, filter, since, before, limit }) {
    const p = new URLSearchParams({ namespace });
    if (scope) p.set('scope', scope);
    if (since) p.set('since', since);
    if (before) p.set('before', before);
    if (limit != null) p.set('limit', String(limit));
    if (filter) p.set('filter', JSON.stringify(filter));
    return callDaemon('GET', `/api/records?${p}`);
  },
  async archivist_search({ query, namespace, scope, limit }) {
    const p = new URLSearchParams({ q: query });
    if (namespace) p.set('namespace', namespace);
    if (scope) p.set('scope', scope);
    if (limit != null) p.set('limit', String(limit));
    return callDaemon('GET', `/api/search?${p}`);
  },
  async archivist_delete({ namespace, id }) {
    const p = new URLSearchParams({ namespace });
    return callDaemon('DELETE', `/api/records/${id}?${p}`);
  },
  async archivist_namespaces({ scope }) {
    const p = new URLSearchParams();
    if (scope) p.set('scope', scope);
    return callDaemon('GET', `/api/namespaces?${p}`);
  },
};

export function createMcpServer() {
  const server = new McpServer({ name: 'archivist', version: '1.0.0' });

  server.tool(
    'archivist_write',
    "Saves a record to the personal database. Use this whenever the user wants to remember something for later — a meeting summary, a person's details, an event, a decision, or any structured data. The namespace groups related records (e.g. \"meetings\", \"team\", \"events\"). Returns the saved record including its auto-generated ID.",
    {
      namespace: z.string().describe('Bucket name, e.g. "meetings", "team", "events"'),
      data: z.record(z.unknown()).describe('The record payload — any JSON object'),
      id: z.string().optional().describe('Optional explicit ID; omit to auto-generate'),
      scope: z.string().optional().describe('global (default) or absolute project path'),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_write(args)) }] })
  );

  server.tool(
    'archivist_read',
    'Fetches a single record by its ID. Use when you already know the exact record ID (e.g. from a previous list or search result) and need its full content.',
    {
      namespace: z.string(),
      id: z.string(),
      scope: z.string().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_read(args)) }] })
  );

  server.tool(
    'archivist_list',
    'Lists records in a namespace, newest first. Use for browsing or filtering by date range or field values — e.g. "show me all meetings from last month" or "list team members with role=engineer". Prefer archivist_search when the user describes content rather than known field values.',
    {
      namespace: z.string(),
      scope: z.string().optional(),
      filter: z.record(z.unknown()).optional().describe('Field equality filter, e.g. {"status":"done"}'),
      since: z.string().optional().describe('ISO date — records created on or after this date'),
      before: z.string().optional().describe('ISO date — records created before this date'),
      limit: z.number().optional().describe('Max records to return, default 50, max 500'),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_list(args)) }] })
  );

  server.tool(
    'archivist_search',
    'Full-text search across stored records. Use when the user wants to find something by content — e.g. "find the meeting where we discussed the API design" or "what do I have about John". Can search within a specific namespace or across everything. Returns results ranked by relevance.',
    {
      query: z.string().describe('Full-text search query'),
      namespace: z.string().optional().describe('Scope to this namespace; omit to search all'),
      scope: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_search(args)) }] })
  );

  server.tool(
    'archivist_delete',
    'Deletes a record permanently by ID. Always confirm with the user before calling this — deletion cannot be undone.',
    {
      namespace: z.string(),
      id: z.string(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_delete(args)) }] })
  );

  server.tool(
    'archivist_namespaces',
    "Lists all namespaces with record counts and last-updated timestamps. Use when the user asks what's stored, wants an overview of their data, or before a search to help scope the query.",
    {
      scope: z.string().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.archivist_namespaces(args)) }] })
  );

  return server;
}
