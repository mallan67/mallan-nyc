/**
 * r2-orphan-plan — PURE, side-effect-free decision logic for the R2 orphan
 * cleanup. No imports of prisma, the R2 client, or `fs`: it takes an already-
 * gathered snapshot and returns a plan. This is where EVERY safety filter lives
 * so it can be exhaustively unit-tested without touching R2 or the DB.
 *
 * Deletion is fail-closed at every step: an unknown, partial, or failed input
 * aborts the plan and deletes nothing.
 */

/** Listing-media R2 objects live ONLY under these prefixes (buildMediaR2Key). */
export const LISTING_MEDIA_PREFIXES = [
  'photos/',
  'floorplans/',
  'videos/',
  'virtualtours/',
] as const;

/** The exact phrase --confirm must equal before any deletion is allowed. */
export const CONFIRM_PHRASE = 'DELETE LISTING MEDIA ORPHANS';

/**
 * Hard ceiling: even with a valid --max-delete, a candidate set larger than
 * this refuses to execute and demands manual re-approval. Guards against a
 * DB-reference regression suddenly making tens of thousands of live objects
 * look orphaned.
 */
export const SANITY_THRESHOLD = 5000;

export interface R2ObjectMeta {
  key: string;
  size: number;
  lastModified: Date | null;
}

export interface PlanInput {
  /** Every object listed in the bucket (all prefixes). */
  bucketObjects: R2ObjectMeta[];
  /** false if the R2 list was partial/interrupted → fail-closed. */
  listComplete: boolean;
  /**
   * The union of every DB-referenced listing-media key
   * (listing_media.r2_key ∪ listings.primary_photo_r2_key ∪
   * keyFromUrl(listing_media.media_url_cached)). `null` means the DB query
   * FAILED → fail-closed (we must never delete without a known reference set).
   */
  dbRefKeys: Set<string> | null;
  /** Reference "now" for the age window (injected for deterministic tests). */
  now: Date;
  /** Objects modified within this many days are never candidates. */
  olderThanDays: number;
  /** true only when --execute was passed. */
  execute: boolean;
  /** Value of --confirm (must equal CONFIRM_PHRASE to execute). */
  confirm: string | null;
  /**
   * Keys from the human-reviewed manifest. Required for --execute: we only
   * delete keys that were in the reviewed inventory AND still qualify now.
   * `null` = no manifest supplied.
   */
  manifestKeys: Set<string> | null;
  /** Value of --max-delete (required for --execute). */
  maxDelete: number | null;
}

export interface PlanResult {
  scope: string;
  scanned: number;
  inScope: number;
  outOfScope: number;
  dbReferenced: number;
  /** Orphan candidates after ALL safety filters (and manifest ∩ when executing). */
  candidates: R2ObjectMeta[];
  candidateBytes: number;
  /** Out-of-scope objects are reported but NEVER deletable. */
  outOfScopeSample: string[];
  /** true only if every gate passed and --execute was requested. */
  willDelete: boolean;
  aborted: boolean;
  abortReasons: string[];
  guardsPassed: string[];
}

export function inListingMediaScope(key: string): boolean {
  return LISTING_MEDIA_PREFIXES.some((p) => key.startsWith(p));
}

/**
 * Compute the cleanup plan. Deletes nothing; only decides what *would* be
 * deleted under --execute, applying every safety filter. Dry-run (execute
 * false) always yields willDelete=false.
 */
export function planOrphanDeletions(input: PlanInput): PlanResult {
  const abortReasons: string[] = [];
  const guardsPassed: string[] = [];

  // ── Fail-closed preconditions (independent of dry-run vs execute) ─────────
  if (!input.listComplete) {
    abortReasons.push('R2 object list was partial/incomplete — refusing to treat as authoritative.');
  } else {
    guardsPassed.push('R2 list complete');
  }
  if (input.dbRefKeys === null) {
    abortReasons.push('DB reference query failed — refusing to compute orphans without a known reference set.');
  } else {
    guardsPassed.push('DB reference set loaded');
  }

  const dbRef = input.dbRefKeys ?? new Set<string>();

  // ── Scope partition: only listing-media prefixes are ever deletable ──────
  const inScopeObjs = input.bucketObjects.filter((o) => inListingMediaScope(o.key));
  const outOfScopeObjs = input.bucketObjects.filter((o) => !inListingMediaScope(o.key));
  guardsPassed.push(`scoped to ${LISTING_MEDIA_PREFIXES.join(', ')} (out-of-scope objects are never candidates)`);

  // ── Candidate = in-scope AND unreferenced AND provably older than window ─
  const cutoff = new Date(input.now.getTime() - input.olderThanDays * 86_400_000);
  let candidates = inScopeObjs.filter((o) => {
    if (dbRef.has(o.key)) return false; // still referenced → keep
    if (o.lastModified === null) return false; // unknown age → fail-closed, keep
    if (o.lastModified >= cutoff) return false; // within safety window → keep
    return true;
  });
  guardsPassed.push(`age window ${input.olderThanDays}d applied (unknown-age objects excluded)`);

  // ── Execute-only gates ───────────────────────────────────────────────────
  if (input.execute) {
    if (input.confirm !== CONFIRM_PHRASE) {
      abortReasons.push(`--confirm must equal exactly "${CONFIRM_PHRASE}".`);
    } else {
      guardsPassed.push('confirmation phrase matched');
    }
    if (input.manifestKeys === null) {
      abortReasons.push('--manifest is required for --execute (delete only reviewed keys).');
    } else {
      // Only delete keys that were in the reviewed manifest AND still qualify.
      candidates = candidates.filter((o) => input.manifestKeys!.has(o.key));
      guardsPassed.push('intersected with reviewed manifest');
    }
    if (input.maxDelete === null) {
      abortReasons.push('--max-delete N is required for --execute.');
    } else if (candidates.length > input.maxDelete) {
      abortReasons.push(`candidate count ${candidates.length} exceeds --max-delete ${input.maxDelete}.`);
    } else {
      guardsPassed.push(`within --max-delete ${input.maxDelete}`);
    }
    if (candidates.length > SANITY_THRESHOLD) {
      abortReasons.push(
        `candidate count ${candidates.length} exceeds sanity threshold ${SANITY_THRESHOLD} — manual re-approval required.`,
      );
    }
  }

  const aborted = abortReasons.length > 0;
  const willDelete = input.execute && !aborted && candidates.length > 0;

  return {
    scope: `listing-media prefixes only: ${LISTING_MEDIA_PREFIXES.join(', ')}`,
    scanned: input.bucketObjects.length,
    inScope: inScopeObjs.length,
    outOfScope: outOfScopeObjs.length,
    dbReferenced: dbRef.size,
    candidates,
    candidateBytes: candidates.reduce((s, o) => s + o.size, 0),
    outOfScopeSample: outOfScopeObjs.slice(0, 25).map((o) => o.key),
    willDelete,
    aborted,
    abortReasons,
    guardsPassed,
  };
}
