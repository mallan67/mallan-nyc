/**
 * Building Risk Intelligence — Scoring Engine
 *
 * Aggregates DOB violations, complaints, permits, and ECB penalties
 * into a single 0-100 risk score with letter grade.
 *
 * Lower score = lower risk = better building health.
 */
import { soda } from "@/lib/soda";

// ── Dataset IDs ──
const DS_VIOLATIONS = process.env.SODA_DATASET_DOB_VIOLATIONS!;
const DS_PERMITS = process.env.SODA_DATASET_DOB_PERMITS!;
const DS_COMPLAINTS = process.env.SODA_DATASET_DOB_COMPLAINTS!;
const DS_ECB = process.env.SODA_DATASET_OATH_ECB!;

// ── Types ──
export interface RiskComponent {
  name: string;
  score: number; // 0-100, higher = worse
  weight: number;
  detail: string;
  count: number;
}

export interface BuildingRiskReport {
  bbl: string;
  bin?: string;
  risk_score: number; // 0-100 composite, higher = worse
  grade: string; // A-F
  grade_label: string;
  components: RiskComponent[];
  summary: string;
  computed_at: string;
  violations: { total: number; open: number; class1_hazardous: number };
  complaints: { total: number; recent_12mo: number };
  ecb: { open: number; balance_due: number };
  permits: { total_3yr: number; active: number };
}

// ── Scoring helpers ──
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function grade(score: number): { grade: string; label: string } {
  if (score <= 15) return { grade: "A", label: "Excellent" };
  if (score <= 30) return { grade: "B", label: "Good" };
  if (score <= 50) return { grade: "C", label: "Fair" };
  if (score <= 70) return { grade: "D", label: "Concerning" };
  return { grade: "F", label: "High Risk" };
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().split("T")[0];
}

// ── Data fetchers ──
async function fetchViolations(bbl: string, bin?: string) {
  const where = bin ? `bin='${bin}'` : `bbl='${bbl}'`;
  const items = await soda<Record<string, string>>({
    resource: DS_VIOLATIONS,
    where,
    limit: 500,
    order: "issue_date DESC",
  });

  const open = items.filter(
    (v) =>
      v.violation_status?.toUpperCase() !== "RESOLVE" &&
      v.violation_status?.toUpperCase() !== "DISMISSED"
  );
  const class1 = items.filter(
    (v) =>
      v.violation_type?.toUpperCase()?.includes("CLASS 1") ||
      v.violation_type?.toUpperCase()?.includes("HAZARDOUS") ||
      v.violation_type?.toUpperCase()?.includes("IMMEDIATELY HAZARDOUS")
  );

  return { total: items.length, open: open.length, class1_hazardous: class1.length };
}

async function fetchComplaints(bbl: string, bin?: string) {
  const where = bin ? `bin='${bin}'` : `bbl='${bbl}'`;
  const items = await soda<Record<string, string>>({
    resource: DS_COMPLAINTS,
    where,
    limit: 500,
    order: "received_date DESC",
  });

  const cutoff = monthsAgo(12);
  const recent = items.filter((c) => (c.received_date || "") >= cutoff);

  return { total: items.length, recent_12mo: recent.length };
}

async function fetchECB(bbl: string) {
  const items = await soda<Record<string, string>>({
    resource: DS_ECB,
    where: `bbl='${bbl}' AND violation_status='OPEN'`,
    limit: 200,
    order: "violation_date DESC",
  });

  const balance = items.reduce(
    (sum, v) => sum + (Number(v.balance_due) || 0),
    0
  );

  return { open: items.length, balance_due: Math.round(balance * 100) / 100 };
}

async function fetchPermits(bbl: string, bin?: string) {
  const cutoff = monthsAgo(36);
  const whereBase = bin ? `bin='${bin}'` : `bbl='${bbl}'`;
  const items = await soda<Record<string, string>>({
    resource: DS_PERMITS,
    where: `${whereBase} AND job_filed_date >= '${cutoff}'`,
    limit: 200,
    order: "job_filed_date DESC",
  });

  const active = items.filter(
    (p) =>
      p.job_status?.toUpperCase() !== "X" && // not cancelled
      p.job_status?.toUpperCase() !== "R" // not refused
  );

  return { total_3yr: items.length, active: active.length };
}

