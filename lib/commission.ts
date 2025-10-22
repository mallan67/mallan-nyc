// lib/commission.ts
export function dollars(n: number) {
  return Math.round(n); // round to nearest dollar; change to floor/ceil if you prefer
}

export function pctToUnit(pctOrUnit: number) {
  // accepts 60 or 0.60 and normalizes to 0.60
  return pctOrUnit > 1 ? pctOrUnit / 100 : pctOrUnit;
}

/**
 * commissionBase: number the commission is computed from (your rule: price or price * brokerageRate, etc.)
 * agentPercent: 60 or 0.60 (both okay)
 */
export function computeAgentCommission(commissionBase: number, agentPercent: number) {
  const unit = pctToUnit(agentPercent);
  const agentAmt = dollars(commissionBase * unit);
  return { unit, agentAmt };
}
