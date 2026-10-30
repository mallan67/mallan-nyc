/// <reference types="jest" />
/**
 * Follow-up to #460: make data/compliance/prohibited-terms.json the SINGLE source of truth for the
 * guardrails Fair Housing content lint, eliminating the stale src/ copy that left the CI lint ~64
 * terms (incl. all of #460's new terms) behind the runtime write-gate.
 *
 * Proves:
 *   1. the stale src/ copy is gone (single source)
 *   2. guardrails loads the canonical data/ file (src/ not referenced)
 *   4. public-facing neighborhood content is STILL scanned (not excluded)
 *   5. the corrected neighborhood phrases no longer contain school-proximity language
 *   6. #460's new Fair Housing terms are present in the canonical list the lint now enforces
 *   7. guardrails runs green end-to-end against the canonical list
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import AnswerBox from "@/app/components/neighborhoods/AnswerBox";
import StreetGuidanceSection from "@/app/components/neighborhoods/StreetGuidanceSection";
import BuyerPersonas from "@/app/components/neighborhoods/BuyerPersonas";
import MicroFAQ from "@/app/components/neighborhoods/MicroFAQ";
import type { Neighborhood } from "@/lib/types/neighborhood";

const ROOT = path.resolve(__dirname, "../..");
const guardrailsSrc = fs.readFileSync(path.join(ROOT, "scripts/ci/guardrails.mjs"), "utf8");

describe("guardrails prohibited-terms: single canonical source (data/)", () => {
  it("1. the stale src/compliance/prohibited-terms.json copy is removed", () => {
    expect(fs.existsSync(path.join(ROOT, "src/compliance/prohibited-terms.json"))).toBe(false);
  });

  it("2. guardrails loads the canonical data/ file and does not reference the src/ copy", () => {
    expect(guardrailsSrc).toMatch(/data\/compliance\/prohibited-terms\.json/);
    expect(guardrailsSrc).not.toMatch(/src\/compliance\/prohibited-terms\.json/);
  });

  it("4. public-facing neighborhood JSON is NOT excluded (still scanned)", () => {
    // The neighborhoods files must remain in scope — they render on public routes.
    expect(guardrailsSrc).not.toMatch(/neighborhoods?\\?\.?json/i);
  });

  it("5. corrected neighborhood phrases drop school-proximity language (no family/school proxy)", () => {
    for (const f of ["data/manhattan-neighborhoods.json", "data/staten-island-neighborhoods.json"]) {
      const txt = fs.readFileSync(path.join(ROOT, f), "utf8").toLowerCase();
      expect(txt).not.toContain("near schools");
      expect(txt).not.toContain("near school");
    }
  });

  it("6. #460's new Fair Housing terms are in the canonical list the lint enforces", () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/compliance/prohibited-terms.json"), "utf8"));
    const flat = (data.flatList as string[]).map((t) => t.toLowerCase());
    for (const term of ["no cityfheps", "adults only", "55+", "must pass background check", "section 8 not accepted"]) {
      expect(flat).toContain(term);
    }
  });

  it("8. guardrails derives terms from the authoritative `categories` (covers terms flatList omits)", () => {
    // The runtime write-gate (rls-enforcement.ts) iterates `categories`; the denormalized flatList can
    // omit category terms (e.g. `family-friendly`, `top schools`). The lint must read categories too,
    // or content with those terms passes CI while the runtime gate blocks it (Codex #461).
    expect(guardrailsSrc).toMatch(/data\.categories/);
  });

  it("9. content surfaced by the category terms is clean (no 'family-friendly' steering phrase)", () => {
    const txt = fs.readFileSync(path.join(ROOT, "src/data/geography/neighborhoods.json"), "utf8").toLowerCase();
    expect(txt).not.toContain("family-friendly");
  });

  it("10. flatList is a COMPLETE mirror of categories (no category term missing — no internal drift)", () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, "data/compliance/prohibited-terms.json"), "utf8"));
    const catTerms = [...new Set(Object.values(data.categories as Record<string, { terms: string[] }>).flatMap((c) => c.terms || []))];
    const flat = new Set((data.flatList as string[]).map((t) => t.toLowerCase()));
    const missing = catTerms.filter((t) => !flat.has(t.toLowerCase()));
    expect(missing).toEqual([]);
  });

  it("7. guardrails runs green end-to-end against the canonical list", () => {
    // Exits 0 (PASS). Throws on non-zero exit.
    const out = execSync("node scripts/ci/guardrails.mjs", { cwd: ROOT, encoding: "utf8" });
    expect(out).toMatch(/Guardrails passed/i);
  });
});

/**
 * Word-level Fair Housing guard for Mallan-written neighbourhood copy (owner instruction, Maya Allan, 2026-10-30:
 * no family or children wording; protected-class and familial-status language is a fine exposure; a school may be named as a plain
 * fact in an FAQ, never with a judgement or an audience).
 *
 * The CI lint above only matches exact multi-word phrases ("top schools", "family-friendly"), so "Top School", "excellent for families"
 * or "Is X safe?" passed it. This checks WORDS, over what a visitor sees: every text field of the 59 records AND the HTML the real
 * neighbourhood components render for each record.
 *
 * Deliberately NOT covered: listing text written by other agents (never edited), MLS property-type vocabulary used by search filters,
 * and the names of landmarks, museums, streets and cuisines, which describe places and not people.
 */
