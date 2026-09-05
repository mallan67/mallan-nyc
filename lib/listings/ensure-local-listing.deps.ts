/**
 * Dependencies of ensure-local-listing, re-exported so tests can mock the DB while keeping the
 * canonical gate and the live status vocabulary REAL.
 */
export { computeGateColumns } from "@/lib/idx/trestle-mapper";
export { resolveMember, STANDARD_STATUS_MEMBERS } from "@/lib/search/engine/criteria";
