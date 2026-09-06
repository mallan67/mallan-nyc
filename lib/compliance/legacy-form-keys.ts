/**
 * Legacy Mallan FORM keys that once carried distribution decisions.
 *
 * These names are NOT Cotality Property fields (none exists on the live resource — verified
 * against the dated live field pull). They survive only in old Mallan-authored raw_data and in
 * historical client payloads. The public DTO shedder classifies them as control fields so an old
 * row can never leak one through a public surface. They must never appear in a provider map,
 * a $select list, or a new client payload.
 */
export const LEGACY_MALLAN_FORM_CONTROL_KEYS: ReadonlySet<string> = new Set([
  "IDXEntireListingDisplayYN",
  "IDXAutomatedValuationDisplayYN",
  "IDXParticipationYN",
  "ParticipantOnlyYN",
  "VOWEntireListingDisplayYN",
  "VOWAutomatedValuationDisplayYN",
  "VOWConsumerCommentYN",
  "SyndicateYN",
]);
