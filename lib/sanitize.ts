/**
 * Input sanitization utilities for Socrata SODA / OData query parameters.
 *
 * Prevents SoQL / OData injection by stripping dangerous characters
 * and validating numeric inputs before they reach query strings.
 */

/**
 * Sanitize a string value for use in SoQL $where clauses.
 * Allows alphanumeric, spaces, hyphens, periods, commas, and apostrophes (escaped).
 * Strips everything else (parentheses, semicolons, quotes, etc.).
 */
export function sanitizeString(input: string): string {
  // First, trim whitespace
  let clean = input.trim();
  // Remove any characters that are not alphanumeric, space, hyphen, period, comma, or apostrophe
  clean = clean.replace(/[^a-zA-Z0-9 \-.,'']/g, '');
  // Escape single quotes for SoQL (double them)
  clean = clean.replace(/'/g, "''");
  return clean;
}

/**
 * Sanitize a string value for use in OData $filter clauses.
 * Same as sanitizeString but also escapes single quotes for OData.
 */
export function sanitizeOData(input: string): string {
  let clean = input.trim();
  // Remove any characters that are not alphanumeric, space, hyphen, period, comma, or apostrophe
  clean = clean.replace(/[^a-zA-Z0-9 \-.,'']/g, '');
  // Escape single quotes for OData (double them)
  clean = clean.replace(/'/g, "''");
  return clean;
}

/**
 * Validate and return a numeric string (digits only, optionally with leading zeros).
 * Returns null if the input contains non-numeric characters.
 */
export function sanitizeNumeric(input: string): string | null {
  const clean = input.trim();
  if (!/^\d+$/.test(clean)) return null;
  return clean;
}

/**
 * Validate and return a BBL string (10 digits, or 1-5-4 with hyphens).
 * Returns null if invalid.
 */
export function sanitizeBBL(input: string): string | null {
  const clean = input.trim();
  // Accept 10-digit BBL
  if (/^\d{10}$/.test(clean)) return clean;
  // Accept hyphenated format: 1-12345-1234
  if (/^\d{1}-\d{5}-\d{4}$/.test(clean)) return clean;
  // Accept loose hyphenated format: 1-234-56 (will be padded by caller)
  if (/^\d{1,2}-\d{1,5}-\d{1,4}$/.test(clean)) return clean;
  return null;
}

/**
 * Validate a borough code (single digit 1-5).
 * Returns null if invalid.
 */
export function sanitizeBorough(input: string): string | null {
  const clean = input.trim();
  if (/^[1-5]$/.test(clean)) return clean;
  return null;
}

/**
 * Sanitize a BIN (Building Identification Number) — 7 digits.
 * Returns null if invalid.
 */
export function sanitizeBIN(input: string): string | null {
  const clean = input.trim();
  if (!/^\d{1,10}$/.test(clean)) return null;
  return clean;
}

/**
 * Sanitize a document ID for ACRIS queries — alphanumeric only.
 * Returns null if it contains non-alphanumeric characters.
 */
export function sanitizeDocumentId(input: string): string | null {
  const clean = input.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(clean)) return null;
  return clean;
}

/**
 * Escape HTML special characters to prevent XSS in email templates.
 * Converts &, <, >, ", and ' to their HTML entity equivalents.
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
