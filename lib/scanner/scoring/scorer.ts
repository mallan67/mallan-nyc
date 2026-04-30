/**
 * lib/scanner/scoring/scorer.ts
 *
 * The seller-intent scoring engine. Composes per-signal rules with
 * time-based decay into a single 0..100 score with full per-reason
 * explainability.
 *
 * Algorithm:
 *   1. Apply each rule independently → list of ScoreReason
 *   2. Sum contributions → raw_score
 *   3. Apply convergence boost if ≥3 distinct signal categories
 *   4. Cap at config.max_score
 *   5. Run through compliance gate (isSuppressed) — if suppressed,
 *      score → 0 and suppression reasons recorded
 *   6. Derive confidence from signal count + recency
 *
 * The scorer is a pure function: same input + same `now` = same output.
 * No I/O, no DB, no Trestle calls.
 */
import { isSuppressed } from "@/lib/scanner/compliance/suppression";
import type { SuppressionInput } from "@/lib/scanner/compliance/types";
import type {
  AcrisDistressSignal,
  BblProspect,
  ScoreConfidence,
  ScoreReason,
  ScoredProspect,
  ScoringConfig,
} from "@/lib/scanner/scoring/types";
import { DEFAULT_SCORING_CONFIG } from "@/lib/scanner/scoring/types";

const DAY_MS = 86400000;

/** Linear decay 0..1 based on age vs. decay window. */
function linearDecay(ageDays: number, decayDays: number): number {
  if (decayDays <= 0) return 0;
  if (ageDays < 0) return 1;
  if (ageDays >= decayDays) return 0;
  return 1 - ageDays / decayDays;
}

function ageDays(isoDate: string | undefined | null, now: Date): number | null {
  if (!isoDate) return null;
  const t = Date.parse(isoDate);
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / DAY_MS;
}

function mostRecent<T extends { recorded_datetime?: string }>(items: T[] | undefined): T | null {
  if (!items || items.length === 0) return null;
  return items.slice().sort((a, b) => {
    const ta = a.recorded_datetime ? Date.parse(a.recorded_datetime) : 0;
    const tb = b.recorded_datetime ? Date.parse(b.recorded_datetime) : 0;
    return tb - ta;
  })[0];
}

function acrisDocUrl(docId: string): string {
  return `https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id=${encodeURIComponent(docId)}`;
}

// ────────────────────────────────────────────────────────────
// Per-signal rules
// ────────────────────────────────────────────────────────────

function ruleAcrisCategory(
  category: AcrisDistressSignal["category"],
  signalKey: string,
  prospect: BblProspect,
  weight: number,
  decayDays: number,
  now: Date,
): ScoreReason[] {
  const matched = (prospect.acris_signals || []).filter((s) => s.category === category);
  const most = mostRecent(matched);
  if (!most) return [];
  const age = ageDays(most.recorded_datetime, now);
  if (age === null) return [];
  const decay = linearDecay(age, decayDays);
  if (decay <= 0) return [];
  const contribution = weight * decay;
  return [{
    signal: signalKey,
    raw_weight: weight,
    decay_factor: Math.round(decay * 100) / 100,
    contribution: Math.round(contribution * 100) / 100,
    detail: `${prettyCategory(category)} recorded ${most.recorded_datetime.slice(0, 10)} (${Math.round(age)} days ago)`,
    source: `ACRIS doc ${most.doc_id}`,
    source_url: acrisDocUrl(most.doc_id),
    signal_date: most.recorded_datetime,
  }];
}

function prettyCategory(c: AcrisDistressSignal["category"]): string {
  switch (c) {
    case "lis_pendens": return "Lis pendens";
    case "foreclosure": return "Foreclosure judgment";
    case "tax_lien":    return "Tax lien";
    case "estate":      return "Estate transfer";
  }
}

