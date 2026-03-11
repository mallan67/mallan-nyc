// lib/utils/safe-bigint.ts
// Safe BigInt conversion for route parameter IDs.
// Prevents NaN, precision loss, and crashes from non-numeric strings.

/**
 * Safely parse a string into BigInt for Prisma ID lookups.
 * Returns null if the input is not a valid positive integer
 * or exceeds Number.MAX_SAFE_INTEGER (which could lose precision
 * when passed through parseInt/Number).
 */
export function safeBigInt(value: string | undefined | null): bigint | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Must be all digits (no decimals, negatives, or non-numeric chars)
  if (!/^\d+$/.test(trimmed)) return null;
  // Check Number.isSafeInteger for values that went through Number()
  const num = Number(trimmed);
  if (!Number.isSafeInteger(num) || num <= 0) return null;
  return BigInt(num);
}
