import type { Prisma } from "@prisma/client";
import {
  ACTIVE_DISPLAY_VALUES,
  normalizeStatus,
  type StatusValue,
} from "@/lib/compliance/status";
import {
  affirmPermission,
  evaluateDisplayGate,
  isAddressDisplayable,
  type GateResult,
  type PermissionInput,
} from "@/lib/compliance/gates";

export const SEARCH_DISPLAY_GATE: Prisma.ListingWhereInput = {
  idx_display_yn: true,
  owner_opt_out: false,
  participant_only: false,
  internet_entire_listing_display_yn: true,
};

const ACTIVE_DISPLAY_SET = new Set<StatusValue>(ACTIVE_DISPLAY_VALUES);

export function normalizeSearchStatuses(input: unknown): StatusValue[] {
  if (input === undefined || input === null) {
    return [...ACTIVE_DISPLAY_VALUES];
  }

  const rawValues = Array.isArray(input) ? input : [input];
  const statuses = rawValues
    .map((value) => normalizeStatus(value))
    .filter((value): value is StatusValue => value !== null)
    .filter((value) => ACTIVE_DISPLAY_SET.has(value));

  return [...new Set(statuses)];
}

export function buildSearchDisplayWhere(statusInput?: unknown): Prisma.ListingWhereInput {
  const statuses = normalizeSearchStatuses(statusInput);

  return {
    ...SEARCH_DISPLAY_GATE,
    status: statuses.length > 0 ? { in: statuses } : { in: [] },
  };
}

export function decideListingAccess(input: PermissionInput): GateResult {
  return evaluateDisplayGate(input);
}

export function isListingDisplayable(input: PermissionInput): boolean {
  if (!affirmPermission(input.idx_display_yn)) return false;
  return evaluateDisplayGate(input).displayable;
}

export function canDisplayListingAddress(input: PermissionInput): boolean {
  return isAddressDisplayable(input);
}
