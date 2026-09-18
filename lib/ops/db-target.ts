/**
 * The neutral database-target classifier / reconciler (DB Safety Packet 1, item 1).
 *
 * WHY A FOUR-WAY CLASSIFICATION REPLACES A BOOLEAN. Every database guard in this repository asks
 * "is the target the canonical production host?" and answers `true` / `false`. That shape cannot
 * distinguish the two things an operator most needs distinguished:
 *
 *   - `false` for the STALE royal-dawn database, which must be refused loudly, and
 *   - `false` for an unrecognised host, which must ALSO be refused — but which a reader of
 *     `!isCanonical(url)` naturally interprets as "fine, it isn't production".
 *
 * "Not canonical production" is therefore never a synonym for "safe": an unknown host, a typo, a
 * stale database and an unrelated Postgres instance all land in the same false bucket. This module
 * returns a NAMED class instead, so the caller must decide what each class entitles.
 *
 * WHY THERE IS NO SECOND AUTHORITY HERE. This is an EXTRACTION, not a new system. The parsed-host
 * logic is lifted from `assertCanonicalHost` (lib/retention/drain-core.ts), which is the stronger of
 * the repository's two host checks; the URL enumeration is lifted from `resolveDatabaseUrls`
 * (scripts/recover-stale-property-listings.ts). Both of those, and the weaker substring check in
 * lib/ops/canonical-neon-target.ts, are rewired to delegate here in the same change.
 *
 * ONE EXECUTION MIRROR EXISTS, AND IT IS NOT AN EXCEPTION TO THAT.
 * `scripts/ci/assert-canonical-neon-target.mjs` runs inside `rotate-db-keys.yml` BEFORE any
 * dependency install, so it cannot import this module and carries its own copy of the host rule.
 * The honest description is therefore not "one implementation" but:
 *
 *   this module  = canonical application target semantics (the authority)
 *   the CI guard = pre-bootstrap execution mirror of those semantics
 *
 * The mirror is not permitted to hold a different interpretation of canonical / stale / unknown
 * host identity, and that is enforced by tests rather than by intent — the CLI ↔ TS parity block in
 * tests/runtime/canonical-neon-target.test.ts asserts both sides and asserts they agree on every
 * case. No third parser may be introduced.
 *
 * PARSED HOSTNAME, NEVER SUBSTRING. `drain-core.ts` already recorded the reason: the canonical
 * string can appear in a query parameter (`?application_name=ep-cold-waterfall-adno3ao2`), in the
 * password, or in the path, so `url.includes(CANONICAL)` can be satisfied by a host that is not
 * canonical at all. The endpoint id is read as the first label of the PARSED hostname and compared
 * by equality.
 *
 * NO APPROVED NON-PRODUCTION TARGET IS INVENTED. `APPROVED_NONPRODUCTION_ENDPOINTS` ships EMPTY
 * because no verified Mallan Development or Preview Neon authority exists at this commit. The class
 * exists so that a future verified target has a place to be declared; hardcoding a placeholder to
 * make a test green would write a fiction into the authority itself.
 *
 * PURE AND SYNCHRONOUS — no request, no OIDC, no network, no Prisma, no HTTP semantics. It reports
 * WHAT the target is. Whether a given class may proceed in a given context is policy, and whether a
 * refusal becomes a 503, an error boundary or a non-zero exit is an adapter's decision. Neither
 * lives here.
 *
 * @module lib/ops/db-target
 */

/** Canonical production Neon endpoint — hidden-mountain-87248164 / "neon-green-school". */
export const CANONICAL_PRODUCTION_ENDPOINT = "ep-cold-waterfall-adno3ao2";

/** STALE / DO-NOT-SERVE endpoint — morning-bread-68708332 / "mallandb". Refused by name. */
export const FORBIDDEN_STALE_ENDPOINT = "ep-royal-dawn-ad6eh8t2";

/**
 * Verified non-production Neon endpoints that may be written to outside production.
 *
 * DELIBERATELY EMPTY. There is no verified Mallan Development/Preview Neon authority to name yet,
 * and "non-canonical" is not evidence of one. Until an entry is added here from measured Neon
 * state, nothing classifies as `approved-nonproduction` and every non-canonical target is `unknown`
 * — which refuses.
 */
export const APPROVED_NONPRODUCTION_ENDPOINTS: readonly string[] = [];

/** Every Neon host carries this suffix. An endpoint id on another domain is not a Neon target. */
export const NEON_HOST_SUFFIX = ".neon.tech";

/** Neon's pooled variant of an endpoint — the same database, a different connection mode. */
const POOLER_SUFFIX = "-pooler";

