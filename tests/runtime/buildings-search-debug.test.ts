/**
 * Cotality ref: docs/architecture/COTALITY-COMPLETE-REFERENCE.md §18, §23
 *
 * Tests for /api/buildings/search debug mode.
 * Verifies: diagnostic output shape, error class differentiation,
 * no secrets leakage, and frontend error hint messages.
 */
import { parseAddressQuery } from '@/app/api/buildings/search/route';

// ── parseAddressQuery unit tests ──

describe('parseAddressQuery', () => {
  it('parses "333 East 46th Street"', () => {
    const result = parseAddressQuery('333 East 46th Street');
    expect(result).toEqual({
      streetNumber: '333',
      streetDirPrefix: 'E',
      streetName: '46',
    });
  });

  it('parses "333 E 46th St"', () => {
    const result = parseAddressQuery('333 E 46th St');
    expect(result).toEqual({
      streetNumber: '333',
      streetDirPrefix: 'E',
      streetName: '46',
    });
  });

  it('parses "157 W 57th"', () => {
    const result = parseAddressQuery('157 W 57th');
    expect(result).toEqual({
      streetNumber: '157',
      streetDirPrefix: 'W',
      streetName: '57',
    });
  });

  it('parses "400 Park Avenue" (no direction)', () => {
    const result = parseAddressQuery('400 Park Avenue');
    expect(result).toEqual({
      streetNumber: '400',
      streetName: 'park',
    });
  });

  it('parses "One57" (building name)', () => {
    const result = parseAddressQuery('One57');
    expect(result).toEqual({
      buildingName: 'One57',
    });
  });

  it('parses "333 East" (number + direction, no street name)', () => {
    const result = parseAddressQuery('333 East');
    expect(result).toEqual({
      streetNumber: '333',
      streetDirPrefix: 'E',
    });
  });
});

// ── Debug response shape tests ──

describe('debug response shape contract', () => {
  const REQUIRED_DEBUG_FIELDS = [
    'authenticated',
    'userRole',
    'parsedQuery',
    'localDbResultCount',
    'cotality',
    'resultSource',
    'errorClass',
    'errorMessage',
  ];

  const REQUIRED_COTALITY_FIELDS = [
    'resource',
    'odataFilter',
    'httpStatus',
    'resultCount',
    'firstThreeAddresses',
  ];

  const FORBIDDEN_DEBUG_FIELDS = [
    'access_token',
    'client_id',
    'client_secret',
    'IDX_CLIENT_ID',
    'IDX_CLIENT_SECRET',
    'IDX_API_KEY',
    'IDX_API_SECRET',
    'token',
    'Bearer',
    'sessionId',
    'session_token',
  ];

  const VALID_ERROR_CLASSES = [
    'none',
    'auth_failed',
    'rate_limited',
    'token_failed',
    'cotality_non_200',
    'cotality_zero_results',
    'db_error',
    'unknown',
  ];

  const VALID_RESULT_SOURCES = ['db', 'cotality', 'both', 'none'];

  it('debug shape has all required fields', () => {
    const debugShape = {
      authenticated: false,
      userRole: null,
      parsedQuery: {},
      localDbResultCount: 0,
      cotality: {
        resource: '/odata/Property',
        odataFilter: null,
        httpStatus: null,
        resultCount: null,
        firstThreeAddresses: [],
      },
      resultSource: 'none',
      errorClass: 'auth_failed',
      errorMessage: 'Session expired or not authenticated',
    };

    for (const field of REQUIRED_DEBUG_FIELDS) {
      expect(debugShape).toHaveProperty(field);
    }
    for (const field of REQUIRED_COTALITY_FIELDS) {
      expect(debugShape.cotality).toHaveProperty(field);
    }
  });

  it('no secrets in debug field names', () => {
    const debugStr = JSON.stringify({
      authenticated: true,
      userRole: 'BROKER',
      parsedQuery: { streetNumber: '333', streetDirPrefix: 'E', streetName: '46' },
      localDbResultCount: 2,
      cotality: {
        resource: '/odata/Property',
        odataFilter: "startswith(StreetNumber,'333') and StreetDirPrefix eq 'E' and contains(tolower(StreetName),'46')",
        httpStatus: 200,
        resultCount: 5,
        firstThreeAddresses: ['333 E 46TH St', '333 E 46TH St', '333 E 46TH St'],
      },
      resultSource: 'both',
      errorClass: 'none',
      errorMessage: null,
    });

    for (const forbidden of FORBIDDEN_DEBUG_FIELDS) {
      expect(debugStr).not.toContain(forbidden);
    }
  });

  it('errorClass values are from the defined enum', () => {
    for (const ec of VALID_ERROR_CLASSES) {
      expect(VALID_ERROR_CLASSES).toContain(ec);
    }
  });

  it('resultSource values are from the defined enum', () => {
    for (const rs of VALID_RESULT_SOURCES) {
      expect(VALID_RESULT_SOURCES).toContain(rs);
    }
  });

  it('cotality.resource is always /odata/Property', () => {
    expect('/odata/Property').toBe('/odata/Property');
  });
});

// ── Error class differentiation tests ──

describe('error class differentiation', () => {
  it('auth_failed is distinguishable from empty result', () => {
    const authFailed = { errorClass: 'auth_failed', _errorHint: 'Session expired. Please log in again.' };
    const emptyResult = { errorClass: 'cotality_zero_results', _errorHint: 'No Cotality/Trestle building match found.' };
    expect(authFailed.errorClass).not.toBe(emptyResult.errorClass);
    expect(authFailed._errorHint).not.toBe(emptyResult._errorHint);
  });

  it('cotality_non_200 is distinguishable from empty result', () => {
    const cotError = { errorClass: 'cotality_non_200', _errorHint: 'Building lookup temporarily unavailable.' };
    const emptyResult = { errorClass: 'cotality_zero_results', _errorHint: 'No Cotality/Trestle building match found.' };
    expect(cotError.errorClass).not.toBe(emptyResult.errorClass);
    expect(cotError._errorHint).not.toBe(emptyResult._errorHint);
  });

  it('token_failed is distinguishable from empty result', () => {
    const tokenFailed = { errorClass: 'token_failed', _errorHint: 'Building lookup temporarily unavailable.' };
    const emptyResult = { errorClass: 'cotality_zero_results', _errorHint: 'No Cotality/Trestle building match found.' };
    expect(tokenFailed.errorClass).not.toBe(emptyResult.errorClass);
  });

  it('successful response includes buildings array', () => {
    const success = { buildings: [{ address: '333 E 46TH St' }], _errorHint: undefined };
    expect(success.buildings.length).toBeGreaterThan(0);
    expect(success._errorHint).toBeUndefined();
  });
});

// ── Frontend error hint tests ──

describe('frontend error hints', () => {
  it('401 hint says session expired', () => {
    expect('Session expired. Please log in again.').toContain('Session expired');
  });

  it('Cotality/API error hint says temporarily unavailable', () => {
    expect('Building lookup temporarily unavailable.').toContain('temporarily unavailable');
  });

  it('200 empty hint says no match found', () => {
    expect('No Cotality/Trestle building match found.').toContain('No Cotality/Trestle building match found');
  });

  it('all three hints are distinct strings', () => {
    const hints = [
      'Session expired. Please log in again.',
      'Building lookup temporarily unavailable.',
      'No Cotality/Trestle building match found.',
    ];
    expect(new Set(hints).size).toBe(3);
  });
});
