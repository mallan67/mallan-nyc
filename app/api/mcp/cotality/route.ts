import { NextRequest, NextResponse } from "next/server";
import { getAccessToken } from "@/lib/idx/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_COTALITY_BASE = "https://api.cotality.com/trestle";
const LEGACY_PROTOCOL_VERSION = "2025-11-25";

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: Record<string, unknown>;
};

function cotalityBase(): string {
  const raw = (process.env.TRESTLE_API_URL || DEFAULT_COTALITY_BASE).replace(/\/+$/, "");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "api.cotality.com" || url.pathname !== "/trestle") {
    throw new Error("TRESTLE_API_URL must resolve to https://api.cotality.com/trestle");
  }
  return raw;
}

async function cotalityFetch(path: string): Promise<Response> {
  const token = await getAccessToken();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${cotalityBase()}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, application/xml, text/xml",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = (await response.text().catch(() => "")).slice(0, 2000);
      throw new Error(`Cotality GET ${path} failed (${response.status}): ${body || response.statusText}`);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function cappedTop(value: unknown, fallback = 25): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(100, Math.trunc(n)));
}

function odataCatalogPath(entitySet: "Field" | "Lookup", args: Record<string, unknown>): string {
  const params = new URLSearchParams();
  if (typeof args.filter === "string" && args.filter.trim()) params.set("$filter", args.filter.trim());
  if (typeof args.select === "string" && args.select.trim()) params.set("$select", args.select.trim());
  if (typeof args.orderby === "string" && args.orderby.trim()) params.set("$orderby", args.orderby.trim());
  params.set("$top", String(cappedTop(args.top)));
  return `/odata/${entitySet}?${params.toString()}`;
}

function serverInfoMeta() {
  return {
    "io.modelcontextprotocol/serverInfo": {
      name: "mallan-cotality",
      version: "1.0.0",
      description: "Read-only Mallan access to the live Cotality contract.",
    },
  };
}