const FH_WORDS: Array<[string, RegExp]> = [
  ['familial', /\b(?:famil(?:y|ies)|child(?:ren)?(?:['’]s)?|kids?|toddlers?|bab(?:y|ies)|infants?|parents?|parenting|strollers?|teen(?:s|agers?)?|students?|pediatric|nurser(?:y|ies)|day ?care|after-school)\b/i],
  ['school', /\b(?:schools?|elementary|kindergarten|charter)\b|\bacademy\b(?! of Music)/i],
  // Public-school numbers are matched case-sensitively: "is 15 minutes" is not a school.
  ['school number', /\bP\.?S\.?\s?\d+|\bPS\/IS\b|\bIS\s\d+[A-Z]?\b/],
  ['age', /\b(?:young|youth|seniors?|elderly|retire\w*|empty[- ]nest\w*|millennials?|generational|downsiz\w+)\b/i],
  ['marital/sex', /\b(?:couples?|married|bachelor|newlywed\w*|singles|men|women|guys)\b/i],
  ['steering', /\b(?:safe|safer|safest|safety|crime|dangerous|gentrif\w+|up-and-coming|affluent|wealth\w*|elite|prestigious|working[- ]class|blue[- ]collar|gritty|rough|transitional|exclusive|upscale|trendy|hip)\b/i],
  ['ethnic/religion', /\b(?:diverse|diversity|multicultural|immigrants?|ethnic\w*|synagogues?|mosques?|jewish|catholic|jesuit|anglican)\b/i],
  ['disability', /\bwalking distance\b/i],
  // Statements about WHO lives somewhere or who a place is for (Master 21.12: describing a place is describing who lives in it).
  ['resident character', /\b(?:grit|tight-knit|bloody|jesus|richest|east meets west|tenant (?:quality|pools?)|(?:community|neighborhood) (?:pride|ties|identity)|(?:long-?time|long-term|stable) residents|international (?:buyers|purchasers)|homeowners (?:moving|transitioning|seeking|looking)|deeply rooted)\b/i],
];
// Proper names and street-number idioms that trip a word but are not statements about people.
const ALLOWED_NAMES = [/MoMA PS1/g, /Brooklyn Academy of Music/g, /\b(?:in the|low|mid|high|upper) teens\b/gi];
// OWNER INSTRUCTION (Maya Allan, 2026-10-30): "school to mention is fine, but it should not say for families, just state fact like there
// is coffee shop with no referencing". So a school may be NAMED as a plain fact (which school, where), only in FAQ answers and questions,
// and never in a sentence that also judges, ranks, zones or targets: no quality words, no school-district or zoning words, no demand words.
// (Family, child and student words are banned everywhere by the 'familial' pattern above.)
const SCHOOL_WORDS = /\b(?:schools?|elementary|kindergarten|charter)\b|\bacademy\b(?! of Music)/i;
const SCHOOL_NUMBERS = /\bP\.?S\.?\s?\d+|\bPS\/IS\b|\bIS\s\d+[A-Z]?\b/;
const SCHOOL_JUDGEMENT = /\b(?:well|highly)[- ]regarded\b|\brated\b|\branked?\b|\branking\b|\btop\b|\bbest\b|\bexcellent\b|\bgood\b|\bgreat\b|\bsought[- ]after\b|\bpopular\b|\bimproving\b|\bprime\b|\bquality\b|\belite\b|\breputation\b|\bprestigious\b|\bzoned\b|school[- ]district|\bdistrict\s+\d+|\bcatchment\b|\bnotable\b|\bacclaimed\b|\bleading\b|\bdemand\b|\bdriver\b|\bserves?\b|\bserved\b|\binvested\b/i;
function schoolSentenceHits(text: string): string[] {
  return text
    .replace(/\bGreat Kills\b/g, 'Kills') // a place name, not a judgement
    .split(/(?<=[.!?])\s+/)
    .filter((s) => (SCHOOL_WORDS.test(s) || SCHOOL_NUMBERS.test(s)) && SCHOOL_JUDGEMENT.test(s))
    .map((s) => `school mentioned with judgement: "${s.trim()}"`);
}
function fhHits(text: string, schoolFacts = false): string[] {
  let t = text;
  for (const a of ALLOWED_NAMES) t = t.replace(a, ' ');
  const hits = FH_WORDS.filter(([label]) => !(schoolFacts && (label === 'school' || label === 'school number'))).flatMap(([label, re]) => {
    const m = t.match(re);
    return m ? [`${label}: "${m[0]}"`] : [];
  });
  return schoolFacts ? [...hits, ...schoolSentenceHits(t)] : hits;
}

describe('neighbourhood guide copy: no school, family, child or protected-class wording (word-level)', () => {
  const FILES = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten-island'].map((b) => `data/${b}-neighborhoods.json`);
  type Rec = Record<string, unknown> & { slug: string };
  const records: Rec[] = FILES.flatMap((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    return (Array.isArray(j) ? j : j.neighborhoods) as Rec[];
  });

  function leaves(v: unknown, p: string, out: Array<[string, string]>): Array<[string, string]> {
    if (typeof v === 'string') out.push([p, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => leaves(x, `${p}[${i}]`, out));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) leaves(x, p ? `${p}.${k}` : k, out);
    return out;
  }

  it('covers all 59 records', () => {
    expect(records).toHaveLength(59);
  });

  it('no text field of any record contains a banned word', () => {
    const found = records.flatMap((r) =>
      leaves(r, '', [])
        .filter(([p]) => !/^(heroImage|ogImage|slug|ctas)/.test(p) && !/\.(href|slug)$/.test(p))
        .flatMap(([p, v]) => fhHits(v, /^faqs\[\d+\]\.(?:question|answer)$/.test(p)).map((h) => `${r.slug} ${p} -> ${h}`)),
    );
    expect(found).toEqual([]);
  });

  it('every persona card reads as a sentence (no "First-time Properties featuring...", doubled phrases or "Properties with ... properties")', () => {
    const broken = records.flatMap((r) =>
      ((r.buyerPersonas as Array<{ description: string }>) ?? []).flatMap((p, i) =>
        [
          /^(?:First-time|Budget-conscious) Properties\b/, /\bfrom Properties\b/, /^[A-Z][a-z]+ Listings\b/,
          /\bProperties (?:with|featuring|in|near|offering) [^.]*\bproperties\b/, /(\bshort commute\b)[^.]*\1/i,
        ]
          .filter((re) => re.test(p.description))
          .map((re) => `${r.slug} buyerPersonas[${i}] ${re}: ${p.description}`),
      ),
    );
    expect(broken).toEqual([]);
  });

  it('the school rule: a school may be named as a plain fact; a judgement, a ranking, zoning or an audience may not accompany it', () => {
    const facts = ['PS 41 Greenwich Village is on West 11th Street.', 'Private schools in the area include St. Luke\'s School and the Little Red School House.', 'The development includes market-rate and affordable housing, a new school, and 3.5 acres of public parkland.'];
    for (const s of facts) expect(fhHits(s, true)).toEqual([]);
    const judged = ['PS 321 is a well-regarded public school.', 'The area has the best public schools in Queens.', 'PS 130 is the zoned elementary school.', 'School quality is a primary driver of residential demand.', 'PS 29 is one of Brooklyn\'s most sought-after schools.'];
    for (const s of judged) expect(fhHits(s, true).length).toBeGreaterThan(0);
    expect(fhHits('Excellent schools for families.', true).length).toBeGreaterThan(0);
    // outside an FAQ every school word is still refused
    expect(fhHits('PS 41 Greenwich Village is on West 11th Street.', false).length).toBeGreaterThan(0);
  });

  it('no record carries a school field', () => {
    expect(records.filter((r) => 'topSchool' in r || 'topSchools' in r).map((r) => r.slug)).toEqual([]);
  });

  it('what the real components render for each record has no banned word and no "Schools"/"Top School" heading', () => {
    const text = (el: ReturnType<typeof createElement>) =>
      renderToStaticMarkup(el).replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
    const found: string[] = [];
    for (const r of records) {
      const n = r as unknown as Neighborhood;
      const rendered = [
        text(createElement(AnswerBox, { neighborhood: n })),
        text(createElement(StreetGuidanceSection, { name: n.name, guidance: n.streetGuidance })),
        text(createElement(BuyerPersonas, { name: n.name, personas: n.buyerPersonas })),
      ].join('\n');
      for (const h of fhHits(rendered)) found.push(`${r.slug} -> ${h}`);
      // The FAQ block is the one place a school may be named, as a plain fact.
      for (const h of fhHits(text(createElement(MicroFAQ, { name: n.name, faqs: n.faqs })), true)) found.push(`${r.slug} FAQ -> ${h}`);
    }
    expect(found).toEqual([]);
  });

  it('Mallan-written marketing pages do not name families or young people as a target, or use "walking distance"', () => {
    const PAGES = [
      'app/sell/townhouses/upper-west-side/page.tsx', 'app/sell/townhouses/page.tsx', 'app/buy/townhouses/page.tsx',
      'app/buy/international/page.tsx', 'app/brooklyn/page.tsx', 'app/queens/page.tsx', 'app/staten-island/page.tsx',
      'app/bronx/page.tsx', 'app/manhattan/page.tsx', 'lib/neighborhoods/boroughs.ts',
    ];
    const bad = PAGES.flatMap((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return [/\bfamil(?:y|ies)\b/i, /\byoung\b/i, /walking distance/i, /\bprestigious\b/i, /\bdiverse\b/i, /\bethnic\w*/i, /\bemerging neighborhoods?\b/i, /\bneighborhood evolves\b/i, /\bimproving (?:neighborhood|schools?)\b/i].filter((re) => re.test(src)).map((re) => `${f} ${re}`);
    });
    expect(bad).toEqual([]);
  });

  it('the amenity label is "Playroom", not "Children\'s Playroom", wherever the public site labels it', () => {
    for (const f of ['app/listing/[...slug]/page.tsx', 'lib/buildings/public-building-data.ts', 'lib/search/types.ts']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect(`${f}: ${/Children's Playroom/.test(src)}`).toBe(`${f}: false`);
    }
  });
});
