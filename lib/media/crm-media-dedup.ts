// lib/media/crm-media-dedup.ts
// Pure helpers for the SL-0004 media de-dup / cover script. Kept out of the
// script file so they are unit-testable WITHOUT loading .env.local or Prisma.
//
// The `--cover=N` argument selects the hero photo. It must be validated BEFORE
// any DB write: a bad value (e.g. `--cover=abc` → NaN) must never reach the
// write loop, where it would set preferred_photo_yn=false on every photo and
// leave the listing with no hero. (Codex review on PR #286, 2026-05-30.)

/**
 * Parse a raw `--cover=` value into a positive integer, or report why it's bad.
 * Accepts ONLY a non-empty string of digits (`"1"`, `"15"`). Rejects empty,
 * non-numeric (`"abc"`, `"NaN"`), decimals (`"1.5"`), signs (`"-1"`, `"+1"`),
 * and anything with whitespace inside.
 *
 * @param rawValue the substring after `--cover=` (or undefined when the flag is absent)
 * @returns `{ cover: null, error: null }` when absent; `{ cover, error: null }`
 *          when valid; `{ cover: null, error }` when malformed.
 */
export function parseCoverArg(rawValue: string | undefined): { cover: number | null; error: string | null } {
  if (rawValue === undefined) return { cover: null, error: null };
  const v = rawValue.trim();
  if (!/^\d+$/.test(v)) {
    return { cover: null, error: `--cover must be a positive integer (got "${rawValue}")` };
  }
  return { cover: parseInt(v, 10), error: null };
}

/**
 * Range-check a parsed cover against the photo count. Returns an error string
 * when out of range, else null. `cover === null` (flag absent) is always OK.
 */
export function validateCover(cover: number | null, photoCount: number): string | null {
  if (cover === null) return null;
  if (!Number.isInteger(cover) || !Number.isFinite(cover)) {
    return `--cover must be a finite integer (got ${cover})`;
  }
  if (cover < 1) return `--cover must be >= 1 (got ${cover})`;
  if (cover > photoCount) return `--cover=${cover} is out of range (1..${photoCount})`;
  return null;
}

/**
 * Build the preferred_photo_yn map for a cover selection. EXACTLY one Photo
 * (the cover, 1-based into `orderedPhotoIds`) becomes true; every other photo
 * is false; floor plans / non-photos are ALWAYS false. Ids are compared as
 * strings so BigInt and string ids interoperate.
 *
 * Caller MUST have validated `cover` (see validateCover) — out-of-range here
 * yields an all-false map, which is why validation gates the write.
 */
export function computePreferredMap(
  orderedPhotoIds: Array<bigint | string>,
  floorPlanIds: Array<bigint | string>,
  cover: number,
): Map<string, boolean> {
  const map = new Map<string, boolean>();
  orderedPhotoIds.forEach((id, i) => map.set(String(id), i === cover - 1));
  for (const id of floorPlanIds) map.set(String(id), false);
  return map;
}
