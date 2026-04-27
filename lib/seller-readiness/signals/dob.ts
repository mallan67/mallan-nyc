/**
 * DOB Signal Collector — NYC Department of Buildings public data
 *
 * Extracts permit activity and violation signals.
 * Renovation permits suggest investment → potential sell after completion.
 * Violations suggest building issues → potential motivation to sell.
 */

import { soda } from '@/lib/soda';
import type { SignalInput } from '../types';

const PERMITS_DATASET = process.env.SODA_DATASET_DOB_PERMITS!;
const VIOLATIONS_DATASET = process.env.SODA_DATASET_DOB_VIOLATIONS!;
// COMPLAINTS_DATASET is provisioned in env but not yet wired into a signal
// pull. Keep the env var defined so deploys don't lose it; restore the
// constant when the complaints signal is implemented.

interface DobPermit {
  job_type?: string;
  job_status?: string;
  job_filed_date?: string;
  permit_type?: string;
  work_type?: string;
  bbl?: string;
  bin?: string;
}

interface DobViolation {
  violation_type?: string;
  violation_category?: string;
  issue_date?: string;
  disposition_date?: string;
  bbl?: string;
}

/**
 * Collect DOB-based signals for a BBL or BIN.
 * Returns dob_permits, renovation_signal, and building_risk signals.
 */
export async function collectDobSignals(bbl: string, bin?: string | null): Promise<SignalInput[]> {
  if (!bbl && !bin) return [];

  const signals: SignalInput[] = [];
  const lookupField = bin ? `bin='${bin}'` : `bbl='${bbl}'`;

  try {
    // 1. Recent permits (last 3 years)
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const dateFilter = `job_filed_date >= '${threeYearsAgo.toISOString().split('T')[0]}'`;

    const permits = await soda<DobPermit>({
      resource: PERMITS_DATASET,
      where: `${lookupField} AND ${dateFilter}`,
      order: 'job_filed_date DESC',
      limit: 50,
    });

    if (permits.length > 0) {
      // Renovation-type permits (Alteration Type 1/2, NB)
      const renovationKeywords = ['A1', 'A2', 'A3', 'NB', 'DM'];
      const renovationPermits = permits.filter(p =>
        renovationKeywords.some(k => (p.job_type || '').includes(k))
      );

      // More recent renovation permits = higher signal
      const mostRecent = permits[0]?.job_filed_date
        ? new Date(permits[0].job_filed_date)
        : null;
      const monthsAgo = mostRecent
        ? (Date.now() - mostRecent.getTime()) / (30 * 24 * 60 * 60 * 1000)
        : 36;

      // Recent permit activity: completed renovations suggest potential sell
      // 0-6 months: peak (0.8-1.0), 6-18: medium (0.4-0.7), 18-36: low (0.1-0.3)
      const permitNormalized = Math.max(0, Math.min(1.0, 1 - (monthsAgo / 36)));

      signals.push({
        signal_type: 'dob_permits',
        raw_value: `${permits.length} permits (${renovationPermits.length} renovation)`,
        normalized: permitNormalized,
        source: 'dob',
        metadata: {
          total_permits: permits.length,
          renovation_permits: renovationPermits.length,
          most_recent: mostRecent?.toISOString(),
        },
      });

      // Renovation signal (separate from raw permit count)
      if (renovationPermits.length > 0) {
        // More renovation permits = higher signal (caps at 5)
        const normalized = Math.min(1.0, renovationPermits.length / 5);

        signals.push({
          signal_type: 'renovation_signal',
          raw_value: `${renovationPermits.length} renovation permits`,
          normalized,
          source: 'dob',
          metadata: {
            permit_types: renovationPermits.map(p => p.job_type),
          },
        });
      }
    }

    // 2. Violations (building risk)
    if (VIOLATIONS_DATASET) {
      const violations = await soda<DobViolation>({
        resource: VIOLATIONS_DATASET,
        where: lookupField,
        order: 'issue_date DESC',
        limit: 50,
      });

      // Open/unresolved violations suggest building stress
      const openViolations = violations.filter(v => !v.disposition_date);
      if (violations.length > 0) {
        // More open violations = higher building risk = potential motivation to sell
        const normalized = Math.min(1.0, openViolations.length / 10);

        signals.push({
          signal_type: 'building_risk',
          raw_value: `${openViolations.length} open / ${violations.length} total violations`,
          normalized,
          source: 'dob',
          metadata: {
            total_violations: violations.length,
            open_violations: openViolations.length,
          },
        });
      }
    }
  } catch (err) {
    console.warn('[seller-readiness] DOB signal collection failed:', err);
  }

  return signals;
}
