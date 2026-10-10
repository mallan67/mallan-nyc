/**
 * Cotality Property resource — raw field accessors.
 *
 * This is the Cotality Property raw-contract boundary: it reads exactly what the live
 * Property resource sends, with zero business, compliance, or display logic. The three
 * provider-derived mappers (lib/idx/trestle-mapper.ts, lib/idx/mapping.ts,
 * lib/search/crm-idx-mapper.ts) are legacy components being converged onto this boundary,
 * not extended further — new raw-field accessors belong here, not inside any of them.
 * Downstream Mallan canonical storage and Mallan/REBNY business-rule normalization (e.g.
 * lib/compliance/status.ts, which uses its own Mallan-side vocabulary and must stay a
 * separate, later layer) never happen in this module.
 */

/**
 * The live Property.StandardStatus value, exactly as Cotality sent it — trimmed, never
 * substituted with MlsStatus, never defaulted to a fabricated value. Returns null when the
 * field is absent or empty; callers decide how to fail closed (reject the row, display an
 * UNKNOWN/suppressed state, etc.) — this function never invents a status.
 *
 * Scope note (corrected 2026-10-02): global live $metadata declares 11 StandardStatus
 * members and 26 MlsStatus members (MlsStatus's global set DOES include Incomplete —
 * confirmed live via trestle_get_picklist; an earlier draft of this comment wrongly said it
 * did not). The vocabularies genuinely differ at Mallan's actual RLS-associated subset,
 * which is the scope that matters here: RLS StandardStatus = 11 values (Active,
 * ActiveUnderContract, Canceled, Closed, ComingSoon, Delete, Expired, Hold, Incomplete,
 * Pending, Withdrawn); RLS MlsStatus = 9 values (the same list minus ActiveUnderContract
 * and Incomplete). Master Plan §0.6: "StandardStatus and MlsStatus exposed separate
 * picklists and behaved as separate fields. Neither is derived from the other... Never
 * substitute one for the other." Live $metadata declares StandardStatus nullable; the
 * field has zero null rows in current live population, but that population fact does not
 * authorize treating a future missing value as "Active" — Active is itself a specific
 * provider-asserted business state (on market, no accepted offer), not a safe default for
 * "unknown."
 */
export function readCotalityStandardStatus(raw: Record<string, unknown>): string | null {
  const value = raw.StandardStatus;
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * The live Property.Permission value, exactly as Cotality sent it — split into its
 * individual flag members. Nothing else.
 *
 * Permission's live type is `Cotality.DataStandard.RESO.DD.Enums.Multi.ListingPermission`
 * — a comma-separated Multi-Enum, `IsFlags="true"` (confirmed live via
 * trestle_lookup_field, 2026-10-02 Permission Multi-Enum cutover). Live rows already
 * serialize combinations: "IDX,OfficeInactive", "IDX,SyndicateOptOut",
 * "IDX,SyndicateOptOut,OfficeInactive". Exact equality against the whole string
 * (`Permission === 'Private'`) is therefore structurally wrong for this field type — it
 * only matches a row where Private is the SOLE flag set, silently missing every row where
 * Private is combined with anything else. Use `hasCotalityListingPermission` below for the
 * correct exact-member check; never substring-match (`'Private'` must not match a
 * hypothetical future value containing it as a substring) and never re-derive this by hand
 * at a call site.
 *
 * Reads `Permission` (singular) ONLY. `Permissions` (plural) does not exist on live
 * Property at all (confirmed via trestle_validate_field) — it is never a raw-Cotality
 * fallback here. A plural `Permissions` key appearing in application data is legitimately
 * Mallan CRM/form-internal (lib/compliance/normalizer.ts, lib/compliance/
 * rls-enforcement.ts's agent-submitted payload) — a completely separate layer this
 * function must not read.
 *
 * Returns an empty array when the field is absent/empty — callers decide how to treat "no
 * members" (never invented, never defaulted to a member being present).
 *
 * Current RLS-associated Lookup (narrower than the 18-value global enum — do not blend the
 * two scopes): IDX, OfficeInactive, Private, Public, SyndicateOptOut.
 */
export function readCotalityListingPermissions(raw: Record<string, unknown>): readonly string[] {
  const value = raw.Permission;
  if (value == null) return [];
  return String(value)
    .split(',')
    .map((member) => member.trim())
    .filter((member) => member.length > 0);
}

/**
 * Exact-member check against the live Permission Multi-Enum — `permissions contains
 * 'Private'`, never `Permission === 'Private'` and never a substring match. See
 * `readCotalityListingPermissions`'s docstring for why exact equality is wrong for this
 * field type.
 */
export function hasCotalityListingPermission(raw: Record<string, unknown>, member: string): boolean {
  return readCotalityListingPermissions(raw).includes(member);
}

/**
 * The live Property.PropertySubType value, exactly as Cotality sent it. Nothing else.
 *
 * PropertySubType's live type is a plain single-value Enum (NOT a Multi-Enum) — confirmed
 * via trestle_lookup_field/trestle_validate_field, 2026-10-02 PropertySubType cutover.
 * PropertySubTypeAdditional is a genuinely separate Multi-Enum field; this function must
 * never read it, and must never substitute PropertyType when PropertySubType is absent —
 * those are three distinct fields with three distinct contracts.
 *
 * Current RLS-associated Lookup (narrower than the full global enum — do not blend the two
 * scopes): Apartment, Duplex, Loft, MixedUse, MultiFamily, Office, Retail,
 * SingleFamilyResidence, Townhouse, Triplex. Live population (2026-10-02, a moving count,
 * not a constant) includes 21 null rows and 0 current Townhouse rows — both are real
 * provider states, not evidence of a broken field.
 *
 * Returns the raw value verbatim — never lowercased, never translated to a Mallan display
 * label. Mallan display/business-rule mapping is a separate, later concern; see the
 * MALLAN_BUSINESS_RULE_UNRESOLVED notes at this function's call sites (lib/search/
 * crm-idx-mapper.ts's mapDisplayPropertyType, lib/idx/public-dto.ts's
 * mapPropertyTypeToDisplay) for why SingleFamilyResidence's display label is not decided
 * here.
 */
export function readCotalityPropertySubType(raw: Record<string, unknown>): string | null {
  const value = raw.PropertySubType;
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

/**
 * The live Property.CommonInterest value, exactly as Cotality sent it. Nothing else.
 *
 * `CommonInterest` is only the raw Cotality field key at this boundary. Do not use the
 * field name itself as a Mallan property-classification concept.
 *
 * Current REBNY RLS listing-entry rules use this raw field for the ownership-type choice:
 * Condominium, StockCooperative, Condop, RentalBuilding, or None. The broader live Cotality
 * Lookup catalog can expose additional raw values; reads preserve whatever Cotality actually
 * sends, while current RLS add/edit choices are enforced later by the REBNY/Mallan form rule.
 *
 * OwnershipType is a separate Property field and is never a fallback. Never substitute
 * PropertyType or PropertySubType. null means absent provider data; "None" is a literal
 * provider value. They are not interchangeable.
 *
 * Returns the raw value verbatim — never translated to a Mallan display label.
 */
export function readCotalityCommonInterest(raw: Record<string, unknown>): string | null {
  const value = raw.CommonInterest;
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}
