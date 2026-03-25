/**
 * NYC Real Estate Financial Qualification Calculator
 *
 * Calculates what a tenant can afford to BUY (co-op vs condo) or RENT
 * based on actual NYC underwriting standards:
 *
 * CO-OP:
 *   - 20% down minimum
 *   - DTI 25-28% (mortgage + maintenance)
 *   - Post-closing liquidity: 24 months mortgage + maintenance
 *   - Closing costs: attorney + board fees + mansion tax (no title insurance)
 *
 * CONDO:
 *   - 20% down (some allow 10%)
 *   - DTI up to 36% (bank-based, no board financial review)
 *   - Post-closing liquidity: 6 months (comfortable)
 *   - Closing costs: title insurance + mortgage recording tax + mansion tax
 *
 * RENTAL:
 *   - Income >= 40x monthly rent
 */

// ── Configuration (update as market changes) ─────────────────────────────────

const MORTGAGE_RATE = 0.0675; // 6.75% — 30yr fixed
const TERM_MONTHS = 360;

const COOP = {
  down_pct: 0.20,
  dti_max: 0.28,
  reserve_months: 24,
  // Annual maintenance as % of purchase price (includes taxes, building ops)
  maintenance_pct: 0.012,
  // Flat closing costs (attorney, bank attorney, board app, UCC-1, move-in)
  closing_flat: 7700,
};

const CONDO = {
  down_pct: 0.20,
  dti_max: 0.36,
  reserve_months: 6,
  // Common charges (annual % of price) — taxes are separate
  common_charges_pct: 0.006,
  property_tax_pct: 0.006,
  // Flat closing (attorney, title search, bank attorney, recording)
  closing_flat: 6000,
  // Title insurance rate (% of price)
  title_insurance_pct: 0.0045,
};

const RENTAL_INCOME_MULTIPLE = 40;

// ── Mortgage math ────────────────────────────────────────────────────────────

