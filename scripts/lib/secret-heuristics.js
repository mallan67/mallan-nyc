/**
 * Secret-scanning heuristics for `npm run idx:validate` (section 13).
 *
 * WHY THIS FILE EXISTS
 *
 * The base64 rule used to live inline in scripts/idx-validate.js as:
 *
 *     /['"][A-Za-z0-9+\/=]{40,}['"]/
 *
 * `/` is a member of the base64 alphabet, so that rule matched a slash-
 * delimited list of Cotality field names in lib/search/canonical/field-registry.ts:
 *
 *     'SourceSystemName/SourceSystemID/SourceSystemKey/OriginatingSystemName/…'
 *
 * and idx:validate exited 1 on a critical that contained no secret. An ignored
 * red is how a real red gets ignored later, so it is fixed rather than waived.
 *
 * ENTROPY WAS MEASURED AND REJECTED as the discriminator:
 *
 *     the false positive (110-char field list)   H = 4.11 bits/char
 *     a genuine 64-char hex API key              H = 3.98 bits/char
 *
 * The false positive scores HIGHER than a real secret, so any threshold that
 * clears the field list also clears hex keys. Entropy separates random from
 * English; it does not separate "secret" from "identifier list".
 *
 * WORD SHAPE separates them. A field/enum list decomposes into delimiter-
 * separated tokens that are English-shaped words; a random secret does not.
 *
 * AN EARLIER VERSION OF THIS FILE WAS WRONG, AND THE CORRECTION IS THE POINT.
 * It tested only "PascalCase, alphanumeric, has a lowercase" and asserted in
 * this header that the rule was narrow enough that "adding slashes to a secret
 * cannot excuse it". Adversarial review falsified that by MEASUREMENT rather
 * than argument, and the measurement is preserved in isWordShaped() below.
 * Nothing here should be trusted because it sounds right; the Monte Carlo in
 * tests/runtime/step2-secret-scanner-trust.test.ts re-proves it every run.
 */