/**
 * The connection variables Prisma actually reads. BARE NAMES ONLY.
 *
 * The Marketplace integration also publishes `database_DATABASE_URL` and friends. Those are
 * deliberately NOT mapped onto the bare names (see lib/prisma.ts and NEON.md), so enumerating them
 * here would be the first step toward the silent mapping that keeps Preview fail-closed today.
 */
export const PRISMA_DB_URL_VARS = ["DATABASE_URL", "DATABASE_URL_UNPOOLED"] as const;

/**
 * WHY a target classified as it did, as a stable token rather than prose.
 *
 * Two things need this. Adapters must distinguish "undeterminable" (`not-configured`,
 * `malformed-url`, `no-host`) from "determined and wrong" (`forbidden-stale`,
 * `unrecognised-endpoint`) - both refuse, but only the first means the operator has configured
 * nothing at all. And the legacy wrappers over this core have their own long-standing error
 * messages to preserve; a code lets them map a refusal to their own wording without re-parsing the
 * URL or string-matching on `reason`.
 */
export type DbTargetReasonCode =
  | "canonical-production"
  | "approved-nonproduction"
  | "forbidden-stale"
  | "unrecognised-endpoint"
  | "endpoint-off-neon"
  | "malformed-url"
  | "no-host"
  | "not-configured";

export type DbTargetClass =
  | "canonical-production"
  | "approved-nonproduction"
  | "forbidden-stale"
  | "unknown";

export type DbTargetClassification = {
  /** What this target IS. `unknown` is a refusal, never a permission. */
  class: DbTargetClass;
  /** WHY, as a stable token. Several codes map to `unknown`; they are not interchangeable. */
  code: DbTargetReasonCode;
  /** The full parsed hostname, or null when none could be read. A hostname is not a credential. */
  host: string | null;
  /** The endpoint id exactly as it appears in the host (pooler suffix intact), or null. */
  endpoint: string | null;
  /** The endpoint with any `-pooler` suffix removed: the DATABASE identity, not the route to it. */
  identity: string | null;
  /** Human-readable justification. Never contains the URL or any credential. */
  reason: string;
};

export type ClassifiedDbTarget = DbTargetClassification & {
  /** The environment-variable name this target came from. */
  name: string;
};

export type DbTargetReconciliation =
  | {
      verdict: "undetermined";
      reason: string;
      targets: readonly ClassifiedDbTarget[];
    }
  | {
      verdict: "consistent";
      /** The one class every configured target agreed on. Agreement is not entitlement. */
      authority: DbTargetClass;
      identity: string | null;
      reason: string;
      targets: readonly ClassifiedDbTarget[];
    }
  | {
      verdict: "mixed";
      reason: string;
      targets: readonly ClassifiedDbTarget[];
    };

/**
 * An `unknown` verdict still carries the endpoint identity whenever one could be read.
 *
 * This matters for reconciliation: if `unknown` discarded the identity, two unrelated Postgres
 * instances would both reduce to "no identity" and read as AGREEMENT, hiding the fact that the
 * process could write to either. Identity is null only when there genuinely is no host to read —
 * an absent, malformed, or hostless URL — and those do legitimately agree that the target is
 * undeterminable.
 */
function unknownWith(
  code: DbTargetReasonCode,
  reason: string,
  host: string | null = null,
  endpoint: string | null = null,
  identity: string | null = null,
): DbTargetClassification {
  return { class: "unknown", code, host, endpoint, identity, reason };
}

/**
 * Classify a BARE HOSTNAME. The endpoint id is the first label, compared by equality.
 *
 * Order matters: the stale endpoint is named before the canonical one and without requiring the
 * Neon suffix, so `ep-royal-dawn-ad6eh8t2` is reported as forbidden rather than merely unknown no
 * matter what domain it is dressed in. Over-refusal is the safe direction.
 */
