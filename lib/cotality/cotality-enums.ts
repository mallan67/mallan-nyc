// Single import point for Cotality enum truth. Backed by data/cotality-enums.live.json,
// which is GENERATED from the live Cotality $metadata (`npm run cotality:pull`) and guarded
// against drift by `npm run cotality:verify`. Do NOT hardcode status/field/picklist lists
// elsewhere — import from here (AGENTS.md §1 invariant 7, Maya law 2026-07-05).
import authority from '@/data/cotality-enums.live.json';

export const COTALITY_ENUMS: Readonly<Record<string, readonly string[]>> = authority.enums;

/** Live Cotality StandardStatus (the only OData-filterable status field). */
export const STANDARD_STATUS: readonly string[] = COTALITY_ENUMS.StandardStatus ?? [];
/** Live MlsStatus (NOT OData-filterable / provider-suppressed). */
export const MLS_STATUS: readonly string[] = COTALITY_ENUMS.MlsStatus ?? [];
export const PERMISSION: readonly string[] = COTALITY_ENUMS.Permission ?? [];
export const PROPERTY_TYPE: readonly string[] = COTALITY_ENUMS.PropertyType ?? [];
export const PROPERTY_SUB_TYPE: readonly string[] = COTALITY_ENUMS.PropertySubType ?? [];

export const isLiveStandardStatus = (v: string): boolean => STANDARD_STATUS.includes(v);
export const isLivePermission = (v: string): boolean => PERMISSION.includes(v);
export const isLivePropertyType = (v: string): boolean => PROPERTY_TYPE.includes(v);
export const isLivePropertySubType = (v: string): boolean => PROPERTY_SUB_TYPE.includes(v);

/** Returns the live members for any Cotality enum, or [] if the name is unknown. */
export const cotalityEnum = (name: string): readonly string[] => COTALITY_ENUMS[name] ?? [];
