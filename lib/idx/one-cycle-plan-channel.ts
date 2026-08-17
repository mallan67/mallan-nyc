import { AsyncLocalStorage } from 'node:async_hooks';
import type { OneCycleExecutionPlan } from '@/lib/idx/one-cycle-preflight';

/**
 * INTERNAL channel carrying the One Cycle execution plan from the preflight to
 * the orchestrator.
 *
 * WHY THIS EXISTS RATHER THAN A REQUEST PARAMETER
 *
 * The first implementation of the execution plan passed it as `?plan=` on the
 * request the preflight forwarded to One Cycle. That was wrong even though the
 * route requires the cron bearer token: it made MEMBER SELECTION a
 * caller-supplied input. Anything that could reach the route could ask for a
 * narrowed cycle, and a narrowed cycle deliberately skips a member — so a
 * caller could suppress the listing sync or the media sync by adding a query
 * string. Trusted internal state must not make a round trip through an
 * untrusted-shaped surface and come back trusted.
 *
 * An AsyncLocalStorage scope cannot be set by a caller. It exists only for the
 * duration of the preflight's own invocation, on the server, in-process.
 *
 * FAIL-CLOSED IN BOTH DIRECTIONS
 *
 *   - Outside any scope — every direct HTTP request to One Cycle, a manual
 *     operator GET, a re-run — `currentExecutionPlan()` returns `full_safety`,
 *     the COMPLETE machine. Absence of a plan never means "run less".
 *   - Inside a scope set to `skip`, it also returns `full_safety`. Reaching the
 *     orchestrator at all means a run was intended, so honouring "skip" there
 *     would run zero members and report a vacuous success. The preflight
 *     returns before importing the route when it genuinely skips.
 *
 * Node runtime only, which is what this route uses (`force-dynamic`,
 * `maxDuration`, Prisma and `node:crypto` imports).
 */
const planStore = new AsyncLocalStorage<OneCycleExecutionPlan>();

/** The complete machine — the value every uncertainty resolves to. */
const FAIL_CLOSED_PLAN: OneCycleExecutionPlan = 'full_safety';

/**
 * Run `fn` with `plan` visible to One Cycle.
 *
 * Only the preflight calls this, and only with a plan it derived itself from a
 * trusted comparison against known prior state.
 */
export function runWithExecutionPlan<T>(
  plan: OneCycleExecutionPlan,
  fn: () => Promise<T>,
): Promise<T> {
  return planStore.run(plan === 'skip' ? FAIL_CLOSED_PLAN : plan, fn);
}

/**
 * The plan for the current execution, or `full_safety` when there is no scope.
 *
 * One Cycle calls this instead of reading anything off the request.
 */
export function currentExecutionPlan(): OneCycleExecutionPlan {
  return planStore.getStore() ?? FAIL_CLOSED_PLAN;
}
