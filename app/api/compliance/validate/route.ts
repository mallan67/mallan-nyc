/**
 * REBNY RLS Compliance Validation API
 *
 * POST /api/compliance/validate
 *
 * Validates listing data against:
 * - REBNY RLS Data Rules (2025_LMP migration)
 * - RESO standards via Trestle Web API
 * - NYC regulations (NY DOS advertising, Fair Housing Act)
 *
 * Input: JSON listing object
 * Output: { valid: boolean, errors: string[], suggestions: string[], enhancedData?: Record }
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateListing, getRequiredFields, generatePublicRemarks } from '@/lib/compliance/rebny-validator';
import { requireAgentOrBroker } from '@/lib/auth/middleware';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // Auth required — only agents/broker can validate listings
    const authResult = await requireAgentOrBroker(request);
    if (authResult instanceof NextResponse) return authResult;

    const body = await request.json();

    // Validate request structure
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        {
          valid: false,
          errors: ['Invalid request: Expected JSON object with listing data'],
          warnings: [],
          suggestions: [],
          compliance: {
            rebnyRls: false,
            reso: false,
            fairHousing: false,
            nycDos: false,
          },
        },
        { status: 400 }
      );
    }

    // Extract listing data (support nested or flat structure)
    const listing = body.listing || body;

    // Run validation
    const result = validateListing(listing);

    // Add metadata
    const response = {
      ...result,
      _meta: {
        validatedAt: new Date().toISOString(),
        rulesVersion: '2025_LMP',
        fieldsChecked: result.fieldResults.length,
        complianceStandards: ['REBNY RLS', 'RESO', 'Fair Housing Act', 'NY DOS'],
      },
    };

    return NextResponse.json(response, {
      status: result.valid ? 200 : 422,
    });
  } catch (error) {
    console.error('Validation error:', error);
    return NextResponse.json(
      {
        valid: false,
        errors: ['Internal validation error: ' + (error instanceof Error ? error.message : 'Unknown error')],
        warnings: [],
        suggestions: [],
        compliance: {
          rebnyRls: false,
          reso: false,
          fairHousing: false,
          nycDos: false,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/compliance/validate?propertyType=Residential&commonInterest=Condominium
 *
 * Returns list of required fields for the given property type
 */
export async function GET(request: NextRequest) {
  try {
    // Auth required — only agents/broker can access compliance rules
    const authResult = await requireAgentOrBroker(request);
    if (authResult instanceof NextResponse) return authResult;

    const { searchParams } = new URL(request.url);
    const propertyType = searchParams.get('propertyType') || 'Residential';
    const commonInterest = searchParams.get('commonInterest') || undefined;
    const action = searchParams.get('action');

    // Return required fields
    if (action === 'requiredFields' || !action) {
      const requiredFields = getRequiredFields(propertyType, commonInterest);

      return NextResponse.json({
        propertyType,
        commonInterest,
        requiredFields,
        totalRequired: requiredFields.length,
        _meta: {
          rulesVersion: '2025_LMP',
          complianceStandards: ['REBNY RLS', 'RESO'],
        },
      });
    }

    // Generate template public remarks
    if (action === 'generateRemarks') {
      // Parse any provided listing data from query params
      const listing: Record<string, unknown> = {};
      for (const [key, value] of searchParams.entries()) {
        if (!['action', 'propertyType', 'commonInterest'].includes(key)) {
          listing[key] = value;
        }
      }
      listing.PropertyType = propertyType;
      if (commonInterest) listing.CommonInterest = commonInterest;

      const remarks = generatePublicRemarks(listing);

      return NextResponse.json({
        generatedRemarks: remarks,
        isFairHousingCompliant: true,
        _meta: {
          note: 'Generated remarks are Fair Housing compliant. Review before use.',
        },
      });
    }

    return NextResponse.json(
      { error: 'Unknown action. Use: requiredFields, generateRemarks' },
      { status: 400 }
    );
  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