/** Chars a base64/hex/token secret can be built from — the candidate alphabet. */
const CANDIDATE = /['"]([A-Za-z0-9+/=]{40,})['"]/g;

/** One identifier token: starts uppercase, LETTERS ONLY (no digits). */
const IDENTIFIER_TOKEN = /^[A-Z][A-Za-z]*$/;

/** Delimiters a human uses between field names. NOT a secret's alphabet. */
const LIST_DELIMITERS = /[/,|]/;

// 'y' counts as a vowel here. Without it "System", "Monthly" and "Key" read as
// consonant clusters and real Cotality field lists get flagged as secrets — the
// exact false positive this file exists to remove. Parameters below were chosen
// by sweeping both error rates, not by taste; see isWordShaped().
const VOWELS = /[aeiouyAEIOUY]/g;
const CONSONANT_RUN = /[^aeiouyAEIOUY]{6,}/;

/**
 * Is this token shaped like a word a person wrote, rather than random bytes?
 *
 * THE MEASUREMENT THAT FORCED THIS TEST TO EXIST.
 *
 * The first version of this file required only that a token be PascalCase and
 * alphanumeric with a lowercase somewhere. `/` is a NATIVE member of the base64
 * alphabet, so real secrets arrive already containing slashes — no attacker has
 * to add any. A Monte Carlo over `crypto.randomBytes(n).toString('base64')`
 * showed genuine, unmodified secret output clearing every condition by chance:
 *
 *     base64(48 bytes), 64 chars    0.217 % silently missed
 *     base64(32 bytes), unpadded    0.160 % silently missed
 *     30 bytes / 40 chars (AWS)     0.124 % silently missed
 *     64-char hex                   0.000 % missed (digits protect it)
 *     padded base64 (ends '=')      0.000 % missed (the '=' check protects it)
 *
 * Roughly 1 in 500–800 real random secrets was dropped, and the exposure landed
 * exactly on the UNPADDED shapes: AWS secret access keys, NEXTAUTH_SECRET, JWT
 * signing keys. A scanner that misses 1 in 700 AWS keys is a weakened scanner.
 *
 * So token shape became word-aware. Three independent requirements, each of
 * which random base64 fails far more often than English does:
 *
 *   LETTERS ONLY        a random base64 token almost always carries a digit
 *   VOWEL RATIO >= 0.25 English compound identifiers are vowel-rich
 *                       ("SourceSystemName"); base64 is 12/64 vowels ≈ 18.8 %
 *   NO 6+ CONSONANT RUN "XXPbfwGke" is not a word; "SystemName" is
 *
 * THE THRESHOLDS WERE SWEPT, NOT CHOSEN. Both error directions were measured
 * across the grid {vowels with/without y} x {run 4,5,6} x {ratio .20,.25,.30},
 * scoring false negatives over 600,000 generated secrets and false positives
 * over real Cotality field/enum lists from this repo. Result:
 *
 *     run>=4, no 'y'   0 false negatives   but only 1 of 5 real lists cleared
 *     run>=5, with 'y' 0 false negatives   but only 4 of 5 real lists cleared
 *     run>=6, with 'y' 0 false negatives   5 of 5 real lists cleared   <- chosen
 *
 * Every cell scored zero false negatives, so the ratio was set to the TIGHTER
 * 0.25 rather than 0.20: given equal safety, prefer the rule that excuses less.
 *
 * This is a HEURISTIC and it fails toward reporting. A field list that does not
 * look like words gets flagged as a possible secret — noisy, but the safe
 * direction for a scanner whose job is to never miss a credential.
 */
function isWordShaped(token) {
  if (!IDENTIFIER_TOKEN.test(token)) return false;
  if (!/[a-z]/.test(token)) return false;
  if (CONSONANT_RUN.test(token)) return false;
  const vowels = (token.match(VOWELS) || []).length;
  return vowels / token.length >= 0.25;
}

/**
 * True when the candidate is a human-written list of identifiers rather than a
 * secret. ALL FIVE conditions are required:
 *
 *   1. it carries no '+' or '=' — base64's plus and padding never appear in a
 *      field list, so their presence alone keeps a candidate under suspicion
 *   2. it splits into >= 3 tokens on a list delimiter
 *   3. every token is >= 3 chars and WORD-SHAPED (see isWordShaped)
 *   4. digits are < 15 % of the string (identifier lists are nearly digit-free)
 *   5. tokens are letters-only, enforced inside isWordShaped
 */
function looksLikeIdentifierList(value) {
  if (/[+=]/.test(value)) return false;

  const tokens = value.split(LIST_DELIMITERS).filter(Boolean);
  if (tokens.length < 3) return false;

  const everyTokenIsAWord = tokens.every((t) => t.length >= 3 && isWordShaped(t));
  if (!everyTokenIsAWord) return false;

  const digits = (value.match(/[0-9]/g) || []).length;
  return digits / value.length < 0.15;
}

/** True when a 40+ char candidate should be reported as a possible secret. */
function isLikelySecret(value) {
  if (typeof value !== 'string' || value.length < 40) return false;
  if (!/^[A-Za-z0-9+/=]+$/.test(value)) return false;
  return !looksLikeIdentifierList(value);
}

/**
 * Every quoted 40+ char candidate in `content` that survives the exclusion.
 *
 * Returns the matched STRINGS, not just a boolean, so the validator can name
 * what it found. The old inline rule reported only the file and the rule name,
 * which is precisely why this false positive sat unresolved.
 */
function findSecretCandidates(content) {
  if (typeof content !== 'string') return [];
  const found = [];
  for (const match of content.matchAll(CANDIDATE)) {
    if (isLikelySecret(match[1])) found.push(match[1]);
  }
  return found;
}

module.exports = { isLikelySecret, findSecretCandidates, looksLikeIdentifierList, isWordShaped };
