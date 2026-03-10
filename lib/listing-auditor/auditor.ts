/**
 * Listing Quality Auditor — pre-submission validation against REBNY RLS rules
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

export interface AuditIssue {
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rule?: string;
}

export interface AuditResult {
  listing_id: string;
  score: number;
  passed: boolean;
  issues: AuditIssue[];
  warnings: AuditIssue[];
  field_count: number;
  filled_count: number;
  photo_count: number;
}

// Required REBNY fields for submission
const REQUIRED_FIELDS = [
  { key: 'listing_type', label: 'Listing Type' },
  { key: 'property_type', label: 'Property Type' },
  { key: 'list_price', label: 'List Price' },
  { key: 'status', label: 'Status' },
  { key: 'borough', label: 'Borough' },
  { key: 'neighborhood', label: 'Neighborhood' },
  { key: 'postal_code', label: 'Postal Code' },
];

const RECOMMENDED_FIELDS = [
  { key: 'bedrooms_total', label: 'Bedrooms' },
  { key: 'bathrooms_full', label: 'Bathrooms' },
  { key: 'living_area', label: 'Living Area (sqft)' },
  { key: 'property_sub_type', label: 'Property Sub Type' },
];

// Fair Housing prohibited terms (from UCBA 2026)
const FAIR_HOUSING_PATTERNS = [
  /\b(exclusive|prestigious)\s+neighborhood\b/i,
  /\b(traditional|ethnic)\s+community\b/i,
  /\b(walking distance to|near)\s+(church|synagogue|mosque|temple)\b/i,
  /\bfamily[\s-]friendly\b/i,
  /\badult[\s-](only|community|living)\b/i,
  /\bno[\s-]children\b/i,
  /\bmaster\s+(bedroom|suite|bath)\b/i,
  /\bexecutive\s+neighborhood\b/i,
];

/**
 * Audit a listing for quality and compliance.
 */
export async function auditListing(listingId: string): Promise<AuditResult> {
  const listing = await prisma.listing.findUnique({
    where: { listing_id: listingId },
  });

  if (!listing) throw new Error('Listing not found');

  const issues: AuditIssue[] = [];
  const warnings: AuditIssue[] = [];
  const data = listing as Record<string, unknown>;

  // Count fields
  const fieldKeys = Object.keys(data).filter(k => !['id', 'created_at', 'updated_at', 'raw_data'].includes(k));
  const fieldCount = fieldKeys.length;
  const filledCount = fieldKeys.filter(k => data[k] !== null && data[k] !== '' && data[k] !== undefined).length;

  // Check required fields
  for (const { key, label } of REQUIRED_FIELDS) {
    if (!data[key] || data[key] === '' || data[key] === null) {
      issues.push({
        field: key,
        severity: 'error',
        message: `${label} is required for RLS submission`,
        rule: 'REBNY Data Quality',
      });
    }
  }

  // Check recommended fields
  for (const { key, label } of RECOMMENDED_FIELDS) {
    if (!data[key] || data[key] === null) {
      warnings.push({
        field: key,
        severity: 'warning',
        message: `${label} is recommended for better listing quality`,
      });
    }
  }

  // Address validation
  const address = data.address as Record<string, string> | null;
  if (!address || (!address.StreetNumber && !address.StreetName)) {
    issues.push({
      field: 'address',
      severity: 'error',
      message: 'Street address is required',
      rule: 'REBNY Data Quality',
    });
  }

  // Price validation
  const price = Number(data.list_price);
  if (price <= 0) {
    issues.push({
      field: 'list_price',
      severity: 'error',
      message: 'List price must be greater than zero',
      rule: 'REBNY Data Quality',
    });
  }
  if (data.listing_type === 'sale' && price < 10000) {
    warnings.push({
      field: 'list_price',
      severity: 'warning',
      message: 'Sale price appears unusually low',
    });
  }

  // Photo count
  const media = data.media as unknown[];
  const photoCount = Array.isArray(media) ? media.length : 0;
  if (photoCount === 0) {
    issues.push({
      field: 'media',
      severity: 'error',
      message: 'At least 1 photo is required for RLS submission',
      rule: 'REBNY Media Requirements',
    });
  } else if (photoCount < 5) {
    warnings.push({
      field: 'media',
      severity: 'warning',
      message: `Only ${photoCount} photos — 5+ recommended for better engagement`,
    });
  }

  // Fair Housing scan on description fields
  const features = data.features as Record<string, unknown> | null;
  const description = features?.PublicRemarks as string || '';
  for (const pattern of FAIR_HOUSING_PATTERNS) {
    if (pattern.test(description)) {
      issues.push({
        field: 'description',
        severity: 'error',
        message: `Fair Housing violation: contains "${description.match(pattern)?.[0]}"`,
        rule: 'Fair Housing Act / NYC Human Rights Law',
      });
    }
  }

  // Distribution gate consistency
  if (data.owner_opt_out && data.idx_display_yn) {
    issues.push({
      field: 'distribution',
      severity: 'error',
      message: 'Owner Opt-Out listings cannot have IDX display enabled',
      rule: 'REBNY RLS Distribution',
    });
  }

  // Compute score (100 - deductions)
  const errorDeduction = issues.length * 10;
  const warningDeduction = warnings.length * 3;
  const photoBonus = Math.min(10, photoCount * 2);
  const completenessBonus = Math.round((filledCount / fieldCount) * 30);
  const score = Math.max(0, Math.min(100, 60 + completenessBonus + photoBonus - errorDeduction - warningDeduction));

  const result: AuditResult = {
    listing_id: listingId,
    score,
    passed: issues.length === 0,
    issues,
    warnings,
    field_count: fieldCount,
    filled_count: filledCount,
    photo_count: photoCount,
  };

  // Persist audit
  await prisma.listingAudit.create({
    data: {
      listing_id: listingId,
      agent_id: listing.agent_id,
      score,
      passed: issues.length === 0,
      issues: issues as unknown as Prisma.InputJsonValue,
      warnings: warnings as unknown as Prisma.InputJsonValue,
      field_count: fieldCount,
      filled_count: filledCount,
      photo_count: photoCount,
    },
  });

  return result;
}

/**
 * Batch audit all active listings.
 */
export async function batchAudit(): Promise<{ audited: number; failed: number }> {
  const listings = await prisma.listing.findMany({
    where: { status: 'Active' },
    select: { listing_id: true },
  });

  let audited = 0;
  let failed = 0;

  for (const { listing_id } of listings) {
    try {
      const result = await auditListing(listing_id);
      if (!result.passed) failed++;
      audited++;
    } catch (err) {
      console.warn(`[listing-auditor] Failed to audit ${listing_id}:`, err);
    }
  }

  return { audited, failed };
}
