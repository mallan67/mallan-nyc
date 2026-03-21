/**
 * DOF Property Tax Signal Collector
 * NYC Finance Department — Real Property Assessment Data (RPAD)
 *
 * Dataset: yjxr-fw8i (NYC Open Data)
 * Fields: bble, fullval (market value), avtot (assessed value),
 *         taxclass, owner, staddr, exland/extot (exemptions)
 *
 * Tax classes:
 *   1 = 1-3 family homes
 *   2 = Residential (4+ units, co-ops, condos)
 *   4 = Commercial / mixed-use
 *
 * Annual tax estimate:
 *   Class 1: ~20.309% of assessed value (FY2024 NYC rate)
 *   Class 2: ~12.267% of assessed value
 *   Class 4: ~10.646% of assessed value
 */

import { soda } from '@/lib/soda';
import type { SignalInput } from '../types';

const RPAD_DATASET = process.env.SODA_DATASET_DOF_RPAD ?? 'yjxr-fw8i';

// NYC FY2025 tax rates by class (% of assessed value)
const NYC_TAX_RATES: Record<string, number> = {
  '1':  0.20309,  // 1-3 family
  '2':  0.12267,  // residential co-op/condo/rental
  '2a': 0.12267,
  '2b': 0.12267,
  '2c': 0.12267,
  '4':  0.10646,  // commercial / mixed-use
};

interface RpadRow {
  bble?: string;
  fullval?: string;   // market value
  avtot?: string;     // assessed total
  avland?: string;    // assessed land
  extot?: string;     // exemption total
  exland?: string;    // exemption land
  taxclass?: string;
  owner?: string;
  staddr?: string;
  stories?: string;
  bldgcl?: string;    // building class code
  year?: string;      // roll year
}

export interface DofTaxData {
  bble: string;
  owner_name: string;
  address: string;
  tax_class: string;
  market_value: number;         // fullval
  assessed_value: number;       // avtot
  exemption_amount: number;     // extot
  taxable_assessed: number;     // avtot - extot
  estimated_annual_tax: number; // taxable_assessed × rate
  tax_rate: number;
  building_class: string;
  stories: number;
  roll_year: string;
}

/**
 * Fetch DOF property assessment data by BBL.
 * BBL format: 10-digit string, e.g. "1007700059" (borough=1, block=0077, lot=0059)
 * RPAD uses 'bble' which is the same 10-digit format.
 */
export async function fetchDofTaxData(bbl: string): Promise<DofTaxData | null> {
  if (!bbl || bbl.length < 10) return null;

  // Normalize to 10 digits (RPAD bble is exactly 10 digits)
  const bble = bbl.slice(0, 10);

  try {
    const rows = await soda<RpadRow>({
      resource: RPAD_DATASET,
      where: `bble='${bble}'`,
      limit: 1,
    });

    if (!rows || rows.length === 0) return null;
    const row = rows[0];

    const taxClass = (row.taxclass || '2').toLowerCase().replace(/\s/g, '');
    const marketValue = parseFloat(row.fullval || '0') || 0;
    const assessedValue = parseFloat(row.avtot || '0') || 0;
    const exemptionAmount = parseFloat(row.extot || '0') || 0;
    const taxableAssessed = Math.max(0, assessedValue - exemptionAmount);
    const taxRate = NYC_TAX_RATES[taxClass] ?? NYC_TAX_RATES['2'];
    const estimatedAnnualTax = Math.round(taxableAssessed * taxRate);

    return {
      bble,
      owner_name: row.owner || '',
      address: row.staddr || '',
      tax_class: taxClass,
      market_value: marketValue,
      assessed_value: assessedValue,
      exemption_amount: exemptionAmount,
      taxable_assessed: taxableAssessed,
      estimated_annual_tax: estimatedAnnualTax,
      tax_rate: taxRate,
      building_class: row.bldgcl || '',
      stories: parseFloat(row.stories || '0') || 0,
      roll_year: row.year || '',
    };
  } catch (err) {
    console.warn('[DOF Tax] Failed to fetch for BBL', bbl, (err as Error).message);
    return null;
  }
}

/**
 * Collect DOF signals for seller readiness scoring.
 * Adds property_tax signal: high annual tax burden relative to market value
 * can be a mild motivation signal (carrying costs are real).
 *
 * Normalized: annual tax / market_value ratio
 * Class 2 NYC condo: typically 0.5-1.2% effective rate
 * High effective rate (>1%) = slightly elevated signal
 */
export async function collectDofSignals(bbl: string): Promise<SignalInput[]> {
  const data = await fetchDofTaxData(bbl);
  if (!data || data.market_value === 0) return [];

  // Effective tax rate (annual tax / market value)
  const effectiveRate = data.estimated_annual_tax / data.market_value;

  // Normalize: 0 = 0% effective rate, 1.0 = 2%+ effective rate
  const normalized = Math.min(1.0, effectiveRate / 0.02);

  return [{
    signal_type: 'property_tax',
    raw_value: `$${data.estimated_annual_tax.toLocaleString()}/yr (${(effectiveRate * 100).toFixed(2)}% effective rate)`,
    normalized,
    source: 'dof',
    metadata: {
      tax_class: data.tax_class,
      market_value: data.market_value,
      assessed_value: data.assessed_value,
      exemption_amount: data.exemption_amount,
      estimated_annual_tax: data.estimated_annual_tax,
      tax_rate: data.tax_rate,
      building_class: data.building_class,
      roll_year: data.roll_year,
      owner_name: data.owner_name,
    },
  }];
}