/** Monthly payment factor for given annual rate and term */
function monthlyPaymentFactor(annualRate: number, months: number): number {
  const r = annualRate / 12;
  const factor = (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return factor;
}

const M = monthlyPaymentFactor(MORTGAGE_RATE, TERM_MONTHS);

/** Monthly mortgage payment for a given loan amount */
function monthlyMortgage(loanAmount: number): number {
  return loanAmount * M;
}

// ── NYC Mansion Tax (buyer side) ─────────────────────────────────────────────

function mansionTax(price: number): number {
  if (price < 1_000_000) return 0;
  if (price < 2_000_000) return price * 0.01;
  if (price < 3_000_000) return price * 0.0125;
  if (price < 5_000_000) return price * 0.015;
  if (price < 10_000_000) return price * 0.0225;
  if (price < 15_000_000) return price * 0.0325;
  if (price < 25_000_000) return price * 0.035;
  return price * 0.039;
}

// ── Mortgage Recording Tax (condo only — co-ops are exempt) ──────────────────

function mortgageRecordingTax(loanAmount: number): number {
  if (loanAmount <= 500_000) return loanAmount * 0.0105;
  return loanAmount * 0.018;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface TenantFinancials {
  annual_income: number;
  bonuses?: number | null;
  monthly_debt?: number | null;
  down_payment?: number | null;
  available_funds?: number | null;
  credit_score_range?: string | null;
  pre_approved?: boolean | null;
  pre_approved_amount?: number | null;
}

export interface PropertyQualification {
  type: "coop" | "condo";
  max_purchase_price: number;
  down_payment_amount: number;
  down_payment_pct: number;
  mortgage_amount: number;
  monthly_mortgage: number;
  monthly_carrying: number;
  monthly_total_housing: number;
  dti_ratio: number;
  dti_limit: number;
  closing_costs: number;
  mansion_tax: number;
  reserves_required: number;
  reserve_months: number;
  total_cash_needed: number;
  cash_available: number;
  meets_dti: boolean;
  meets_reserves: boolean;
  has_funds: boolean;
  qualified: boolean;
  limiting_factor: string | null;
}

export interface RentalQualification {
  max_monthly_rent: number;
  current_rent: number | null;
  income_multiple: number;
  qualifies_current: boolean | null;
}

export interface QualificationResult {
  coop: PropertyQualification | null;
  condo: PropertyQualification | null;
  rental: RentalQualification;
  effective_income: number;
  monthly_debt: number;
  has_data: boolean;
  missing_fields: string[];
}

// ── Calculator ───────────────────────────────────────────────────────────────

/**
 * Calculate max purchase price constrained by DTI.
 * Solves: maxMonthlyHousing = price × ((1-downPct) × M + carryingPct/12)
 */
function dtiMaxPrice(
  maxMonthlyHousing: number,
  downPct: number,
  annualCarryingPct: number
): number {
  if (maxMonthlyHousing <= 0) return 0;
  const factor = (1 - downPct) * M + annualCarryingPct / 12;
  return Math.floor(maxMonthlyHousing / factor);
}

/**
 * Calculate max purchase price constrained by available cash.
 * Solves: cash = downPct×P + closingFlat + closingPct×P + reserveMonths×monthlyHousing(P)
 */
function cashMaxPrice(
  availableCash: number,
  downPct: number,
  closingFlat: number,
  closingVariablePct: number,
  reserveMonths: number,
  annualCarryingPct: number
): number {
  if (availableCash <= closingFlat) return 0;
  const netCash = availableCash - closingFlat;
  // P × (down + closingVar + reserves × ((1-down)×M + carryPct/12)) = netCash
  const monthlyFactor = (1 - downPct) * M + annualCarryingPct / 12;
  const totalFactor = downPct + closingVariablePct + reserveMonths * monthlyFactor;
  return Math.floor(netCash / totalFactor);
}

function calculatePropertyQual(
  type: "coop" | "condo",
  effectiveIncome: number,
  monthlyDebt: number,
  cashAvailable: number
): PropertyQualification {
  const carryingPct =
    type === "coop"
      ? COOP.maintenance_pct
      : CONDO.common_charges_pct + CONDO.property_tax_pct;
  const cfg = type === "coop" ? COOP : CONDO;

  // Max monthly housing from DTI
  const grossMonthly = effectiveIncome / 12;
  const maxMonthlyHousing = grossMonthly * cfg.dti_max - monthlyDebt;

  // DTI-constrained max price
  const dtiMax = dtiMaxPrice(maxMonthlyHousing, cfg.down_pct, carryingPct);

  // Closing cost variable percentage (for cash constraint calc)
  let closingVarPct = 0;
  if (type === "condo") {
    // Title insurance + mortgage recording tax approximation
    closingVarPct = (cfg as typeof CONDO).title_insurance_pct + 0.018 * (1 - cfg.down_pct);
  }
  // Mansion tax is harder to pre-compute — we'll add it as verification

  // Cash-constrained max price (if cash data available)
  let cashMax = Infinity;
  if (cashAvailable > 0) {
    cashMax = cashMaxPrice(
      cashAvailable,
      cfg.down_pct,
      cfg.closing_flat,
      closingVarPct,
      cfg.reserve_months,
      carryingPct
    );
  }

  // Final max = min of constraints, rounded to nearest $5K
  let maxPrice = Math.min(dtiMax, cashMax);
  maxPrice = Math.max(0, Math.floor(maxPrice / 5000) * 5000);

  // Compute all numbers at the max price
  const downAmt = Math.round(maxPrice * cfg.down_pct);
  const mortgageAmt = maxPrice - downAmt;
  const monthlyMort = Math.round(monthlyMortgage(mortgageAmt));
  const monthlyCarrying = Math.round((maxPrice * carryingPct) / 12);
  const monthlyTotal = monthlyMort + monthlyCarrying;

  const dtiRatio = grossMonthly > 0
    ? (monthlyTotal + monthlyDebt) / grossMonthly
    : 1;

  const mt = mansionTax(maxPrice);
  let closingCosts = cfg.closing_flat + mt;
  if (type === "condo") {
    closingCosts += Math.round(maxPrice * (cfg as typeof CONDO).title_insurance_pct);
    closingCosts += mortgageRecordingTax(mortgageAmt);
  }
  closingCosts = Math.round(closingCosts);

  const reservesReq = Math.round(cfg.reserve_months * monthlyTotal);
  const totalCashNeeded = downAmt + closingCosts + reservesReq;

  const meetsDti = dtiRatio <= cfg.dti_max;
  const noCashData = cashAvailable <= 0;
  const meetsReserves = noCashData ? null : cashAvailable >= totalCashNeeded;
  const hasFunds = noCashData ? null : cashAvailable >= (downAmt + closingCosts);

  let limitingFactor: string | null = null;
  if (!meetsDti) limitingFactor = "DTI exceeds " + Math.round(cfg.dti_max * 100) + "%";
  else if (noCashData) limitingFactor = "Cash not verified — add available funds";
  else if (!hasFunds) limitingFactor = "Insufficient funds for down + closing";
  else if (!meetsReserves) limitingFactor = "Insufficient post-closing reserves";

  // qualified = DTI passes AND (cash verified passing, or no cash data entered)
  const qualified = meetsDti && (noCashData || (hasFunds === true && meetsReserves === true));

  return {
    type,
    max_purchase_price: maxPrice,
    down_payment_amount: downAmt,
    down_payment_pct: cfg.down_pct,
    mortgage_amount: mortgageAmt,
    monthly_mortgage: monthlyMort,
    monthly_carrying: monthlyCarrying,
    monthly_total_housing: monthlyTotal,
    dti_ratio: Math.round(dtiRatio * 1000) / 10, // e.g. 27.3
    dti_limit: cfg.dti_max * 100,
    closing_costs: closingCosts,
    mansion_tax: Math.round(mt),
    reserves_required: reservesReq,
    reserve_months: cfg.reserve_months,
    total_cash_needed: totalCashNeeded,
    cash_available: cashAvailable > 0 ? cashAvailable : 0,
    meets_dti: meetsDti,
    meets_reserves: meetsReserves === true,
    has_funds: hasFunds === true,
    qualified,
    limiting_factor: limitingFactor,
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

export function calculateQualification(
  financials: TenantFinancials,
  currentMonthlyRent: number | null
): QualificationResult {
  const missing: string[] = [];

  if (!financials.annual_income || financials.annual_income <= 0) {
    missing.push("annual_income");
  }
  if (financials.available_funds == null && financials.down_payment == null) {
    missing.push("available_funds or down_payment");
  }

  const hasData = financials.annual_income > 0;

  if (!hasData) {
    const maxRent = 0;
    return {
      coop: null,
      condo: null,
      rental: {
        max_monthly_rent: maxRent,
        current_rent: currentMonthlyRent,
        income_multiple: RENTAL_INCOME_MULTIPLE,
        qualifies_current: null,
      },
      effective_income: 0,
      monthly_debt: 0,
      has_data: false,
      missing_fields: missing,
    };
  }

  // Effective income: salary + 50% of bonuses (industry standard for 2yr avg)
  const bonuses = financials.bonuses ? Number(financials.bonuses) : 0;
  const effectiveIncome = financials.annual_income + bonuses * 0.5;
  const monthlyDebt = financials.monthly_debt ? Number(financials.monthly_debt) : 0;

  // Available cash = explicit available_funds, or down_payment as minimum
  let cashAvailable = 0;
  if (financials.available_funds && Number(financials.available_funds) > 0) {
    cashAvailable = Number(financials.available_funds);
  } else if (financials.down_payment && Number(financials.down_payment) > 0) {
    // If only down_payment given, assume that's all they have
    cashAvailable = Number(financials.down_payment);
  }

  // Purchase qualifications
  const coop = calculatePropertyQual("coop", effectiveIncome, monthlyDebt, cashAvailable);
  const condo = calculatePropertyQual("condo", effectiveIncome, monthlyDebt, cashAvailable);

  // Rental qualification
  // 40x rule: annual_income >= 40 × monthly_rent → max_rent = annual / 40
  const maxRent = Math.floor(effectiveIncome / RENTAL_INCOME_MULTIPLE);
  const currentRent = currentMonthlyRent ? Number(currentMonthlyRent) : null;

  return {
    coop: coop.max_purchase_price > 0 ? coop : null,
    condo: condo.max_purchase_price > 0 ? condo : null,
    rental: {
      max_monthly_rent: maxRent,
      current_rent: currentRent,
      income_multiple: RENTAL_INCOME_MULTIPLE,
      qualifies_current: currentRent !== null ? effectiveIncome >= currentRent * RENTAL_INCOME_MULTIPLE : null,
    },
    effective_income: Math.round(effectiveIncome),
    monthly_debt: Math.round(monthlyDebt),
    has_data: true,
    missing_fields: missing,
  };
}
