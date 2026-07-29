/**
 * Phase 1A — union / dedupe / conflict resolution across the MT and PCT streams.
 *
 * THE PROCESSING REPRESENTATION AND THE CURSOR POSITIONS ARE SEPARATE CONTRACTS.
 * A listing returned by both streams has ONE database representation but TWO
 * cursor positions, and they can disagree:
 *
 *     MT response:  MT=Jul 10, PCT=Jul 5
 *     PCT response: MT=Jul  9, PCT=Jul 11
 *
 * so each stream's order member carries the timestamp from ITS OWN returned row.
 * Cursor advancement never reads the merged representation.
 *
 * The two streams are separate HTTP requests, so a listing can also change
 * between them. Map-insertion order would pick one at random; instead:
 *   - clock-only drift is equivalent, and the DOMINATING representation wins
 *     (newer-or-equal on BOTH clocks, strictly newer on at least one);
 *   - crossed clocks (each newer on one clock) are a bounded conflict — neither
 *     dominates, and combining them would manufacture a snapshot the API never
 *     returned;
 *   - a genuine visible-content difference is a conflict.
 *
 * Unbounded rows (missing/empty key, malformed own-stream clock) and same-stream
 * duplicate keys block their stream. Cotality's missing/empty-key filtering could
 * not be verified — `ListingKey eq ''` returns the full population — so these
 * guards are the only protection that exists.
 */

import { RAW_DATA_PROVENANCE_CLOCK_KEYS, rawDataMateriallyEqual } from "@/lib/idx/write-suppression";

export type StreamName = "mt" | "pct";

export type StreamBlockReason =
  | "missing_listing_key"
  | "malformed_timestamp"
  | "duplicate_listing_key_in_stream"
  | "cross_stream_payload_conflict"
  | "cross_stream_clock_conflict";

/** Reasons that halt a whole stream at its pre-run cursor. */
export type StreamFreezeReason = Extract<
  StreamBlockReason,
  "missing_listing_key" | "malformed_timestamp" | "duplicate_listing_key_in_stream"
>;

export interface StreamOrderMember {
  listingKey: string | null;
  entryIndex: number;
  /** Validated, canonical-UTC timestamp from THIS stream's own returned row. */
  cursorTimestamp: string | null;
}

export type MergedEntry =
  | { kind: "processable"; listingKey: string; record: Record<string, unknown>; streams: StreamName[] }
  | { kind: "blocked"; listingKey: string | null; reason: StreamBlockReason; streams: StreamName[] };

export interface MergeResult {
  entries: MergedEntry[];
  order: Record<StreamName, StreamOrderMember[]>;
  frozen: Record<StreamName, StreamFreezeReason | null>;
  /** Listings genuinely returned by BOTH streams. Never same-stream repeats. */
  overlapCount: number;
}

const STREAM_FIELD: Record<StreamName, string> = {
  mt: "ModificationTimestamp",
  pct: "PhotosChangeTimestamp",
};

function validMs(v: unknown): number | null {
  if (typeof v !== "string" || v.trim().length === 0) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) && !Number.isNaN(t) ? t : null;
}

function canonicalIso(v: string): string {
  return new Date(v).toISOString();
}

function usableKey(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function stripClocks(r: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) {
    if (!RAW_DATA_PROVENANCE_CLOCK_KEYS.has(k)) out[k] = v;
  }
  return out;
}

function representationsEquivalent(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  try {
    return rawDataMateriallyEqual(stripClocks(a), stripClocks(b));
  } catch {
    return false; // fail closed -> conflict
  }
}

type Dominance = "a" | "b" | "equal" | "crossed";

/**
 * Compare two representations on BOTH clocks independently. `max()` is not a
 * total order: with crossed clocks neither snapshot is newer, and picking by
 * maximum would make the outcome depend on which stream happened to be first.
 */