function ruleOffMarketExpired(
  prospect: BblProspect,
  config: ScoringConfig,
  now: Date,
): ScoreReason[] {
  const past = (prospect.off_market_signals || []).filter((s) => s.past_cooling_off);
  if (past.length === 0) return [];
  // Take the most recent
  const sorted = past.slice().sort((a, b) => {
    const ta = a.off_market_since ? Date.parse(a.off_market_since) : 0;
    const tb = b.off_market_since ? Date.parse(b.off_market_since) : 0;
    return tb - ta;
  });
  const most = sorted[0];
  if (!most.off_market_since) return [];
  const age = ageDays(most.off_market_since, now);
  if (age === null) return [];
  const decay = linearDecay(age, config.off_market_expired.decay_days);
  if (decay <= 0) return [];
  const contribution = config.off_market_expired.max_weight * decay;
  const detail = `${most.listing_status} listing — off market since ${most.off_market_since.slice(0, 10)} (${Math.round(age)} days ago)${most.was_mallan_listing ? " · former Mallan listing" : ""}`;
  return [{
    signal: "off_market_expired",
    raw_weight: config.off_market_expired.max_weight,
    decay_factor: Math.round(decay * 100) / 100,
    contribution: Math.round(contribution * 100) / 100,
    detail,
    source: most.mls_id ? `Trestle ${most.mls_id}` : "Trestle off-market",
    signal_date: most.off_market_since,
  }];
}

function ruleDofTaxLienSale(
  prospect: BblProspect,
  config: ScoringConfig,
  now: Date,
): ScoreReason[] {
  const signals = prospect.dof_tax_lien_signals || [];
  if (signals.length === 0) return [];
  // Most recent lien-sale list entry is the strongest
  const sorted = signals.slice().sort((a, b) => {
    const ta = a.list_date ? Date.parse(a.list_date) : 0;
    const tb = b.list_date ? Date.parse(b.list_date) : 0;
    return tb - ta;
  });
  const most = sorted[0];
  const dateRef = most.list_date || most.sale_date;
  const age = ageDays(dateRef, now);
  if (age === null) return [];
  const decay = linearDecay(age, config.dof_tax_lien_sale.decay_days);
  if (decay <= 0) return [];

  // Property-tax lien is full weight; water/sewer alone is reduced
  const allWaterSewer = signals.every((s) => s.lien_category === "water_sewer");
  const baseWeight = config.dof_tax_lien_sale.max_weight;
  const adjustedWeight = allWaterSewer
    ? Math.max(0, baseWeight + config.dof_tax_lien_water_sewer_only_penalty.weight)
    : baseWeight;
  if (adjustedWeight === 0) return [];

  const contribution = adjustedWeight * decay;
  const flavor = allWaterSewer ? "water/sewer only" : most.lien_category.replace("_", " ");
  return [{
    signal: "dof_tax_lien_sale",
    raw_weight: adjustedWeight,
    decay_factor: Math.round(decay * 100) / 100,
    contribution: Math.round(contribution * 100) / 100,
    detail: `On NYC DOF tax-lien-sale list — ${flavor}, $${most.lien_amount} (${dateRef.slice(0, 10)})`,
    source: `DOF lien-sale ${most.bbl}`,
  }];
}

function ruleOffMarketRelistBoost(
  prospect: BblProspect,
  config: ScoringConfig,
): ScoreReason[] {
  const count = prospect.off_market_relist_count_24mo ?? 0;
  if (count < config.off_market_relist_boost.threshold) return [];
  return [{
    signal: "off_market_relist_boost",
    raw_weight: config.off_market_relist_boost.weight,
    decay_factor: 1.0,
    contribution: config.off_market_relist_boost.weight,
    detail: `Repeat off-market events: ${count} listings ended without a sale in 24 months`,
    source: "Trestle aggregate",
  }];
}

function ruleLongOwnership(
  prospect: BblProspect,
  config: ScoringConfig,
): ScoreReason[] {
  const years = prospect.ownership_duration_years;
  if (years == null) return [];
  const reasons: ScoreReason[] = [];
  if (years >= 25) {
    reasons.push({
      signal: "long_ownership_25y",
      raw_weight: config.long_ownership_25y.weight,
      decay_factor: 1.0,
      contribution: config.long_ownership_25y.weight,
      detail: `Owner has held this lot for ${Math.floor(years)} years (≥25)`,
      source: "ACRIS deed history",
    });
  }
  if (years >= 40) {
    reasons.push({
      signal: "long_ownership_40y",
      raw_weight: config.long_ownership_40y.weight,
      decay_factor: 1.0,
      contribution: config.long_ownership_40y.weight,
      detail: `Tenure ≥40 years — aging-in-place pattern`,
      source: "ACRIS deed history",
    });
  }
  return reasons;
}

