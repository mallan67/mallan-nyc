const ALLOWED_BUCKETS = new Set(["saved", "seen", "liked", "disliked", "discuss"]);
const ALLOWED_STATUSES = new Set(["submitted", "reviewing", "matched", "dismissed", "archived"]);

export interface ExternalListingInput {
  url?: unknown;
  address?: unknown;
  title?: unknown;
  notes?: unknown;
  action_bucket?: unknown;
  status?: unknown;
}

export interface NormalizedExternalListingInput {
  url: string | null;
  normalized_url: string | null;
  source_host: string | null;
  address: string | null;
  title: string | null;
  notes: string | null;
  action_bucket: string;
  status: string;
}

function trimmed(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  if (!clean) return null;
  return clean.slice(0, max);
}

function normalizeBucket(value: unknown): string {
  const bucket = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ALLOWED_BUCKETS.has(bucket) ? bucket : "saved";
}

export function normalizeExternalListingBucket(value: unknown): string | null {
  const bucket = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ALLOWED_BUCKETS.has(bucket) ? bucket : null;
}

function normalizeStatus(value: unknown): string {
  const status = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ALLOWED_STATUSES.has(status) ? status : "submitted";
}

export function normalizeExternalListingUrl(value: unknown): {
  url: string | null;
  normalized_url: string | null;
  source_host: string | null;
} {
  const raw = trimmed(value, 2048);
  if (!raw) {
    return { url: null, normalized_url: null, source_host: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { url: raw, normalized_url: null, source_host: null };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { url: raw, normalized_url: null, source_host: null };
  }

  parsed.hash = "";
  parsed.username = "";
  parsed.password = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  if (parsed.pathname !== "/") parsed.pathname = parsed.pathname.replace(/\/+$/, "");

  const normalized = parsed.toString().slice(0, 2048);
  return {
    url: raw,
    normalized_url: normalized,
    source_host: parsed.hostname.replace(/^www\./, "").slice(0, 255),
  };
}

export function normalizeExternalListingInput(input: ExternalListingInput): NormalizedExternalListingInput {
  const url = normalizeExternalListingUrl(input.url);
  const address = trimmed(input.address, 500);

  return {
    ...url,
    address,
    title: trimmed(input.title, 255),
    notes: trimmed(input.notes, 5000),
    action_bucket: normalizeBucket(input.action_bucket),
    status: normalizeStatus(input.status),
  };
}

export function validateExternalListingInput(input: NormalizedExternalListingInput): string | null {
  if (!input.normalized_url && !input.address) {
    return "Provide either a valid http(s) listing URL or an address.";
  }
  return null;
}

export function serializeExternalListing(listing: {
  id: bigint;
  lead_id: bigint;
  submitted_by_lead_id: bigint | null;
  agent_id: bigint | null;
  url: string | null;
  normalized_url: string | null;
  source_host: string | null;
  address: string | null;
  title: string | null;
  notes: string | null;
  status: string;
  action_bucket: string;
  created_at: Date;
  updated_at: Date;
}) {
  return {
    id: listing.id.toString(),
    lead_id: listing.lead_id.toString(),
    submitted_by_lead_id: listing.submitted_by_lead_id?.toString() ?? null,
    agent_id: listing.agent_id?.toString() ?? null,
    url: listing.url,
    normalized_url: listing.normalized_url,
    source_host: listing.source_host,
    address: listing.address,
    title: listing.title,
    notes: listing.notes,
    status: listing.status,
    action_bucket: listing.action_bucket,
    created_at: listing.created_at.toISOString(),
    updated_at: listing.updated_at.toISOString(),
  };
}

export function normalizeExternalListingCommentBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const body = value.trim();
  if (!body || body.length > 2000) return null;
  return body;
}

export function normalizeExternalListingRequestType(value: unknown): string {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "request_info" || raw === "showing_request") return raw;
  return "comment";
}

export function serializeExternalListingComment(comment: {
  id: bigint;
  external_listing_id: bigint;
  lead_id: bigint | null;
  agent_id: bigint | null;
  body: string;
  request_type: string;
  created_at: Date;
  lead?: { id: bigint; first_name: string; last_name: string; email: string } | null;
  agent?: { id: bigint; first_name: string; last_name: string; email: string } | null;
}) {
  const leadName = comment.lead ? `${comment.lead.first_name} ${comment.lead.last_name}`.trim() : null;
  const agentName = comment.agent ? `${comment.agent.first_name} ${comment.agent.last_name}`.trim() : null;
  return {
    id: comment.id.toString(),
    external_listing_id: comment.external_listing_id.toString(),
    lead_id: comment.lead_id?.toString() ?? null,
    agent_id: comment.agent_id?.toString() ?? null,
    body: comment.body,
    request_type: comment.request_type,
    author: comment.lead
      ? {
          type: "lead",
          id: comment.lead.id.toString(),
          name: leadName || comment.lead.email,
          email: comment.lead.email,
        }
      : comment.agent
        ? {
            type: "agent",
            id: comment.agent.id.toString(),
            name: agentName || comment.agent.email,
            email: comment.agent.email,
          }
        : null,
    created_at: comment.created_at.toISOString(),
  };
}
