/// <reference types="jest" />
import {
  normalizeCrmWorkflowStatus,
  mapCrmStatusToCanonicalStatus,
  isPublicDisplayStatus,
  isTerminalStatus,
  getStatusDisplayLabel,
  getStatusTransitionError,
  buildStatusPayload,
  CRM_WORKFLOW_STATUSES,
  CANONICAL_STATUSES,
} from '@/lib/crm/status-mapping';

describe('CRM status mapping — two-layer model', () => {
  describe('normalizeCrmWorkflowStatus', () => {
    test('normalizes exact match', () => {
      expect(normalizeCrmWorkflowStatus('BackOnMarket')).toBe('BackOnMarket');
      expect(normalizeCrmWorkflowStatus('Active')).toBe('Active');
      expect(normalizeCrmWorkflowStatus('Draft')).toBe('Draft');
    });

    test('normalizes case-insensitive', () => {
      expect(normalizeCrmWorkflowStatus('backonmarket')).toBe('BackOnMarket');
      expect(normalizeCrmWorkflowStatus('ACTIVE')).toBe('Active');
    });

    test('returns null for unknown', () => {
      expect(normalizeCrmWorkflowStatus('InvalidStatus')).toBeNull();
      expect(normalizeCrmWorkflowStatus('')).toBeNull();
      expect(normalizeCrmWorkflowStatus(null)).toBeNull();
      expect(normalizeCrmWorkflowStatus(undefined)).toBeNull();
    });
  });

  describe('mapCrmStatusToCanonicalStatus', () => {
    test('every CRM workflow status maps to a canonical status', () => {
      for (const status of CRM_WORKFLOW_STATUSES) {
        const canonical = mapCrmStatusToCanonicalStatus(status);
        expect(canonical).not.toBeNull();
        expect(CANONICAL_STATUSES).toContain(canonical);
      }
    });

    test('required mappings per Maya spec', () => {
      expect(mapCrmStatusToCanonicalStatus('Draft')).toBe('Draft');
      expect(mapCrmStatusToCanonicalStatus('Future')).toBe('Draft');
      expect(mapCrmStatusToCanonicalStatus('ComingSoon')).toBe('ComingSoon');
      expect(mapCrmStatusToCanonicalStatus('Active')).toBe('Active');
      expect(mapCrmStatusToCanonicalStatus('BackOnMarket')).toBe('Active');
      expect(mapCrmStatusToCanonicalStatus('OfferOut')).toBe('ActiveUnderContract');
      expect(mapCrmStatusToCanonicalStatus('OfferThruUs')).toBe('ActiveUnderContract');
      expect(mapCrmStatusToCanonicalStatus('OfferAccepted')).toBe('ActiveUnderContract');
      expect(mapCrmStatusToCanonicalStatus('ContractSigned')).toBe('Pending');
      expect(mapCrmStatusToCanonicalStatus('BoardApproved')).toBe('Pending');
      expect(mapCrmStatusToCanonicalStatus('Sold')).toBe('Sold');
      expect(mapCrmStatusToCanonicalStatus('SoldThruUs')).toBe('Sold');
      expect(mapCrmStatusToCanonicalStatus('TempOffMarket')).toBe('Hold');
      expect(mapCrmStatusToCanonicalStatus('PermOffMarket')).toBe('Withdrawn');
      expect(mapCrmStatusToCanonicalStatus('Withdrawn')).toBe('Withdrawn');
      expect(mapCrmStatusToCanonicalStatus('Expired')).toBe('Expired');
      expect(mapCrmStatusToCanonicalStatus('Hold')).toBe('Hold');
    });

    test('unknown status returns null, never sends raw to server', () => {
      expect(mapCrmStatusToCanonicalStatus('FakeStatus')).toBeNull();
      expect(mapCrmStatusToCanonicalStatus('backOnTheMarket')).toBeNull();
    });
  });

  describe('public display eligibility', () => {
    test('Active, ComingSoon, ActiveUnderContract are public-display eligible', () => {
      expect(isPublicDisplayStatus('Active')).toBe(true);
      expect(isPublicDisplayStatus('ComingSoon')).toBe(true);
      expect(isPublicDisplayStatus('ActiveUnderContract')).toBe(true);
    });

    test('Draft, Withdrawn, Expired, Sold, Hold are NOT public-display eligible', () => {
      expect(isPublicDisplayStatus('Draft')).toBe(false);
      expect(isPublicDisplayStatus('Withdrawn')).toBe(false);
      expect(isPublicDisplayStatus('Expired')).toBe(false);
      expect(isPublicDisplayStatus('Sold')).toBe(false);
      expect(isPublicDisplayStatus('Hold')).toBe(false);
      expect(isPublicDisplayStatus('Pending')).toBe(false);
      expect(isPublicDisplayStatus('Cancelled')).toBe(false);
    });
  });

  describe('terminal status detection', () => {
    test('terminal statuses', () => {
      expect(isTerminalStatus('Sold')).toBe(true);
      expect(isTerminalStatus('Withdrawn')).toBe(true);
      expect(isTerminalStatus('Expired')).toBe(true);
      expect(isTerminalStatus('Cancelled')).toBe(true);
    });

    test('non-terminal statuses', () => {
      expect(isTerminalStatus('Active')).toBe(false);
      expect(isTerminalStatus('Draft')).toBe(false);
      expect(isTerminalStatus('Pending')).toBe(false);
      expect(isTerminalStatus('Hold')).toBe(false);
    });
  });

  describe('transition validation', () => {
    test('valid transitions return null', () => {
      expect(getStatusTransitionError('Draft', 'Active')).toBeNull();
      expect(getStatusTransitionError('Active', 'OfferOut')).toBeNull();
      expect(getStatusTransitionError('Active', 'BackOnMarket')).toBeNull();
      expect(getStatusTransitionError('ContractSigned', 'Sold')).toBeNull();
      expect(getStatusTransitionError('TempOffMarket', 'Active')).toBeNull();
    });

    test('invalid transitions return error message', () => {
      expect(getStatusTransitionError('Draft', 'Sold')).not.toBeNull();
      expect(getStatusTransitionError('Sold', 'Active')).not.toBeNull();
      expect(getStatusTransitionError('Active', 'Draft')).not.toBeNull();
    });

    test('unknown status returns error', () => {
      expect(getStatusTransitionError('FakeStatus', 'Active')).not.toBeNull();
    });
  });

  describe('buildStatusPayload', () => {
    test('BackOnMarket builds canonical Active + workflow BackOnMarket', () => {
      const result = buildStatusPayload('BackOnMarket');
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.canonicalStatus).toBe('Active');
        expect(result.workflowStatus).toBe('BackOnMarket');
        expect(result.displayLabel).toBe('Back On Market');
      }
    });

    test('unknown status returns error', () => {
      const result = buildStatusPayload('Garbage');
      expect('error' in result).toBe(true);
    });

    test('333 E 46th can publish as canonical Active', () => {
      const result = buildStatusPayload('Active');
      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.canonicalStatus).toBe('Active');
      }
    });
  });
});