function ruleRecentPurchasePenalty(
  prospect: BblProspect,
  config: ScoringConfig,
): ScoreReason[] {
  const years = prospect.ownership_duration_years;
  if (years == null) return [];
  if (years >= config.recent_purchase_penalty.years) return [];
  return [{
    signal: "recent_purchase_penalty",
    raw_weight: config.recent_purchase_penalty.weight,
    decay_factor: 1.0,
    contribution: config.recent_purchase_penalty.weight,
    detail: `Owner just bought (${years.toFixed(1)} years) — unlikely seller`,
    source: "ACRIS deed history",
  }];
}

function ruleDissolvedLlc(
  prospect: BblProspect,
  config: ScoringConfig,
): ScoreReason[] {
  if (!prospect.is_dissolved_llc) return [];
  // Find the dissolved-LLC match for citation
  const dissolved = (prospect.dos_matches || []).find((m) =>
    m.status && m.status.toUpperCase() !== "ACTIVE",
  );
  return [{
    signal: "dissolved_llc",
    raw_weight: config.dissolved_llc.weight,
    decay_factor: 1.0,
    contribution: config.dissolved_llc.weight,
    detail: `LLC owner-of-record is ${dissolved?.status || "non-active"} but property still on tax roll`,
    source: dissolved ? `NY DOS Corp #${dissolved.dos_id}` : "NY DOS Corp",
    source_url: dissolved
      ? `https://apps.dos.ny.gov/publicInquiry/EntityDisplay?id=${encodeURIComponent(dissolved.dos_id)}`
      : undefined,
  }];
}

function ruleAbsenteeOwner(
  prospect: BblProspect,
  config: ScoringConfig,
): ScoreReason[] {
  if (!prospect.is_absentee) return [];
  return [{
    signal: "absentee_owner",
    raw_weight: config.absentee_owner.weight,
    decay_factor: 1.0,
    contribution: config.absentee_owner.weight,
    detail: `Owner mailing address differs from property — non-occupant`,
    source: "PLUTO + DOF tax-bill mailing",
  }];
}

function ruleConvergenceBoost(
  reasons: ScoreReason[],
  config: ScoringConfig,
): ScoreReason[] {
  const distinctCategories = new Set<string>();
  for (const r of reasons) {
    // Group rules into category buckets so we don't double-count
    if (r.signal === "lis_pendens" || r.signal === "foreclosure" || r.signal === "tax_lien") distinctCategories.add("acris_distress");
    else if (r.signal === "estate") distinctCategories.add("estate");
    else if (r.signal === "off_market_expired" || r.signal === "off_market_relist_boost") distinctCategories.add("off_market");
    else if (r.signal === "long_ownership_25y" || r.signal === "long_ownership_40y") distinctCategories.add("tenure");
    else if (r.signal === "dissolved_llc") distinctCategories.add("dissolved_llc");
    else if (r.signal === "absentee_owner") distinctCategories.add("absentee");
    else if (r.signal === "dof_tax_lien_sale") distinctCategories.add("dof_tax_lien_sale");
  }
  if (distinctCategories.size < config.convergence_boost.threshold) return [];
  return [{
    signal: "convergence_boost",
    raw_weight: config.convergence_boost.weight,
    decay_factor: 1.0,
    contribution: config.convergence_boost.weight,
    detail: `${distinctCategories.size} converging signal categories — multi-source seller-intent`,
    source: "scorer",
  }];
}

// ────────────────────────────────────────────────────────────
// Main entry point
// ────────────────────────────────────────────────────────────

function deriveConfidence(reasons: ScoreReason[], score: number, config: ScoringConfig): ScoreConfidence {
  if (score < config.min_score_to_surface) return "below_threshold";
  // High: multiple converging signals OR a strong recent ACRIS distress signal
  const acrisDistress = reasons.find((r) => r.signal === "lis_pendens" || r.signal === "foreclosure");
  const off = reasons.find((r) => r.signal === "off_market_expired");
  if ((acrisDistress && acrisDistress.contribution >= 25) || (off && off.contribution >= 20)) return "high";
  if (reasons.length >= 4) return "high";
  if (reasons.length >= 2) return "medium";
  return "low";
}

function mostRecentReasonDate(reasons: ScoreReason[]): string | null {
  let bestT = -Infinity;
  let bestDate: string | null = null;
  for (const r of reasons) {
    if (!r.signal_date) continue;
    const t = Date.parse(r.signal_date);
    if (Number.isFinite(t) && t > bestT) {
      bestT = t;
      bestDate = r.signal_date;
    }
  }
  return bestDate;
}

