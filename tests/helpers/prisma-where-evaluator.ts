/**
 * A tiny Prisma `where` evaluator for BEHAVIOURAL tests.
 *
 * Owner review 2026-09-09: *"replace critical source-regex assertions with behavioral tests that execute the
 * affected query/projection and inspect results."* A test that greps a route for `idx_display_yn` cannot tell a
 * `where` clause from a `select` list — that exact confusion produced a false pass in this repo. This module lets
 * a test take the `where` a route actually built, run it over fixture rows, and assert on which rows come back.
 *
 * It supports exactly the operators our predicates use. Anything unrecognised THROWS rather than defaulting to
 * "matches", so a new clause can never silently evaluate to "selects everything" and turn a real regression green.
 */

export type Row = Record<string, unknown>;

function matchesCondition(value: unknown, cond: unknown, field: string): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond !== 'object') return value === cond;
  const c = cond as Record<string, unknown>;
  for (const [op, operand] of Object.entries(c)) {
    switch (op) {
      case 'equals': if (!matchesCondition(value, operand, field)) return false; break;
      case 'not': if (matchesCondition(value, operand, field)) return false; break;
      case 'in': if (!Array.isArray(operand) || !operand.includes(value as never)) return false; break;
      case 'notIn': if (Array.isArray(operand) && operand.includes(value as never)) return false; break;
      case 'startsWith': if (typeof value !== 'string' || !value.startsWith(String(operand))) return false; break;
      case 'contains': if (typeof value !== 'string' || !value.includes(String(operand))) return false; break;
      case 'lte': if (!(value instanceof Date) || value.getTime() > (operand as Date).getTime()) return false; break;
      case 'lt': if (!(value instanceof Date) || value.getTime() >= (operand as Date).getTime()) return false; break;
      case 'gte': if (!(value instanceof Date) || value.getTime() < (operand as Date).getTime()) return false; break;
      case 'gt': if (!(value instanceof Date) || value.getTime() <= (operand as Date).getTime()) return false; break;
      default: throw new Error(`prisma-where-evaluator: unsupported operator "${op}" on field "${field}"`);
    }
  }
  return true;
}

/** TRUE when `row` satisfies the Prisma `where` clause. Supports AND / OR / NOT nesting. */
export function matchesWhere(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (key === 'AND') {
      if (!(cond as Record<string, unknown>[]).every((w) => matchesWhere(row, w))) return false;
    } else if (key === 'OR') {
      if (!(cond as Record<string, unknown>[]).some((w) => matchesWhere(row, w))) return false;
    } else if (key === 'NOT') {
      if (matchesWhere(row, cond as Record<string, unknown>)) return false;
    } else if (!matchesCondition(row[key], cond, key)) {
      return false;
    }
  }
  return true;
}

/** Convenience: the subset of `rows` the `where` selects. */
export function selectRows<T extends Row>(rows: T[], where: Record<string, unknown> | undefined): T[] {
  return rows.filter((r) => matchesWhere(r, where));
}
