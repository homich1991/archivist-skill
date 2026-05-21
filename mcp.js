import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as storage from './storage.js';

export const toolHandlers = {
  async deep_thought_write({ namespace, data, id, scope }) {
    return storage.write({ namespace, data, id, scope });
  },
  async deep_thought_read({ namespace, id, scope }) {
    const record = storage.read({ namespace, id, scope });
    if (!record) return { error: `Record '${id}' not found in namespace '${namespace}'`, code: 'NOT_FOUND' };
    return record;
  },
  async deep_thought_list({ namespace, scope, filter, since, before, limit }) {
    return storage.list({ namespace, scope, filter, since, before, limit });
  },
  async deep_thought_search({ query, namespace, scope, limit }) {
    return storage.search({ query, namespace, scope, limit });
  },
  async deep_thought_delete({ namespace, id }) {
    const result = storage.remove({ namespace, id });
    if (!result) return { error: `Record '${id}' not found in namespace '${namespace}'`, code: 'NOT_FOUND' };
    return result;
  },
  async deep_thought_namespaces({ scope }) {
    return storage.namespaces({ scope });
  },
};

export function createMcpServer() {
  const server = new McpServer({ name: 'deep-thought', version: '1.0.0' });

  server.tool(
    'deep_thought_write',
    "Saves a record to the personal database. Use this whenever the user wants to remember something for later — a meeting summary, a person's details, an event, a decision, or any structured data. The namespace groups related records (e.g. \"meetings\", \"team\", \"events\"). Returns the saved record including its auto-generated ID.",
    {
      namespace: z.string().describe('Bucket name, e.g. "meetings", "team", "events"'),
      data: z.record(z.unknown()).describe('The record payload — any JSON object'),
      id: z.string().optional().describe('Optional explicit ID; omit to auto-generate'),
      scope: z.string().optional().describe('global (default) or absolute project path'),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.deep_thought_write(args)) }] })
  );

  server.tool(
    'deep_thought_read',
    'Fetches a single record by its ID. Use when you already know the exact record ID (e.g. from a previous list or search result) and need its full content.',
    {
      namespace: z.string(),
      id: z.string(),
      scope: z.string().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.deep_thought_read(args)) }] })
  );

  server.tool(
    'deep_thought_list',
    'Lists records in a namespace, newest first. Use for browsing or filtering by date range or field values — e.g. "show me all meetings from last month" or "list team members with role=engineer". Prefer deep_thought_search when the user describes content rather than known field values.',
    {
      namespace: z.string(),
      scope: z.string().optional(),
      filter: z.record(z.unknown()).optional().describe('Field equality filter, e.g. {"status":"done"}'),
      since: z.string().optional().describe('ISO date — records created on or after this date'),
      before: z.string().optional().describe('ISO date — records created before this date'),
      limit: z.number().optional().describe('Max records to return, default 50, max 500'),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.deep_thought_list(args)) }] })
  );

  server.tool(
    'deep_thought_search',
    'Full-text search across stored records. Use when the user wants to find something by content — e.g. "find the meeting where we discussed the API design" or "what do I have about John". Can search within a specific namespace or across everything. Returns results ranked by relevance.',
    {
      query: z.string().describe('Full-text search query'),
      namespace: z.string().optional().describe('Scope to this namespace; omit to search all'),
      scope: z.string().optional(),
      limit: z.number().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.deep_thought_search(args)) }] })
  );

  server.tool(
    'deep_thought_delete',
    'Deletes a record permanently by ID. Always confirm with the user before calling this — deletion cannot be undone.',
    {
      namespace: z.string(),
      id: z.string(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.deep_thought_delete(args)) }] })
  );

  server.tool(
    'deep_thought_namespaces',
    "Lists all namespaces with record counts and last-updated timestamps. Use when the user asks what's stored, wants an overview of their data, or before a search to help scope the query.",
    {
      scope: z.string().optional(),
    },
    async (args) => ({ content: [{ type: 'text', text: JSON.stringify(await toolHandlers.deep_thought_namespaces(args)) }] })
  );

  return server;
}