// ── Main scorer ──
export async function computeBuildingRisk(
  bbl: string,
  bin?: string
): Promise<BuildingRiskReport> {
  // Fetch all data in parallel
  const [violations, complaints, ecb, permits] = await Promise.all([
    fetchViolations(bbl, bin),
    fetchComplaints(bbl, bin),
    fetchECB(bbl),
    fetchPermits(bbl, bin),
  ]);

  // ── Component 1: Open Violations (weight 30%) ──
  // 0 open = 0, 1-2 = 20, 3-5 = 40, 6-10 = 60, 11+ = 80, any Class 1 = +20
  let violScore = 0;
  if (violations.open >= 11) violScore = 80;
  else if (violations.open >= 6) violScore = 60;
  else if (violations.open >= 3) violScore = 40;
  else if (violations.open >= 1) violScore = 20;
  if (violations.class1_hazardous > 0) violScore = clamp(violScore + 20, 0, 100);

  const violComponent: RiskComponent = {
    name: "Open Violations",
    score: violScore,
    weight: 0.30,
    count: violations.open,
    detail: `${violations.open} open (${violations.class1_hazardous} hazardous) of ${violations.total} total`,
  };

  // ── Component 2: Complaints (weight 25%) ──
  // Recent 12mo: 0 = 0, 1-2 = 15, 3-5 = 35, 6-10 = 55, 11+ = 80
  let compScore = 0;
  if (complaints.recent_12mo >= 11) compScore = 80;
  else if (complaints.recent_12mo >= 6) compScore = 55;
  else if (complaints.recent_12mo >= 3) compScore = 35;
  else if (complaints.recent_12mo >= 1) compScore = 15;

  const compComponent: RiskComponent = {
    name: "Recent Complaints",
    score: compScore,
    weight: 0.25,
    count: complaints.recent_12mo,
    detail: `${complaints.recent_12mo} in last 12 months (${complaints.total} total)`,
  };

  // ── Component 3: ECB Penalties (weight 25%) ──
  // Open ECB: 0 = 0, 1-2 = 20, 3-5 = 45, 6+ = 70
  // Balance: $0 = +0, <$5k = +5, <$25k = +15, $25k+ = +30
  let ecbScore = 0;
  if (ecb.open >= 6) ecbScore = 70;
  else if (ecb.open >= 3) ecbScore = 45;
  else if (ecb.open >= 1) ecbScore = 20;
  if (ecb.balance_due >= 25000) ecbScore = clamp(ecbScore + 30, 0, 100);
  else if (ecb.balance_due >= 5000) ecbScore = clamp(ecbScore + 15, 0, 100);
  else if (ecb.balance_due > 0) ecbScore = clamp(ecbScore + 5, 0, 100);

  const ecbComponent: RiskComponent = {
    name: "ECB Penalties",
    score: ecbScore,
    weight: 0.25,
    count: ecb.open,
    detail: `${ecb.open} open violations, $${ecb.balance_due.toLocaleString()} balance due`,
  };

  // ── Component 4: Permit Activity (weight 20%, inverse — active permits = positive) ──
  // Active permits indicate maintenance. 0 permits in 3yr = 40 (neglect signal)
  // 1-2 = 20, 3-5 = 10, 6+ = 0
  let permitScore = 40;
  if (permits.active >= 6) permitScore = 0;
  else if (permits.active >= 3) permitScore = 10;
  else if (permits.active >= 1) permitScore = 20;

  const permitComponent: RiskComponent = {
    name: "Maintenance Activity",
    score: permitScore,
    weight: 0.20,
    count: permits.active,
    detail: `${permits.active} active permits in 3 years (${permits.total_3yr} filed)`,
  };

  // ── Composite score ──
  const components = [violComponent, compComponent, ecbComponent, permitComponent];
  const rawScore = components.reduce((sum, c) => sum + c.score * c.weight, 0);
  const risk_score = Math.round(clamp(rawScore, 0, 100));
  const { grade: g, label } = grade(risk_score);

  // ── Summary ──
  const issues: string[] = [];
  if (violations.class1_hazardous > 0) issues.push(`${violations.class1_hazardous} hazardous violation(s)`);
  if (violations.open > 5) issues.push(`${violations.open} open violations`);
  if (ecb.balance_due > 10000) issues.push(`$${ecb.balance_due.toLocaleString()} in ECB penalties`);
  if (complaints.recent_12mo > 5) issues.push(`${complaints.recent_12mo} complaints in 12 months`);
  if (permits.active === 0 && permits.total_3yr === 0) issues.push("no permit activity in 3 years");

  const summary =
    issues.length === 0
      ? "Building appears well-maintained with no significant risk indicators."
      : `Key concerns: ${issues.join("; ")}.`;

  return {
    bbl,
    bin,
    risk_score,
    grade: g,
    grade_label: label,
    components,
    summary,
    computed_at: new Date().toISOString(),
    violations,
    complaints,
    ecb,
    permits,
  };
}