function clockDominance(a: Record<string, unknown>, b: Record<string, unknown>): Dominance {
  const aMt = validMs(a[STREAM_FIELD.mt]);
  const bMt = validMs(b[STREAM_FIELD.mt]);
  const aPct = validMs(a[STREAM_FIELD.pct]);
  const bPct = validMs(b[STREAM_FIELD.pct]);
  // An unusable clock on either side cannot be ordered — fail closed.
  if (aMt === null || bMt === null || aPct === null || bPct === null) return "crossed";
  if (aMt === bMt && aPct === bPct) return "equal";
  if (aMt >= bMt && aPct >= bPct) return "a";
  if (bMt >= aMt && bPct >= aPct) return "b";
  return "crossed";
}

export function mergePropertyStreams(input: {
  mt: Record<string, unknown>[];
  pct: Record<string, unknown>[];
}): MergeResult {
  const entries: MergedEntry[] = [];
  const order: MergeResult["order"] = { mt: [], pct: [] };
  const frozen: MergeResult["frozen"] = { mt: null, pct: null };
  const byKey = new Map<string, { entryIndex: number; streams: StreamName[] }>();
  const seenInStream: Record<StreamName, Set<string>> = { mt: new Set(), pct: new Set() };
  let overlapCount = 0;

  const freeze = (stream: StreamName, reason: StreamFreezeReason) => {
    if (frozen[stream] === null) frozen[stream] = reason;
  };

  for (const stream of ["mt", "pct"] as StreamName[]) {
    for (const raw of input[stream] ?? []) {
      const row = (raw ?? {}) as Record<string, unknown>;
      const keyRaw = row.ListingKey;

      if (!usableKey(keyRaw)) {
        freeze(stream, "missing_listing_key");
        entries.push({ kind: "blocked", listingKey: null, reason: "missing_listing_key", streams: [stream] });
        order[stream].push({ listingKey: null, entryIndex: entries.length - 1, cursorTimestamp: null });
        continue;
      }
      const key = keyRaw;

      const ownMs = validMs(row[STREAM_FIELD[stream]]);
      if (ownMs === null) {
        freeze(stream, "malformed_timestamp");
        entries.push({ kind: "blocked", listingKey: key, reason: "malformed_timestamp", streams: [stream] });
        order[stream].push({ listingKey: key, entryIndex: entries.length - 1, cursorTimestamp: null });
        continue;
      }
      // The cursor position for THIS stream, from THIS stream's own row.
      const cursorTimestamp = canonicalIso(row[STREAM_FIELD[stream]] as string);

      // ── Same-stream repeat: a provider/invariant failure, not overlap ──
      if (seenInStream[stream].has(key)) {
        freeze(stream, "duplicate_listing_key_in_stream");
        entries.push({
          kind: "blocked", listingKey: key, reason: "duplicate_listing_key_in_stream", streams: [stream],
        });
        order[stream].push({ listingKey: key, entryIndex: entries.length - 1, cursorTimestamp });
        continue;
      }
      seenInStream[stream].add(key);

      const seen = byKey.get(key);
      if (!seen) {
        entries.push({ kind: "processable", listingKey: key, record: row, streams: [stream] });
        const entryIndex = entries.length - 1;
        byKey.set(key, { entryIndex, streams: [stream] });
        order[stream].push({ listingKey: key, entryIndex, cursorTimestamp });
        continue;
      }

      // ── Genuine CROSS-stream duplicate ──
      overlapCount++;
      seen.streams.push(stream);
      order[stream].push({ listingKey: key, entryIndex: seen.entryIndex, cursorTimestamp });
      const existing = entries[seen.entryIndex];
      if (existing.kind === "blocked") {
        if (!existing.streams.includes(stream)) existing.streams.push(stream);
        continue;
      }

      if (!representationsEquivalent(existing.record, row)) {
        entries[seen.entryIndex] = {
          kind: "blocked", listingKey: key,
          reason: "cross_stream_payload_conflict", streams: [...seen.streams],
        };
        continue;
      }

      const dom = clockDominance(row, existing.record);
      if (dom === "crossed") {
        entries[seen.entryIndex] = {
          kind: "blocked", listingKey: key,
          reason: "cross_stream_clock_conflict", streams: [...seen.streams],
        };
        continue;
      }
      // "equal" keeps the incumbent; "a" means the incoming row dominates.
      if (dom === "a") existing.record = row;
      existing.streams = [...seen.streams];
    }
  }

  return { entries, order, frozen, overlapCount };
}
