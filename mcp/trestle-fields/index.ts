import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { z } from 'zod';

// Thin MCP adapter over scripts/cotality/query-live.mjs.
//
// There is ONE provider acquisition path. This server does not authenticate,
// parse metadata, page resources, or maintain a snapshot of its own. Every tool
// delegates to the same live-only Cotality client used by the full contract
// compiler and Search verifier. If the live API cannot be read, the tool fails
// UNVERIFIED. There is deliberately no local metadata/CSV/document fallback.

const execFileAsync = promisify(execFile);
const QUERY_CLI = path.resolve(process.cwd(), 'scripts/cotality/query-live.mjs');
const MAX_BUFFER = 16 * 1024 * 1024;

async function run(command: string, args: string[] = []): Promise<unknown> {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [QUERY_CLI, command, ...args],
      {
        cwd: process.cwd(),
        env: process.env,
        timeout: 120_000,
        maxBuffer: MAX_BUFFER,
      },
    );
    return JSON.parse(stdout);
  } catch (error: any) {
    const stderr = String(error?.stderr || error?.message || 'UNVERIFIED');
    throw new Error(stderr.slice(0, 4000));
  }
}

function text(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] };
}

function opt(name: string, value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  return [`--${name}=${String(value)}`];
}

const server = new McpServer({ name: 'cotality-live', version: '2.0.0' });

server.tool(
  'trestle_census',
  'Read the current authenticated Cotality $metadata and return every live resource with field and relationship counts. Live only; failure is UNVERIFIED.',
  {},
  async () => text(await run('census')),
);

server.tool(
  'trestle_list_fields',
  'List every field and relationship declared live on a Cotality resource.',
  {
    resource: z.string(),
    type_filter: z.enum(['all', 'enum', 'string', 'numeric', 'boolean', 'date']).optional(),
  },
  async ({ resource, type_filter }) => text(await run('resource', [
    `--resource=${resource}`,
    ...opt('type', type_filter || 'all'),
  ])),
);

server.tool(
  'trestle_lookup_field',
  'Look up an exact field in current live Cotality $metadata. Returns every resource that owns it, exact type, nullability, and enum members if applicable.',
  {
    field_name: z.string(),
    resource: z.string().optional(),
  },
  async ({ field_name, resource }) => text(await run('field', [
    `--field=${field_name}`,
    ...opt('resource', resource),
  ])),
);

server.tool(
  'trestle_validate_field',
  'Validate that an exact field exists live. This is exact validation, not fuzzy substitution.',
  { field_name: z.string() },
  async ({ field_name }) => text(await run('field', [`--field=${field_name}`])),
);

server.tool(
  'trestle_get_picklist',
  'Read exact enum members from current live Cotality $metadata for a field. For provider Lookup rows/display strings use trestle_lookup_values.',
  {
    field_name: z.string(),
    resource: z.string().optional(),
  },
  async ({ field_name, resource }) => text(await run('picklist', [
    `--field=${field_name}`,
    ...opt('resource', resource),
  ])),
);

server.tool(
  'trestle_lookup_values',
  'Query the live Cotality Lookup resource. Returns query token, display value, legacy value, override, definition, and provenance columns. Results are paged through the shared live client.',
  {
    field_name: z.string().optional(),
    resource: z.string().optional(),
    lookup_name: z.string().optional(),
    max_rows: z.number().int().min(1).max(5000).optional(),
  },
  async ({ field_name, resource, lookup_name, max_rows }) => text(await run('lookup', [
    ...opt('field', field_name),
    ...opt('resource', resource),
    ...opt('lookup', lookup_name),
    ...opt('max', max_rows || 1000),
  ])),
);

server.tool(
  'trestle_query_resource',
  'Run a bounded read-only query against a live Cotality resource using exact OData select/filter/order/expand semantics. Use for actual row/population verification; never infer support from metadata alone.',
  {
    resource: z.string(),
    select: z.string().optional(),
    filter: z.string().optional(),
    orderby: z.string().optional(),
    expand: z.string().optional(),
    top: z.number().int().min(0).max(1000).optional(),
    skip: z.number().int().min(0).optional(),
    count: z.boolean().optional(),
  },
  async ({ resource, select, filter, orderby, expand, top, skip, count }) => text(await run('query', [
    `--resource=${resource}`,
    ...opt('select', select),
    ...opt('filter', filter),
    ...opt('orderby', orderby),
    ...opt('expand', expand),
    ...opt('top', top ?? 50),
    ...opt('skip', skip ?? 0),
    ...opt('count', count ? 'true' : 'false'),
  ])),
);

server.tool(
  'trestle_page_resource',
  'Page a live Cotality resource through @odata.nextLink with an explicit maximum. The response says whether the requested universe was complete or truncated.',
  {
    resource: z.string(),
    select: z.string().optional(),
    filter: z.string().optional(),
    orderby: z.string().optional(),
    expand: z.string().optional(),
    top: z.number().int().min(1).max(1000).optional(),
    max_rows: z.number().int().min(1).max(10000).optional(),
    count: z.boolean().optional(),
  },
  async ({ resource, select, filter, orderby, expand, top, max_rows, count }) => text(await run('page', [
    `--resource=${resource}`,
    ...opt('select', select),
    ...opt('filter', filter),
    ...opt('orderby', orderby),
    ...opt('expand', expand),
    ...opt('top', top ?? 500),
    ...opt('max', max_rows ?? 5000),
    ...opt('count', count ? 'true' : 'false'),
  ])),
);

server.tool(
  'trestle_probe_field',
  'Probe one exact live resource.field for selection, non-null filtering/population count, sorting, and a type-appropriate operator. Distinguishes SUPPORTED, PROVIDER_REJECTED, and UNVERIFIED.',
  { resource: z.string(), field_name: z.string() },
  async ({ resource, field_name }) => text(await run('probeField', [
    `--resource=${resource}`,
    `--field=${field_name}`,
  ])),
);

server.tool(
  'trestle_probe_relationship',
  'Probe one declared $expand relationship and report whether the provider accepts it and whether the sampled relationship payload is populated.',
  { resource: z.string(), relationship: z.string() },
  async ({ resource, relationship }) => text(await run('probeRelationship', [
    `--resource=${resource}`,
    `--relationship=${relationship}`,
  ])),
);

server.tool(
  'trestle_data_system',
  'Read the authenticated Cotality DataSystem endpoint live. This is checked independently of $metadata because service endpoints and EntityTypes are not the same thing.',
  {},
  async () => text(await run('dataSystem')),
);

server.tool(
  'trestle_service_document',
  'Read the authenticated Cotality OData service document live.',
  {},
  async () => text(await run('service')),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(JSON.stringify({
    service: 'cotality-live-mcp',
    state: 'UNVERIFIED',
    error: error instanceof Error ? error.message : String(error),
  }) + '\n');
  process.exit(1);
});
