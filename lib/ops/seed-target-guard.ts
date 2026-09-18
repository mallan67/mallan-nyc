/**
 * Seed target policy — may `prisma/seed.ts` write to the database it is pointed at?
 *
 * WHY THE SEED NEEDS ITS OWN GATE. `prisma/seed.ts` upserts the brokerage's real agent rows, and
 * the UPDATE branch of each upsert rewrites `password_hash`. `upsert` is not "create if missing":
 * when the row exists it UPDATES, so a seed run against production replaces the principal broker's
 * live credential with whatever `SEED_BROKER_PASSWORD` holds in the operator's `.env.local`. The
 * seed had no target check at all, and `vercel env pull` defaults to Development — an environment
 * that, in this project, can still resolve to the production database.
 *
 * THE RULE IS POSITIVE, NOT NEGATIVE. Seeding requires a target that is POSITIVELY recognised as an
 * approved non-production authority. "Not canonical production" is not sufficient and never becomes
 * sufficient: an unknown host, a typo'd host, the stale morning-bread database and an unrelated
 * Postgres instance are all non-production, and none of them is a database this repository has
 * agreed to overwrite.
 *
 * THE PRESENT-TENSE CONSEQUENCE. `APPROVED_NONPRODUCTION_ENDPOINTS` in lib/ops/db-target.ts is
 * empty, because no verified Mallan Development or Preview Neon authority exists yet. So this guard
 * currently refuses EVERYWHERE, and the seed cannot run anywhere. That is the intended reading of
 * "a missing approved non-production authority means STOP" — the resolution is to verify and
 * declare such a target, never to relax the rule or borrow production for an afternoon.
 *
 * SHAPE. `decideSeedTarget` is a pure function from a reconciliation result to a typed
 * verdict + reason. It performs no I/O, reads no environment, and knows nothing about processes,
 * exit codes or HTTP. `assertSeedTargetAllowed` is the thin adapter that reads an environment and
 * throws. Keeping them apart is what lets every branch — the ALLOW branch included — be proven
 * without a database and without inventing a target that does not exist.
 *
 * @module lib/ops/seed-target-guard
 */
import {
  reconcileDbTargets,
  type DbTargetClass,
  type DbTargetReconciliation,
} from "@/lib/ops/db-target";

/** Seeding is permitted against this authority and no other. */
export const SEED_REQUIRED_AUTHORITY: DbTargetClass = "approved-nonproduction";

export type SeedTargetVerdict = {
  allowed: boolean;
  /** Why. Never contains a connection URL or a credential. */
  reason: string;
};

/** Appended to every refusal so the operator is pointed at the fix, not just the wall. */
const RESOLUTION =
  "Resolution: verify a dedicated non-production Neon database and declare its endpoint in " +
  "APPROVED_NONPRODUCTION_ENDPOINTS (lib/ops/db-target.ts). Never point a seed at production, " +
  "and never treat an unrecognised target as a substitute for an approved one.";

/**
 * Decide whether the seed may write, given a reconciliation of the configured targets.
 *
 * Pure. Every refusal names WHICH condition failed, because "refused" without a reason is how an
 * operator talks themselves into removing the guard.
 */
export function decideSeedTarget(reconciliation: DbTargetReconciliation): SeedTargetVerdict {
  if (reconciliation.verdict === "undetermined") {
    return {
      allowed: false,
      reason:
        `Refusing to seed: the database target is undeterminable (${reconciliation.reason}). ` +
        `An undeterminable target is refused, never assumed. ${RESOLUTION}`,
    };
  }

  if (reconciliation.verdict === "mixed") {
    return {
      allowed: false,
      reason:
        `Refusing to seed: the configured database variables disagree, so no single authority ` +
        `can be established (${reconciliation.reason}). ${RESOLUTION}`,
    };
  }

  switch (reconciliation.authority) {
    case "canonical-production":
      return {
        allowed: false,
        reason:
          "Refusing to seed: the configured database is the CANONICAL PRODUCTION database. " +
          "prisma/seed.ts upserts the brokerage's real agent rows, and the update branch rewrites " +
          "password_hash — seeding production would overwrite the live broker and agent " +
          `credentials with the values in SEED_BROKER_PASSWORD / SEED_AGENT_PASSWORD. ${RESOLUTION}`,
      };

    case "forbidden-stale":
      return {
        allowed: false,
        reason:
          "Refusing to seed: the configured database is the STALE / DO-NOT-SERVE morning-bread " +
          `database (ep-royal-dawn-ad6eh8t2). ${RESOLUTION}`,
      };

    case "approved-nonproduction":
      return {
        allowed: true,
        reason:
          "Permitted: the configured database is a verified approved non-production authority" +
          `${reconciliation.identity ? ` (${reconciliation.identity})` : ""}.`,
      };

    case "unknown":
    default:
      return {
        allowed: false,
        reason:
          "Refusing to seed: the configured database could not be recognised as an approved " +
          `non-production authority (${reconciliation.reason}). Being unrecognised is not ` +
          `evidence of being safe — an unknown host is refused exactly like a production one. ` +
          `${RESOLUTION}`,
      };
  }
}

/**
 * Read the environment, apply the policy, and throw on refusal.
 *
 * The adapter half. It decides that a refusal becomes a thrown Error — a CLI's equivalent of a
 * closed door — while the policy itself stays free of any opinion about processes or transports.
 */
export function assertSeedTargetAllowed(env: Record<string, string | undefined>): void {
  const verdict = decideSeedTarget(reconcileDbTargets(env));
  if (!verdict.allowed) {
    throw new Error(verdict.reason);
  }
}
