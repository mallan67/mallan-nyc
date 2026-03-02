/**
 * Claude-Powered REBNY RLS Compliance Validation API
 *
 * POST /api/compliance/validate-ai
 * Validates a listing against REBNY RLS rules using Claude AI.
 *
 * @module app/api/compliance/validate-ai/route
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  buildValidationPrompt,
  parseValidationResponse,
  getRulesVersion,
} from '@/lib/compliance';
import { requireAgentOrBroker, isAuthError } from '@/lib/auth/middleware';

// Force dynamic rendering for API routes
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await requireAgentOrBroker(request);
  if (isAuthError(auth)) return auth;
  try {
    const body = await request.json();
    const { listing } = body;

    if (!listing) {
      return NextResponse.json(
        { error: 'Missing listing data in request body' },
        { status: 400 }
      );
    }

    // Check for API key
    if (!process.env.ANTHROPIC_API_KEY) {
      // Return mock validation for development without API key
      return NextResponse.json({
        valid: false,
        errors: [
          {
            field: '_config',
            code: 'API_KEY_MISSING',
            message: 'ANTHROPIC_API_KEY not configured. Set it in .env.local',
            severity: 'error',
          },
        ],
        warnings: [],
        summary: 'Validation skipped: API key not configured',
        rulesVersion: getRulesVersion(),
        _meta: {
          aiPowered: false,
          reason: 'API key missing',
        },
      });
    }

    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Build the validation prompt
    const { systemPrompt, userMessage } = buildValidationPrompt(listing);

    // Call Claude for validation
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    });

    // Extract text response
    const responseText =
      message.content[0].type === 'text' ? message.content[0].text : '';

    // Parse the validation response
    const parsed = parseValidationResponse(responseText);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Failed to parse validation response',
          details: parsed.error,
          rawResponse: responseText,
        },
        { status: 500 }
      );
    }

    // Return successful validation result
    return NextResponse.json({
      ...parsed.result,
      rulesVersion: getRulesVersion(),
      _meta: {
        aiPowered: true,
        model: 'claude-sonnet-4-20250514',
        validatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('AI Validation error:', error);
    return NextResponse.json(
      {
        error: 'AI validation failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/compliance/validate-ai
 * Returns current rules version and validation endpoint info
 */
export async function GET() {
  const version = getRulesVersion();

  return NextResponse.json({
    endpoint: '/api/compliance/validate-ai',
    method: 'POST',
    description: 'AI-powered validation of listings against REBNY RLS rules',
    rulesVersion: version,
    aiModel: 'claude-sonnet-4-20250514',
    requestBody: {
      listing: {
        type: 'object',
        description: 'The listing data to validate (RESO or internal format)',
        required: true,
      },
    },
    responseSchema: {
      valid: 'boolean - true if listing passes all required checks',
      errors: 'array - list of validation errors with field, code, message, severity',
      warnings: 'array - list of warnings (non-blocking)',
      summary: 'string - human-readable summary',
      rulesVersion: 'object - version info of rules used',
      _meta: 'object - validation metadata',
    },
  });
}
