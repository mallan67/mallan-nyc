// lib/email/investment-metrics.ts
// Pure, testable computation of the investment metrics shown in the investor /
// 1031 marketing email. No I/O — the campaign route feeds it numbers parsed from
// the listing + the agent-entered rent/maintenance, and renders the result.
//
// COMPLIANCE: every derived figure is ILLUSTRATIVE and unlevered (no financing),
// before income taxes, reserves, and vacancy. The email must present them as
// estimates with the methodology footnote in `METHODOLOGY_NOTE` and the buyer
// must verify — see the disclaimer block in templates.ts. NOI here = in-place
// annual rent less annualized stated maintenance/common charges (which, for a
// coop/condop, typically already includes real estate taxes).

export interface MetricInput {
  /** Asking price (required). */
  price: number;
  /** In-place monthly rent, if known. */
  monthlyRent?: number | null;
  /** Monthly maintenance / common charges, if known. */
  monthlyMaintenance?: number | null;
  /** Interior square footage, if known. */
  sqft?: number | null;
}

export interface MetricRow {
  label: string;
  value: string;
  /** True for the small number of rows worth visually emphasizing. */
  emphasis?: boolean;
}

export interface InvestmentMetrics {
  /** 2–4 lead numbers for the headline metric band. */
  headline: MetricRow[];
  /** Full financial-snapshot table rows. */
  rows: MetricRow[];
  capRatePct: number | null;
  noiAnnual: number | null;
  pricePerSqft: number | null;
  monthlyCashFlow: number | null;
}

export const METHODOLOGY_NOTE =
  "Figures are illustrative and unlevered. Net operating income = in-place annual rent less annualized maintenance/common charges; " +
  "cap rate = NOI ÷ asking price. Before financing, income taxes, reserves, capital expenditures, and vacancy. " +
  "Rent, maintenance, square footage, and lease terms are as provided and must be independently verified by the buyer.";

const money0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

/** Parse a money-ish string ("$4,305 / mo", "1,748.65") to a number, or null. */
export function parseMoney(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/[^0-9.]/g, "");
  if (!m) return null;
  const n = Number(m);
  return Number.isFinite(n) ? n : null;
}

export function computeInvestmentMetrics(input: MetricInput): InvestmentMetrics {
  const price = input.price;
  const rent = input.monthlyRent && input.monthlyRent > 0 ? input.monthlyRent : null;
  const maint = input.monthlyMaintenance && input.monthlyMaintenance > 0 ? input.monthlyMaintenance : null;
  const sqft = input.sqft && input.sqft > 0 ? input.sqft : null;

  const annualRent = rent != null ? rent * 12 : null;
  const annualMaint = maint != null ? maint * 12 : null;
  const noi = annualRent != null && annualMaint != null ? annualRent - annualMaint : null;
  const capRatePct = noi != null && price > 0 ? (noi / price) * 100 : null;
  const pricePerSqft = sqft != null && price > 0 ? price / sqft : null;
  const monthlyCashFlow = rent != null && maint != null ? rent - maint : null;
  const grm = annualRent != null && annualRent > 0 ? price / annualRent : null;

  const headline: MetricRow[] = [{ label: "Asking Price", value: money0(price), emphasis: true }];
  if (capRatePct != null) headline.push({ label: "Est. Cap Rate", value: pct(capRatePct), emphasis: true });
  if (rent != null) headline.push({ label: "In-Place Rent", value: `${money0(rent)}/mo` });
  if (pricePerSqft != null) headline.push({ label: "Price / SF", value: money0(pricePerSqft) });

  const rows: MetricRow[] = [{ label: "Asking price", value: money0(price), emphasis: true }];
  if (sqft != null) rows.push({ label: "Interior square footage", value: `${Math.round(sqft).toLocaleString("en-US")} SF` });
  if (pricePerSqft != null) rows.push({ label: "Price per square foot", value: money0(pricePerSqft) });
  if (rent != null) rows.push({ label: "In-place monthly rent", value: money0(rent) });
  if (annualRent != null) rows.push({ label: "Annual gross rent", value: money0(annualRent) });
  if (maint != null) rows.push({ label: "Monthly maintenance", value: money2(maint) });
  if (annualMaint != null) rows.push({ label: "Annual maintenance", value: money0(annualMaint) });
  if (noi != null) rows.push({ label: "Est. net operating income", value: money0(noi), emphasis: true });
  if (capRatePct != null) rows.push({ label: "Est. cap rate", value: pct(capRatePct), emphasis: true });
  if (monthlyCashFlow != null) rows.push({ label: "Monthly cash flow (unlevered)", value: money2(monthlyCashFlow) });
  if (grm != null) rows.push({ label: "Gross rent multiplier", value: grm.toFixed(1) });

  return { headline, rows, capRatePct, noiAnnual: noi, pricePerSqft, monthlyCashFlow };
}
