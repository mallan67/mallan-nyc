import type { PortalEvent } from "@prisma/client";

type JsonObject = Record<string, unknown>;

const TENANT_SIGNAL_TYPES = new Set([
  "tenant_rental_link_saved",
  "tenant_rent_vs_buy_signal",
  "tenant_lease_timing_update",
  "tenant_document_readiness_update",
]);

const LANDLORD_SIGNAL_TYPES = new Set([
  "landlord_vacancy_cost_estimate",
  "landlord_relist_signal",
  "landlord_document_readiness_update",
  "landlord_showing_workflow_update",
]);

function objectValue(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(/[$,%\s,]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function boolValue(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["true", "yes", "1"].includes(value.toLowerCase())) return true;
    if (["false", "no", "0"].includes(value.toLowerCase())) return false;
  }
  return null;
}

export function normalizeTenantSignalPayload(input: Record<string, unknown>) {
  const monthlyRent = numberValue(input.monthly_rent);
  const targetPurchasePrice = numberValue(input.target_purchase_price);
  const monthlyOwnershipBudget = numberValue(input.monthly_ownership_budget);
  const leaseEndDate = stringValue(input.lease_end_date);
  const moveTiming = stringValue(input.move_timing);
  const leaseIntent = stringValue(input.lease_intent);
  const documentReadiness = stringValue(input.document_readiness);
  const outsideRentalUrl = stringValue(input.outside_rental_url);
  const outsideRentalAddress = stringValue(input.outside_rental_address);
  const notes = stringValue(input.notes);

  return {
    monthly_rent: monthlyRent,
    target_purchase_price: targetPurchasePrice,
    monthly_ownership_budget: monthlyOwnershipBudget,
    lease_end_date: leaseEndDate,
    move_timing: moveTiming,
    lease_intent: leaseIntent,
    document_readiness: documentReadiness,
    outside_rental_url: outsideRentalUrl,
    outside_rental_address: outsideRentalAddress,
    notes,
  };
}

export function normalizeLandlordSignalPayload(input: Record<string, unknown>) {
  const monthlyRent = numberValue(input.monthly_rent);
  const expectedVacancyDays = numberValue(input.expected_vacancy_days);
  const monthlyCarryingCost = numberValue(input.monthly_carrying_cost);
  const leaseEndDate = stringValue(input.lease_end_date);
  const relistTiming = stringValue(input.relist_timing);
  const tenantRenewalIntent = stringValue(input.tenant_renewal_intent);
  const documentReadiness = stringValue(input.document_readiness);
  const showingReadiness = stringValue(input.showing_readiness);
  const ownerNotes = stringValue(input.owner_notes);
  const listingId = stringValue(input.listing_id);
  const vacantNow = boolValue(input.vacant_now);
  const vacancyCost = expectedVacancyDays !== null
    ? (monthlyRent ?? monthlyCarryingCost ?? 0) / 30 * expectedVacancyDays
    : null;

  return {
    listing_id: listingId,
    monthly_rent: monthlyRent,
    expected_vacancy_days: expectedVacancyDays,
    monthly_carrying_cost: monthlyCarryingCost,
    estimated_vacancy_cost: vacancyCost,
    lease_end_date: leaseEndDate,
    relist_timing: relistTiming,
    tenant_renewal_intent: tenantRenewalIntent,
    document_readiness: documentReadiness,
    showing_readiness: showingReadiness,
    vacant_now: vacantNow,
    owner_notes: ownerNotes,
  };
}

function latestByType(
  events: Pick<PortalEvent, "id" | "event_type" | "metadata" | "created_at" | "listing_id">[],
  allowedTypes: Set<string>,
) {
  const relevant = events
    .filter((event) => allowedTypes.has(event.event_type))
    .sort((a, b) => b.created_at.getTime() - a.created_at.getTime());

  const latest: Record<string, JsonObject & { recorded_at?: string; id?: string }> = {};
  for (const event of relevant) {
    if (latest[event.event_type]) continue;
    latest[event.event_type] = {
      ...objectValue(event.metadata),
      id: event.id.toString(),
      listing_id: event.listing_id ?? stringValue(objectValue(event.metadata).listing_id),
      recorded_at: event.created_at.toISOString(),
    };
  }

  return { relevant, latest };
}

export function summarizeTenantSignals(
  events: Pick<PortalEvent, "id" | "event_type" | "metadata" | "created_at" | "listing_id">[],
) {
  const { relevant, latest } = latestByType(events, TENANT_SIGNAL_TYPES);
  const rentalLink = latest.tenant_rental_link_saved || {};
  const rentVsBuy = latest.tenant_rent_vs_buy_signal || {};
  const leaseTiming = latest.tenant_lease_timing_update || {};
  const docs = latest.tenant_document_readiness_update || {};

  return {
    event_count: relevant.length,
    last_signal_at: relevant[0]?.created_at ?? null,
    latest_rental_link: rentalLink,
    latest_rent_vs_buy: rentVsBuy,
    latest_lease_timing: leaseTiming,
    latest_document_readiness: docs,
    monthly_rent: numberValue(rentVsBuy.monthly_rent) ?? numberValue(leaseTiming.monthly_rent),
    target_purchase_price: numberValue(rentVsBuy.target_purchase_price),
    monthly_ownership_budget: numberValue(rentVsBuy.monthly_ownership_budget),
    lease_end_date: stringValue(leaseTiming.lease_end_date),
    move_timing: stringValue(leaseTiming.move_timing),
    lease_intent: stringValue(leaseTiming.lease_intent),
    document_readiness: stringValue(docs.document_readiness),
    recent_events: relevant.slice(0, 20).map((event) => ({
      id: event.id.toString(),
      event_type: event.event_type,
      listing_id: event.listing_id,
      metadata: objectValue(event.metadata),
      recorded_at: event.created_at,
    })),
  };
}

export function summarizeLandlordSignals(
  events: Pick<PortalEvent, "id" | "event_type" | "metadata" | "created_at" | "listing_id">[],
) {
  const { relevant, latest } = latestByType(events, LANDLORD_SIGNAL_TYPES);
  const vacancy = latest.landlord_vacancy_cost_estimate || {};
  const relist = latest.landlord_relist_signal || {};
  const docs = latest.landlord_document_readiness_update || {};
  const showing = latest.landlord_showing_workflow_update || {};

  return {
    event_count: relevant.length,
    last_signal_at: relevant[0]?.created_at ?? null,
    latest_vacancy_cost: vacancy,
    latest_relist_signal: relist,
    latest_document_readiness: docs,
    latest_showing_workflow: showing,
    monthly_rent: numberValue(vacancy.monthly_rent) ?? numberValue(relist.monthly_rent),
    expected_vacancy_days: numberValue(vacancy.expected_vacancy_days),
    estimated_vacancy_cost: numberValue(vacancy.estimated_vacancy_cost),
    lease_end_date: stringValue(relist.lease_end_date),
    relist_timing: stringValue(relist.relist_timing),
    tenant_renewal_intent: stringValue(relist.tenant_renewal_intent),
    document_readiness: stringValue(docs.document_readiness),
    showing_readiness: stringValue(showing.showing_readiness),
    recent_events: relevant.slice(0, 20).map((event) => ({
      id: event.id.toString(),
      event_type: event.event_type,
      listing_id: event.listing_id,
      metadata: objectValue(event.metadata),
      recorded_at: event.created_at,
    })),
  };
}

export const RENTAL_SIGNAL_EVENT_TYPES = [
  ...TENANT_SIGNAL_TYPES,
  ...LANDLORD_SIGNAL_TYPES,
];
