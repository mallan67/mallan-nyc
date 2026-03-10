import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';

/**
 * POST /api/favorites/sync
 *
 * Captures email from visitors who save favorites.
 * Creates/updates a Lead record and optionally creates a SavedSearch
 * with alerts enabled.
 *
 * TCPA: wantAlerts is a separate opt-in (unchecked by default).
 * The email capture itself is transactional (saving favorites), not marketing.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { email, name, favorites, wantAlerts } = body as {
      email: string;
      name?: string;
      favorites: Array<{ id: string; listingType: 'sale' | 'rent' }>;
      wantAlerts: boolean;
    };

    // Validate required fields
    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please provide a valid email address' },
        { status: 400 }
      );
    }

    if (!Array.isArray(favorites) || favorites.length === 0) {
      return NextResponse.json(
        { error: 'At least one favorite listing is required' },
        { status: 400 }
      );
    }

    // Parse optional name
    const nameParts = (name || '').trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Determine roles from favorite listing types
    const listingTypes = new Set(favorites.map(f => f.listingType));
    const roles: string[] = [];
    if (listingTypes.has('sale')) roles.push('buyer');
    if (listingTypes.has('rent')) roles.push('renter');
    if (roles.length === 0) roles.push('buyer');

    // Upsert lead
    const lead = await prisma.lead.upsert({
      where: { email: email.toLowerCase().trim() },
      create: {
        first_name: firstName,
        last_name: lastName,
        email: email.toLowerCase().trim(),
        phone: '',
        roles,
        status: 'new',
        source: 'favorites',
      },
      update: {
        // Update name only if provided and lead has no name yet
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
        updated_at: new Date(),
      },
    });

    // If wantAlerts opted in, create a SavedSearch based on favorite types
    if (wantAlerts) {
      const searchType = listingTypes.has('sale') && !listingTypes.has('rent')
        ? 'sale'
        : listingTypes.has('rent') && !listingTypes.has('sale')
          ? 'rent'
          : 'all';

      const criteria = {
        type: searchType,
        favoriteListingIds: favorites.map(f => f.id),
      };

      await prisma.savedSearch.create({
        data: {
          lead_id: lead.id,
          name: 'Similar to saved properties',
          criteria: criteria as Prisma.InputJsonValue,
          alert_enabled: true,
          alert_frequency: 'weekly',
          alert_email: email.toLowerCase().trim(),
        },
      });
    }

    // Log audit event
    await prisma.auditEvent.create({
      data: {
        action: 'favorites_email_captured',
        entity_type: 'lead',
        entity_id: lead.id.toString(),
        user_type: 'public',
        user_id: null,
        changes: {
          favorite_count: favorites.length,
          favorite_ids: favorites.map(f => f.id),
          want_alerts: wantAlerts || false,
          source: 'favorites_sync',
          submitted_at: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Favorites synced successfully',
    });
  } catch (err) {
    console.error('[/api/favorites/sync] Error:', err);
    return NextResponse.json(
      { error: 'Failed to save. Please try again.' },
      { status: 500 }
    );
  }
}