export function classifyDbHost(host: string | null | undefined): DbTargetClassification {
  if (typeof host !== "string" || host.trim().length === 0) {
    return unknownWith("no-host", "no host supplied — the database target is undeterminable");
  }
  const normalized = host.trim().toLowerCase();
  const endpoint = normalized.split(".")[0];
  if (endpoint.length === 0) {
    return unknownWith(
      "no-host",
      "host has no leading label — no endpoint id to classify",
      normalized,
    );
  }
  const identity = endpoint.endsWith(POOLER_SUFFIX)
    ? endpoint.slice(0, -POOLER_SUFFIX.length)
    : endpoint;
  const onNeon = normalized.endsWith(NEON_HOST_SUFFIX);

  if (identity === FORBIDDEN_STALE_ENDPOINT) {
    return {
      class: "forbidden-stale",
      code: "forbidden-stale",
      host: normalized,
      endpoint,
      identity,
      reason:
        `endpoint '${endpoint}' is the STALE / DO-NOT-SERVE morning-bread database ` +
        `(${FORBIDDEN_STALE_ENDPOINT}) and is refused by name`,
    };
  }
  if (identity === CANONICAL_PRODUCTION_ENDPOINT) {
    if (!onNeon) {
      return unknownWith(
        "endpoint-off-neon",
        `endpoint '${endpoint}' matches the canonical production id but the host is not on ` +
          `${NEON_HOST_SUFFIX} — refused rather than treated as canonical`,
        normalized,
        endpoint,
        identity,
      );
    }
    return {
      class: "canonical-production",
      code: "canonical-production",
      host: normalized,
      endpoint,
      identity,
      reason: `endpoint '${endpoint}' is the canonical production Neon endpoint`,
    };
  }
  if (APPROVED_NONPRODUCTION_ENDPOINTS.includes(identity)) {
    if (!onNeon) {
      return unknownWith(
        "endpoint-off-neon",
        `endpoint '${endpoint}' matches an approved non-production id but the host is not on ` +
          `${NEON_HOST_SUFFIX} — refused rather than treated as approved`,
        normalized,
        endpoint,
        identity,
      );
    }
    return {
      class: "approved-nonproduction",
      code: "approved-nonproduction",
      host: normalized,
      endpoint,
      identity,
      reason: `endpoint '${endpoint}' is a verified approved non-production Neon endpoint`,
    };
  }
  return unknownWith(
    "unrecognised-endpoint",
    `endpoint '${endpoint}' is not a recognised Mallan database authority — refused, because ` +
      `'not canonical production' is not evidence of being safe`,
    normalized,
    endpoint,
    identity,
  );
}

/**
 * Classify a CONNECTION URL by its parsed hostname.
 *
 * A URL that will not parse, or parses without a host, is `unknown` — undeterminable is refused,
 * never assumed. The URL is never echoed into the reason: it carries credentials.
 */
export function classifyDbUrl(url: string | null | undefined): DbTargetClassification {
  if (typeof url !== "string" || url.trim().length === 0) {
    return unknownWith(
      "not-configured",
      "no connection URL configured — the database target is undeterminable",
    );
  }
  let host: string;
  try {
    host = new URL(url.trim()).hostname;
  } catch {
    return unknownWith(
      "malformed-url",
      "connection URL is malformed / unparseable — refusing to classify it",
    );
  }
  if (!host) {
    return unknownWith(
      "no-host",
      "connection URL has no host — the database target is undeterminable",
    );
  }
  return classifyDbHost(host);
}

/**
 * Every connection string this process could actually connect through.
 *
 * Extracted from `resolveDatabaseUrls`. Checking one URL is not enough: the recorded near-miss had
 * a canonical unpooled URL vouch for a STALE pooled one while every Prisma write went to the wrong
 * database. Empty and absent values are omitted rather than reported as targets.
 */
export function enumerateDbUrls(
  env: Record<string, string | undefined>,
): Array<{ name: string; url: string }> {
  return PRISMA_DB_URL_VARS.map((name) => ({ name, url: env[name] || "" })).filter(
    (e) => e.url.length > 0,
  );
}

/**
 * Classify every configured target and report whether they AGREE.
 *
 * Agreement requires both the same class and the same database identity. Requiring identity too is
 * what keeps two different unrecognised hosts from reading as one settled answer, while still
 * letting the pooled and direct forms of one endpoint agree — they are one database reached two
 * ways, and a naive hostname comparison gets that backwards.
 *
 * `mixed` is never resolved by preferring one variable. Preference is exactly how the near-miss
 * happened; disagreement is the finding.
 */
export function reconcileDbTargets(
  env: Record<string, string | undefined>,
): DbTargetReconciliation {
  const configured = enumerateDbUrls(env);
  if (configured.length === 0) {
    return {
      verdict: "undetermined",
      reason:
        `no ${PRISMA_DB_URL_VARS.join(" or ")} is configured — the database target is ` +
        `undeterminable, which is refused rather than assumed`,
      targets: [],
    };
  }

  const targets: ClassifiedDbTarget[] = configured.map(({ name, url }) => ({
    name,
    ...classifyDbUrl(url),
  }));

  const classes = new Set(targets.map((t) => t.class));
  const identities = new Set(targets.map((t) => t.identity ?? "(undeterminable)"));

  if (classes.size === 1 && identities.size === 1) {
    const [only] = targets;
    return {
      verdict: "consistent",
      authority: only.class,
      identity: only.identity,
      reason:
        `all ${targets.length} configured target(s) resolve to the same authority: ` +
        `${only.class}${only.identity ? ` (${only.identity})` : ""}`,
      targets,
    };
  }

  return {
    verdict: "mixed",
    reason:
      `configured database targets disagree, so no single authority can be established: ` +
      targets
        .map((t) => `${t.name} → ${t.class}${t.endpoint ? ` (${t.endpoint})` : ""}`)
        .join(", "),
    targets,
  };
}
