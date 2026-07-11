/**
 * contract-decision.ts — canonical contract result type (PURE, A1).
 *
 * The canonical package is a PURE TypeScript library: it must never depend on
 * Next.js or return HTTP responses. Capability / scope / license / value
 * violations are surfaced as a typed, discriminated `ContractDecision`. A future
 * route ADAPTER (outside lib/search/canonical) maps a failure code to HTTP
 * (UNKNOWN_CRITERION | UNSUPPORTED_CRITERION | INVALID_VALUE → 400;
 *  UNAUTHORIZED_SCOPE → 403; UNLICENSED_SOURCE → 403/422). The mapping is NOT
 * encoded here.
 *
 * Discriminated union: a success carries NO error fields; a failure carries a
 * `code`. This lets callers narrow on `.ok` with no optional-field noise.
 *
 * NOT WIRED: no runtime reader imports this in A1.
 */

export type ContractErrorCode =
  | 'UNKNOWN_CRITERION'
  | 'UNSUPPORTED_CRITERION'
  | 'UNAUTHORIZED_SCOPE'
  | 'UNLICENSED_SOURCE'
  | 'INVALID_VALUE';

export const CONTRACT_ERROR_CODES = Object.freeze([
  'UNKNOWN_CRITERION',
  'UNSUPPORTED_CRITERION',
  'UNAUTHORIZED_SCOPE',
  'UNLICENSED_SOURCE',
  'INVALID_VALUE',
] as const);

export type ContractDecision =
  | { ok: true }
  | {
      ok: false;
      code: ContractErrorCode;
      /** The offending criterion / field / scope key, when applicable. */
      criterion?: string;
      message: string;
    };

/** The single success value. Frozen so callers cannot mutate a shared result. */
export function contractOk(): ContractDecision {
  return Object.freeze({ ok: true });
}

/** Construct a typed failure decision. */
export function contractFail(
  code: ContractErrorCode,
  message: string,
  criterion?: string,
): ContractDecision {
  return Object.freeze(
    criterion === undefined
      ? { ok: false, code, message }
      : { ok: false, code, criterion, message },
  );
}

/** Narrowing guard: success. */
export function isContractOk(d: ContractDecision): d is { ok: true } {
  return d.ok === true;
}

/** Narrowing guard: failure (carries `code`/`message`). */
export function isContractFailure(
  d: ContractDecision,
): d is { ok: false; code: ContractErrorCode; criterion?: string; message: string } {
  return d.ok === false;
}

/**
 * Validate an unknown value against a known member set → typed decision.
 * Unknown/invalid enum value → INVALID_VALUE (fail loud, never silently dropped).
 */
export function assertKnownEnumValue(
  value: unknown,
  members: readonly string[],
  criterion: string,
): ContractDecision {
  if (typeof value === 'string' && members.includes(value)) return contractOk();
  return contractFail('INVALID_VALUE', `unknown value for '${criterion}'`, criterion);
}

/**
 * Validate a criterion KEY against the known canonical key set → typed decision.
 * Unknown key → UNKNOWN_CRITERION (fail loud).
 */
export function assertKnownCriterion(key: string, knownKeys: readonly string[]): ContractDecision {
  if (knownKeys.includes(key)) return contractOk();
  return contractFail('UNKNOWN_CRITERION', `unknown criterion '${key}'`, key);
}
