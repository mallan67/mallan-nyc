/**
 * Predictive Seller Readiness — Scoring Configuration
 *
 * Weights for each signal type. Must sum to 1.0.
 * Tuned for NYC residential real estate patterns.
 */

import type { SignalType, OutreachTemplate } from './types';

// ── Signal Weights ──

export const SIGNAL_WEIGHTS: Record<SignalType, number> = {
  ownership_duration: 0.20,
  mortgage_age:       0.15,
  equity_estimate:    0.15,
  dob_permits:        0.08,
  renovation_signal:  0.08,
  building_risk:      0.04,
  property_tax:       0.05,  // DOF: high tax burden = carrying cost motivation
  page_visit:         0.10,
  cma_request:        0.10,
  valuation_form:     0.05,
};

// ── Grade Thresholds ──

export const GRADE_THRESHOLDS = {
  A: 80,
  B: 65,
  C: 50,
  D: 35,
} as const;

// ── Scoring Config ──

export const SCORING_CONFIG = {
  /** Re-score leads older than this many hours */
  staleAfterHours: 72,
  /** Maximum leads to re-score per cron run */
  batchSize: 50,
  /** Minimum score to auto-assign to an agent */
  autoAssignThreshold: 65,
} as const;

// ── Outreach Templates ──

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: 'intro_letter',
    name: 'Introduction Letter',
    channel: 'letter',
    subject: 'Your Property at {address}',
    body: `Dear {owner_name},

I hope this letter finds you well. My name is {agent_name} with Mallan Real Estate, and I specialize in properties in {neighborhood}.

I noticed your property at {address} and wanted to reach out. The current market conditions in {neighborhood} have been favorable for sellers, and I'd love to share a complimentary market analysis for your building.

If you're curious about your property's current value — no obligation, no pressure — I'd be happy to provide a confidential assessment.

Best regards,
{agent_name}
{agent_phone}
Mallan Real Estate Inc.
Licensed Real Estate Broker`,
    merge_fields: ['owner_name', 'address', 'neighborhood', 'agent_name', 'agent_phone'],
  },
  {
    id: 'market_update',
    name: 'Market Update Email',
    channel: 'email',
    subject: 'Market Update for {neighborhood}',
    body: `Hi {owner_name},

I wanted to share a quick update on the {neighborhood} market. Recent sales in your area suggest strong demand, and I thought you might find this useful.

As a property owner at {address}, you're in a great position. If you'd ever like to discuss your options, I'm here to help — completely confidential and no obligation.

Best,
{agent_name}
Mallan Real Estate Inc.`,
    merge_fields: ['owner_name', 'address', 'neighborhood', 'agent_name'],
  },
  {
    id: 'renovation_followup',
    name: 'Post-Renovation Follow-up',
    channel: 'email',
    subject: 'Your Recent Renovation at {address}',
    body: `Hi {owner_name},

I noticed some recent improvement work at {address} — congratulations on the upgrades! Renovations like these can significantly impact property values in {neighborhood}.

If you're curious how your improvements have affected your home's market value, I'd be happy to provide a complimentary updated assessment.

Best,
{agent_name}
Mallan Real Estate Inc.`,
    merge_fields: ['owner_name', 'address', 'neighborhood', 'agent_name'],
  },
  {
    id: 'cma_followup',
    name: 'CMA Request Follow-up',
    channel: 'email',
    subject: 'Your Market Analysis is Ready',
    body: `Hi {owner_name},

Thank you for your interest in a market analysis for {address}. I've prepared a comprehensive report based on recent comparable sales in {neighborhood}.

I'd love to walk you through the findings. Would you have 15 minutes this week for a quick call?

Best,
{agent_name}
{agent_phone}
Mallan Real Estate Inc.`,
    merge_fields: ['owner_name', 'address', 'neighborhood', 'agent_name', 'agent_phone'],
  },
  {
    id: 'long_term_owner',
    name: 'Long-Term Owner Outreach',
    channel: 'letter',
    subject: 'A Neighbor Reaching Out',
    body: `Dear {owner_name},

As someone who has called {neighborhood} home for many years, you've seen the area grow and change. The market today is quite different from when you first purchased at {address}.

Many long-term owners like yourself are curious about their property's current value, even if selling isn't on the immediate horizon. I offer complimentary, confidential market assessments — no strings attached.

If you'd like to know where things stand, I'd be happy to help.

Warm regards,
{agent_name}
Mallan Real Estate Inc.`,
    merge_fields: ['owner_name', 'address', 'neighborhood', 'agent_name'],
  },
];
