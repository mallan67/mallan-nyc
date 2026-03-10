/**
 * ACRIS Signal Collector — Public deed/mortgage data from NYC Open Data
 *
 * Extracts ownership duration and mortgage age signals from ACRIS records.
 * Uses the existing /api/acris endpoint via internal fetch, or direct SODA calls.
 */

import { soda } from '@/lib/soda';
import type { SignalInput } from '../types';

const MASTER = process.env.SODA_DATASET_ACRIS_MASTER!;
const REALPROP = process.env.SODA_DATASET_ACRIS_REALPROPERTY!;

interface AcrisDoc {
  document_id: string;
  doc_type: string;
  document_date?: string;
  recorded_datetime?: string;
  doc_amount?: string;
}

/**
 * Collect ACRIS-based signals for a BBL.
 * Returns ownership_duration and mortgage_age signals.
 */
export async function collectAcrisSignals(bbl: string): Promise<SignalInput[]> {
  if (!bbl || bbl.length !== 10) return [];

  const borough = bbl[0];
  const block = bbl.substring(1, 6);
  const lot = bbl.substring(6, 10);

  const signals: SignalInput[] = [];

  try {
    // 1. Get document IDs for this property
    const where = `borough='${borough}' AND block='${block}' AND lot='${lot}'`;
    const ids = await soda<{ document_id: string }>({
      resource: REALPROP,
      where,
      select: 'document_id',
      order: 'document_id DESC',
      limit: 100,
    });

    if (!ids.length) return signals;

    const docIds = ids
      .map(r => r.document_id)
      .filter(Boolean);

    if (!docIds.length) return signals;

    // 2. Get master records
    const masterWhere = `document_id in (${docIds.map(id => `'${id}'`).join(',')})`;
    const docs = await soda<AcrisDoc>({
      resource: MASTER,
      where: masterWhere,
      order: 'recorded_datetime DESC',
      limit: docIds.length,
    });

    // 3. Find most recent deed (ownership transfer)
    const deedTypes = ['DEED', 'DEEDO', 'DEED, RP', 'DEED, RC', 'DEED, TS'];
    const lastDeed = docs.find(d =>
      deedTypes.some(dt => (d.doc_type || '').toUpperCase().includes(dt))
    );

    if (lastDeed?.recorded_datetime) {
      const deedDate = new Date(lastDeed.recorded_datetime);
      const yearsOwned = (Date.now() - deedDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

      // Normalize: longer ownership = higher score
      // 0-3 years: low (0.1-0.3), 5-10: medium (0.4-0.6), 10-20: high (0.7-0.9), 20+: peak (1.0)
      const normalized = Math.min(1.0, yearsOwned / 20);

      signals.push({
        signal_type: 'ownership_duration',
        raw_value: `${yearsOwned.toFixed(1)} years`,
        normalized,
        source: 'acris',
        metadata: {
          deed_date: lastDeed.recorded_datetime,
          document_id: lastDeed.document_id,
          doc_type: lastDeed.doc_type,
        },
      });
    }

    // 4. Find most recent mortgage
    const mortgageTypes = ['MTGE', 'MORTGAGE', 'AGMT', 'ASST'];
    const lastMortgage = docs.find(d =>
      mortgageTypes.some(mt => (d.doc_type || '').toUpperCase().includes(mt))
    );

    if (lastMortgage?.recorded_datetime) {
      const mortgageDate = new Date(lastMortgage.recorded_datetime);
      const yearsAgo = (Date.now() - mortgageDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

      // Older mortgages = more equity built up = higher sell readiness
      // 0-5 years: low (0.1-0.3), 5-15: medium (0.4-0.7), 15-30: high (0.8-1.0)
      const normalized = Math.min(1.0, yearsAgo / 25);

      signals.push({
        signal_type: 'mortgage_age',
        raw_value: `${yearsAgo.toFixed(1)} years`,
        normalized,
        source: 'acris',
        metadata: {
          mortgage_date: lastMortgage.recorded_datetime,
          document_id: lastMortgage.document_id,
          amount: lastMortgage.doc_amount,
        },
      });

      // 5. Equity estimate (rough: based on mortgage age and amount)
      if (lastMortgage.doc_amount && lastDeed?.doc_amount) {
        const mortgageAmount = parseFloat(lastMortgage.doc_amount);
        const purchasePrice = parseFloat(lastDeed.doc_amount);
        if (mortgageAmount > 0 && purchasePrice > 0) {
          // Simple LTV estimate (doesn't account for appreciation, but directional)
          const ltv = mortgageAmount / purchasePrice;
          // Lower LTV = more equity = higher readiness
          const normalized = Math.max(0, Math.min(1.0, 1 - ltv));

          signals.push({
            signal_type: 'equity_estimate',
            raw_value: `LTV ${(ltv * 100).toFixed(0)}%`,
            normalized,
            source: 'acris',
            metadata: {
              mortgage_amount: mortgageAmount,
              purchase_price: purchasePrice,
              estimated_ltv: ltv,
            },
          });
        }
      }
    }
  } catch (err) {
    console.warn('[seller-readiness] ACRIS signal collection failed:', err);
  }

  return signals;
}
