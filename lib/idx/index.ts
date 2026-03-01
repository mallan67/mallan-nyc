/**
 * IDX Integration Module
 *
 * COMPLIANCE CRITICAL - READ BEFORE IMPORTING:
 *
 * This module provides IDX/MLS data access for REBNY RLS compliance.
 *
 * REQUIREMENTS:
 * - Server-side use ONLY (will throw if imported client-side)
 * - IDX_ENABLED=true environment variable
 * - Valid IDX_CLIENT_ID and IDX_CLIENT_SECRET credentials
 * - All access is logged for audit purposes
 *
 * PROHIBITED:
 * - Client-side imports (use 'use server' or API routes only)
 * - Public JSON endpoints exposing MLS data
 * - AI/ML training with MLS data
 * - Bulk export or redistribution
 *
 * @module lib/idx
 */

// Re-export types (safe for client-side type imports)
export type {
  IDXListing,
  IDXFetchResult,
  IDXConfig,
  IDXAuditLogEntry,
  IDXSyncResult,
  TrestleAuthToken,
  TrestleRawListing,
} from './types';

// Re-export client functions (server-side only)
export {
  fetchListings,
  fetchListingById,
  isIDXAvailable,
  getIDXStatus,
  logAccessDenied,
  IDXError,
} from './client';

// Re-export mapping utilities
export {
  RESO_FIELDS,
  FIELD_MAP,
  REBNY_REQUIRED_DISPLAY_FIELDS,
  REBNY_ATTRIBUTION_TEMPLATE,
  generateAttributionText,
  mapRESOToInternal,
  validateRESOResponse,
  ALL_RLS_FIELDS,
  REQUIRED_RLS_FIELDS,
  RESO_TO_RLS_RENAMES,
} from './mapping';

// Re-export logging utilities
export {
  logIDXAccess,
  createAuditEntry,
  logFetchAttempt,
} from './logger';

// Re-export auth utilities
export {
  getAccessToken,
  hasCredentials,
  invalidateToken,
} from './auth';

// Re-export fetch utilities
export {
  fetchFromTrestle,
  fetchSingleListing,
  buildIncrementalFilter,
  buildActiveFilter,
} from './fetch';

// Re-export mapper
export {
  mapTrestleToPrisma,
  checkDistributionGates,
  validateRequiredFields,
  getFieldProfile,
} from './trestle-mapper';

// Re-export sync
export {
  syncListings,
  getLastSyncTimestamp,
  getSyncStats,
} from './sync';