/**
 * Score a single BBL prospect. Pure function — same input + same `now`
 * = same output.
 */
export function scoreProspect(
  prospect: BblProspect,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
  now: Date = new Date(),
): ScoredProspect {
  const reasons: ScoreReason[] = [];

  // ACRIS distress signals (per-category, take the most recent)
  reasons.push(...ruleAcrisCategory("lis_pendens", "lis_pendens", prospect, config.lis_pendens.max_weight, config.lis_pendens.decay_days, now));
  reasons.push(...ruleAcrisCategory("foreclosure", "foreclosure", prospect, config.foreclosure.max_weight, config.foreclosure.decay_days, now));
  reasons.push(...ruleAcrisCategory("tax_lien", "tax_lien", prospect, config.tax_lien.max_weight, config.tax_lien.decay_days, now));
  reasons.push(...ruleAcrisCategory("estate", "estate", prospect, config.estate.max_weight, config.estate.decay_days, now));

  // Off-market
  reasons.push(...ruleOffMarketExpired(prospect, config, now));
  reasons.push(...ruleOffMarketRelistBoost(prospect, config));

  // DOF lien sale
  reasons.push(...ruleDofTaxLienSale(prospect, config, now));

  // Tenure
  reasons.push(...ruleLongOwnership(prospect, config));
  reasons.push(...ruleRecentPurchasePenalty(prospect, config));

  // Owner-side derived
  reasons.push(...ruleDissolvedLlc(prospect, config));
  reasons.push(...ruleAbsenteeOwner(prospect, config));

  // Convergence bonus (computed on existing reasons)
  reasons.push(...ruleConvergenceBoost(reasons, config));

  const rawScore = reasons.reduce((sum, r) => sum + r.contribution, 0);
  let cappedScore = Math.min(Math.max(rawScore, 0), config.max_score);
  cappedScore = Math.round(cappedScore * 10) / 10;

  // Compliance gate — last step
  const suppressInput: SuppressionInput = {
    bbl: prospect.bbl,
    owner_name: prospect.pluto.owner_name,
    address: prospect.pluto.property_address || prospect.pluto.address,
    lat: prospect.pluto.latitude ?? null,
    lng: prospect.pluto.longitude ?? null,
  };
  const verdict = isSuppressed(suppressInput, now);
  const finalScore = verdict.suppressed ? 0 : cappedScore;
  const confidence = deriveConfidence(reasons, finalScore, config);

  // Distinct signal categories (independent of convergence — for output stat)
  const categories = new Set<string>();
  for (const r of reasons) {
    if (r.signal === "convergence_boost") continue;
    if (r.signal === "lis_pendens" || r.signal === "foreclosure" || r.signal === "tax_lien") categories.add("acris_distress");
    else if (r.signal === "estate") categories.add("estate");
    else if (r.signal === "off_market_expired" || r.signal === "off_market_relist_boost") categories.add("off_market");
    else if (r.signal === "long_ownership_25y" || r.signal === "long_ownership_40y") categories.add("tenure");
    else if (r.signal === "dissolved_llc") categories.add("dissolved_llc");
    else if (r.signal === "absentee_owner") categories.add("absentee");
    else if (r.signal === "recent_purchase_penalty") categories.add("recent_purchase");
    else if (r.signal === "dof_tax_lien_sale") categories.add("dof_tax_lien_sale");
  }

  return {
    bbl: prospect.bbl,
    score: finalScore,
    raw_score: Math.round(rawScore * 10) / 10,
    reasons,
    confidence,
    suppressed: verdict.suppressed,
    suppression_reasons: verdict.reasons,
    signal_category_count: categories.size,
    most_recent_signal_at: mostRecentReasonDate(reasons),
    scored_at: now.toISOString(),
  };
}

/** Score a batch of prospects, sorted by descending score, optionally filtered by min threshold. */
export function scoreProspects(
  prospects: BblProspect[],
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
  now: Date = new Date(),
  options: { surface_below_threshold?: boolean } = {},
): ScoredProspect[] {
  const scored = prospects.map((p) => scoreProspect(p, config, now));
  const filtered = options.surface_below_threshold
    ? scored
    : scored.filter((s) => s.score >= config.min_score_to_surface || s.suppressed);
  return filtered.sort((a, b) => b.score - a.score);
}