const tools = [
  {
    name: "cotality_service_document",
    description: "Read the live Cotality OData service document. Use this to discover the entity sets actually exposed to Mallan before making provider-contract claims.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "cotality_metadata_search",
    description: "Search Mallan's live Cotality $metadata XML for an exact field, resource, enum, navigation, or annotation string. Returns raw nearby provider XML rather than a repo-derived interpretation.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 1, description: "Exact text to search for in live $metadata." },
        max_matches: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "cotality_field_catalog",
    description: "Read rows from Cotality's live Field catalog. This is read-only and capped at 100 rows. Pass OData $filter/$select/$orderby expressions exactly as the provider accepts them.",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string" },
        select: { type: "string" },
        orderby: { type: "string" },
        top: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "cotality_lookup_catalog",
    description: "Read rows from Cotality's live Lookup catalog for exact provider picklist values and definitions. Read-only and capped at 100 rows.",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string" },
        select: { type: "string" },
        orderby: { type: "string" },
        top: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
];

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "cotality_service_document") {
    const response = await cotalityFetch("/odata");
    const body = await response.text();
    return {
      content: [{ type: "text", text: body }],
      structuredContent: { source: `${cotalityBase()}/odata`, live: true },
    };
  }

  if (name === "cotality_metadata_search") {
    const query = String(args.query || "").trim();
    if (!query) throw new Error("query is required");
    const maxMatches = Math.max(1, Math.min(25, Number(args.max_matches) || 10));
    const response = await cotalityFetch("/odata/$metadata");
    const xml = await response.text();
    const haystack = xml.toLowerCase();
    const needle = query.toLowerCase();
    const matches: string[] = [];
    let from = 0;
    while (matches.length < maxMatches) {
      const idx = haystack.indexOf(needle, from);
      if (idx === -1) break;
      const start = Math.max(0, idx - 350);
      const end = Math.min(xml.length, idx + query.length + 650);
      matches.push(xml.slice(start, end));
      from = idx + Math.max(1, needle.length);
    }
    return {
      content: [{
        type: "text",
        text: matches.length
          ? matches.map((m, i) => `--- match ${i + 1} ---\n${m}`).join("\n")
          : `No live $metadata match for "${query}".`,
      }],
      structuredContent: {
        source: `${cotalityBase()}/odata/$metadata`,
        query,
        matches: matches.length,
        live: true,
      },
    };
  }

  if (name === "cotality_field_catalog" || name === "cotality_lookup_catalog") {
    const entitySet = name === "cotality_field_catalog" ? "Field" : "Lookup";
    const path = odataCatalogPath(entitySet, args);
    const response = await cotalityFetch(path);
    const text = await response.text();
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch {}
    return {
      content: [{ type: "text", text }],
      structuredContent: {
        source: `${cotalityBase()}${path}`,
        entitySet,
        live: true,
        result: parsed,
      },
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

function success(id: JsonRpcId | undefined, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function failure(id: JsonRpcId | undefined, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function dispatch(message: JsonRpcRequest) {
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return failure(message.id, -32600, "Invalid Request");
  }

  if (message.method === "initialize") {
    const requested = String((message.params as Record<string, unknown> | undefined)?.protocolVersion || "");
    const protocolVersion = requested && requested.startsWith("2025-")
      ? requested
      : LEGACY_PROTOCOL_VERSION;
    return success(message.id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "mallan-cotality", version: "1.0.0" },
      instructions: "Use only live Cotality contract results. Do not substitute repo snapshots or remembered provider facts.",
    });
  }

  if (message.method === "server/discover") {
    return success(message.id, {
      supportedVersions: ["2026-07-28"],
      capabilities: { tools: { listChanged: false } },
      instructions: "Use only live Cotality contract results. Do not substitute repo snapshots or remembered provider facts.",
      _meta: serverInfoMeta(),
    });
  }

  if (message.method === "ping") return success(message.id, {});

  if (message.method === "tools/list") {
    return success(message.id, { tools, _meta: serverInfoMeta() });
  }

  if (message.method === "tools/call") {
    const params = (message.params || {}) as Record<string, unknown>;
    const name = typeof params.name === "string" ? params.name : "";
    const args = (params.arguments && typeof params.arguments === "object")
      ? params.arguments as Record<string, unknown>
      : {};
    try {
      const result = await callTool(name, args);
      return success(message.id, { ...result, _meta: serverInfoMeta() });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      return success(message.id, {
        isError: true,
        content: [{ type: "text", text: messageText }],
        _meta: serverInfoMeta(),
      });
    }
  }

  if (message.method.startsWith("notifications/")) return null;
  return failure(message.id, -32601, `Method not found: ${message.method}`);
}

export async function POST(req: NextRequest): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(failure(null, -32700, "Parse error"), { status: 400 });
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.map((item) => dispatch(item as JsonRpcRequest))))
      .filter(Boolean);
    if (responses.length === 0) return new Response(null, { status: 202 });
    return NextResponse.json(responses, {
      headers: { "Cache-Control": "no-store" },
    });
  }

  const response = await dispatch(body as JsonRpcRequest);
  if (response === null) return new Response(null, { status: 202 });
  return NextResponse.json(response, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(req: NextRequest): Promise<Response> {
  if (process.env.VERCEL_ENV !== "preview" || req.nextUrl.searchParams.get("selftest") !== "1") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  const invoke = async (payload: JsonRpcRequest) => {
    const subrequest = new NextRequest("https://selftest.invalid/api/mcp/cotality", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const response = await POST(subrequest);
    return {
      status: response.status,
      body: await response.json() as Record<string, unknown>,
    };
  };

  const initialize = await invoke({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: LEGACY_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "vercel-preview-selftest", version: "1.0.0" },
    },
  });
  const toolList = await invoke({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const serviceDocument = await invoke({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "cotality_service_document", arguments: {} },
  });
  const metadata = await invoke({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "cotality_metadata_search",
      arguments: { query: "SubdivisionName", max_matches: 1 },
    },
  });
  const fieldCatalog = await invoke({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "cotality_field_catalog", arguments: { top: 1 } },
  });
  const lookupCatalog = await invoke({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "cotality_lookup_catalog", arguments: { top: 1 } },
  });

  const extract = (entry: { status: number; body: Record<string, unknown> }) => {
    const result = entry.body.result as Record<string, unknown> | undefined;
    return {
      httpStatus: entry.status,
      rpcError: Boolean(entry.body.error),
      toolError: Boolean(result?.isError),
    };
  };

  const listedTools = (((toolList.body.result as Record<string, unknown> | undefined)?.tools) || []) as Array<Record<string, unknown>>;
  const checks = {
    initialize: extract(initialize),
    toolsList: { ...extract(toolList), names: listedTools.map((tool) => tool.name) },
    serviceDocument: extract(serviceDocument),
    metadataSubdivisionName: extract(metadata),
    fieldCatalog: extract(fieldCatalog),
    lookupCatalog: extract(lookupCatalog),
  };

  const ok = Object.values(checks).every((check) => (
    check.httpStatus === 200 &&
    check.rpcError === false &&
    check.toolError === false
  ));

  return NextResponse.json({
    ok,
    environment: process.env.VERCEL_ENV,
    provider: cotalityBase(),
    checks,
  }, {
    status: ok ? 200 : 500,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function DELETE(): Promise<Response> {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}
