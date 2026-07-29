/**
 * Phase 1A — union / dedupe / conflict resolution across the MT and PCT streams.
 *
 * The two streams are separate HTTP requests, so a listing can change between
 * them and arrive twice with different payloads. Relying on map-insertion order
 * would silently pick one at random; instead a material disagreement is a
 * CONFLICT that writes nothing and blocks both stream cursors at that listing,
 * so the next cycle can fetch one consistent representation.
 *
 * Separately, the probe could not establish Cotality's missing/empty-key
 * semantics — `ListingKey eq ''` returns the full population — so a row with a
 * missing/empty key or a malformed stream clock is UNBOUNDED: it FREEZES its
 * whole stream at the pre-run cursor. Advancing even the earlier successful
 * prefix would strand that row behind a composite cursor it can never satisfy.
 */

import { RAW_DATA_PROVENANCE_CLOCK_KEYS, rawDataMateriallyEqual } from "@/lib/idx/write-suppression";

export type StreamName = "mt" | "pct";

export type StreamBlockReason =
  | "missing_listing_key"
  | "malformed_timestamp"
  | "cross_stream_payload_conflict";

/** A freeze reason — the subset that must halt a stream at its pre-run cursor. */
export type StreamFreezeReason = Extract<StreamBlockReason, "missing_listing_key" | "malformed_timestamp">;

export type MergedEntry =
  | {
      kind: "processable";
      listingKey: string;
      record: Record<string, unknown>;
      streams: StreamName[];
    }
  | {
      kind: "blocked";
      /** null when the row had no usable key at all. */
      listingKey: string | null;
      reason: StreamBlockReason;
      streams: StreamName[];
    };

export interface MergeResult {
  entries: MergedEntry[];
  /** Per-stream membership in RETURNED KEYSET ORDER — drives cursor advancement. */
  order: Record<StreamName, Array<{ listingKey: string | null; entryIndex: number }>>;
  /** Non-null => that stream must stay at its pre-run cursor this run. */
  frozen: Record<StreamName, StreamFreezeReason | null>;
  overlapCount: number;
}

const STREAM_FIELD: Record<StreamName, string> = {
  mt: "ModificationTimestamp",
  pct: "PhotosChangeTimestamp",
};

function validTime(v: unknown): number | null {
  if (typeof v !== "string" || v.length === 0) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) && !Number.isNaN(t) ? t : null;
}

/** Latest of the two source clocks, for deterministic representation choice. */
function latestSourceClock(r: Record<string, unknown>): number {
  return Math.max(
    validTime(r[STREAM_FIELD.mt]) ?? Number.NEGATIVE_INFINITY,
    validTime(r[STREAM_FIELD.pct]) ?? Number.NEGATIVE_INFINITY,
  );
}

/** Strip the approved provenance clocks so clock-only drift is not a conflict. */
function stripClocks(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (!RAW_DATA_PROVENANCE_CLOCK_KEYS.has(k)) out[k] = v;
  }
  return out;
}

/**
 * Two representations of one listing are equivalent when they match after
 * stripping the approved provenance clocks and applying the existing raw-data
 * canonicalisation (which already neutralises rotating signed media URLs).
 */
function representationsEquivalent(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  try {
    return rawDataMateriallyEqual(stripClocks(a), stripClocks(b));
  } catch {
    return false; // fail closed -> conflict
  }
}

export function mergePropertyStreams(input: {
  mt: Record<string, unknown>[];
  pct: Record<string, unknown>[];
}): MergeResult {
  const entries: MergedEntry[] = [];
  const order: MergeResult["order"] = { mt: [], pct: [] };
  const frozen: MergeResult["frozen"] = { mt: null, pct: null };
  const byKey = new Map<string, { entryIndex: number; streams: StreamName[]; record: Record<string, unknown> }>();
  let overlapCount = 0;

  for (const stream of ["mt", "pct"] as StreamName[]) {
    const rows = input[stream] ?? [];
    for (const raw of rows) {
      const row = (raw ?? {}) as Record<string, unknown>;
      const keyRaw = row.ListingKey;
      const key = typeof keyRaw === "string" ? keyRaw : "";

      // ── Unbounded row: freeze the WHOLE stream at its pre-run cursor ──
      if (key.length === 0) {
        if (frozen[stream] === null) frozen[stream] = "missing_listing_key";
        entries.push({ kind: "blocked", listingKey: null, reason: "missing_listing_key", streams: [stream] });
        order[stream].push({ listingKey: null, entryIndex: entries.length - 1 });
        continue;
      }
      if (validTime(row[STREAM_FIELD[stream]]) === null) {
        if (frozen[stream] === null) frozen[stream] = "malformed_timestamp";
        entries.push({ kind: "blocked", listingKey: key, reason: "malformed_timestamp", streams: [stream] });
        order[stream].push({ listingKey: key, entryIndex: entries.length - 1 });
        continue;
      }

      const seen = byKey.get(key);
      if (!seen) {
        entries.push({ kind: "processable", listingKey: key, record: row, streams: [stream] });
        const entryIndex = entries.length - 1;
        byKey.set(key, { entryIndex, streams: [stream], record: row });
        order[stream].push({ listingKey: key, entryIndex });
        continue;
      }

      // ── Duplicate across streams ──
      overlapCount++;
      seen.streams.push(stream);
      order[stream].push({ listingKey: key, entryIndex: seen.entryIndex });
      const existing = entries[seen.entryIndex];

      if (existing.kind === "blocked") {
        // Already conflicted; just record this stream's membership.
        if (!existing.streams.includes(stream)) existing.streams.push(stream);
        continue;
      }

      if (!representationsEquivalent(existing.record, row)) {
        entries[seen.entryIndex] = {
          kind: "blocked",
          listingKey: key,
          reason: "cross_stream_payload_conflict",
          streams: [...seen.streams],
        };
        continue;
      }

      // Equivalent: keep the representation with the latest valid source clock.
      // Ties resolve to the incumbent, so the outcome is independent of the
      // order the streams were supplied in.
      if (latestSourceClock(row) > latestSourceClock(existing.record)) {
        existing.record = row;
        seen.record = row;
      }
      existing.streams = [...seen.streams];
    }
  }

  return { entries, order, frozen, overlapCount };
}
