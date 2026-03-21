/**
 * lib/pdf/pitch-packet-renderer.tsx
 *
 * Generates a professional PDF pitch packet for seller prospects
 * using @react-pdf/renderer (serverless-friendly, no Puppeteer).
 *
 * Consumed by: GET /api/crm/sales/prospects/[id]/pdf
 */

import React from "react";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";

// ── Types ─────────────────────────────────────────────────────────────

interface ProspectData {
  address: string | null;
  unit: string | null;
  borough: string | null;
  neighborhood: string | null;
  postal_code: string | null;
  property_type: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  year_built: number | null;
  building_name: string | null;
  floors: number | null;
  units_total: number | null;
  owner_name: string | null;
  ownership_years: number | null;
  last_purchase_price: number | null;
  last_purchase_date: string | Date | null;
  market_value: number | null;
  assessed_value: number | null;
  annual_tax: number | null;
  tax_class: string | null;
  open_violations: number | null;
  recent_permits: number | null;
}

interface RecentSale {
  address: string;
  unit: string | null;
  close_price: number | null;
  close_date: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
}

interface ActiveComp {
  address: string;
  unit: string | null;
  list_price: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  property_type: string | null;
}

interface PricePoints {
  conservative: number;
  conservative_label: string | null;
  recommended: number;
  recommended_label: string | null;
  aspirational: number;
  aspirational_label: string | null;
}

interface Competition {
  active_count: number;
  price_range_low: number | null;
  price_range_high: number | null;
  price_range_label: string | null;
}

interface PricingStrategy {
  price_points: PricePoints;
  comps_used: number;
  prospect_sqft: number;
  competition: Competition;
  absorption_rate: number | null;
  absorption_label: string;
  closed_12mo_count: number;
}

interface ExposureLayer {
  name: string;
  description: string;
  reach: number | string;
}

interface ExposurePlan {
  buyer_database: number;
  agent_network: number;
  firms: number;
  idx_providers: number;
  linkedin_followers: number;
  syndication_portals: string[];
  layers: ExposureLayer[];
}

interface FinancialPicture {
  gross_price: number;
  gross_label: string;
  commission_rate: number;
  commission: number;
  commission_label: string;
  transfer_tax_rate: number;
  transfer_tax: number;
  transfer_tax_label: string;
  attorney_fees: number;
  attorney_fees_label: string;
  mortgage_payoff: number;
  mortgage_payoff_label: string;
  net_proceeds: number;
  net_proceeds_label: string;
  disclaimer: string;
}

export interface PitchPacketData {
  prospect_id: string;
  agent_name: string;
  generated_at: string;
  property_intel: {
    prospect_data: ProspectData;
    recent_sales: RecentSale[];
    active_competition: ActiveComp[];
  };
  pricing_strategy: PricingStrategy;
  exposure_plan: ExposurePlan;
  financial_picture: FinancialPicture;
  attribution: string;
}

// ── Colors ────────────────────────────────────────────────────────────

const GOLD = "#B8860B";
const DARK = "#111827";
const GRAY = "#6B7280";
const LIGHT_GRAY = "#F3F4F6";
const WHITE = "#FFFFFF";

// ── Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 72,
    paddingHorizontal: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: DARK,
  },

  // Header (every page)
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
    paddingBottom: 8,
    marginBottom: 20,
  },
  headerLeft: {},
  brokerageName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 2,
    color: DARK,
  },
  headerSubText: {
    fontSize: 7,
    color: GRAY,
    marginTop: 2,
  },
  headerRight: {
    alignItems: "flex-end",
  },

  // Footer (every page)
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    borderTopWidth: 1,
    borderTopColor: LIGHT_GRAY,
    paddingTop: 6,
  },
  footerAttribution: {
    fontSize: 6,
    color: GRAY,
    marginBottom: 3,
  },
  footerLine: {
    fontSize: 7,
    color: GRAY,
  },

  // Page titles
  pageTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: DARK,
    marginBottom: 4,
  },
  pageTitleAccent: {
    width: 40,
    height: 3,
    backgroundColor: GOLD,
    marginBottom: 16,
  },

  // Cover page
  coverAddress: {
    fontSize: 24,
    fontFamily: "Helvetica-Bold",
    color: DARK,
    marginTop: 40,
    marginBottom: 4,
  },
  coverUnit: {
    fontSize: 16,
    color: GRAY,
    marginBottom: 8,
  },
  coverOwner: {
    fontSize: 12,
    color: GRAY,
    marginBottom: 24,
  },
  coverPrepared: {
    fontSize: 10,
    color: GRAY,
    marginBottom: 4,
  },
  statsRow: {
    flexDirection: "row",
    marginTop: 16,
    marginBottom: 20,
  },
  statBox: {
    backgroundColor: LIGHT_GRAY,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
    borderRadius: 4,
    minWidth: 80,
    alignItems: "center",
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  statLabel: {
    fontSize: 7,
    color: GRAY,
    marginTop: 2,
    textTransform: "uppercase",
  },
  readinessBox: {
    backgroundColor: GOLD,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginRight: 8,
    borderRadius: 4,
    minWidth: 80,
    alignItems: "center",
  },
  readinessValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
  },
  readinessLabel: {
    fontSize: 7,
    color: WHITE,
    marginTop: 2,
    textTransform: "uppercase",
  },

  // Comp table
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: DARK,
    marginTop: 16,
    marginBottom: 6,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: DARK,
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 2,
    marginBottom: 2,
  },
  tableHeaderText: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: WHITE,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: LIGHT_GRAY,
  },
  tableRowAlt: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 0.5,
    borderBottomColor: LIGHT_GRAY,
  },
  cellAddress: { width: "35%", fontSize: 8 },
  cellSmall: { width: "13%", fontSize: 8, textAlign: "right" },

  // Pricing
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  priceCard: {
    width: "31%",
    borderWidth: 1,
    borderColor: LIGHT_GRAY,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  priceCardHighlight: {
    width: "31%",
    borderWidth: 2,
    borderColor: GOLD,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    backgroundColor: "#FFFBEB",
  },
  priceCardLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: GRAY,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  priceCardValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  priceCardValueHighlight: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: GOLD,
  },
  priceCardPsf: {
    fontSize: 8,
    color: GRAY,
    marginTop: 2,
  },

  // Metric boxes
  metricRow: {
    flexDirection: "row",
    marginTop: 12,
    marginBottom: 8,
  },
  metricBox: {
    backgroundColor: LIGHT_GRAY,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginRight: 10,
    minWidth: 130,
  },
  metricValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  metricLabel: {
    fontSize: 7,
    color: GRAY,
    marginTop: 2,
    textTransform: "uppercase",
  },

  // Exposure layers
  layerBox: {
    flexDirection: "row",
    borderLeftWidth: 3,
    borderLeftColor: GOLD,
    paddingVertical: 8,
    paddingLeft: 12,
    marginBottom: 8,
    backgroundColor: "#FAFAFA",
    borderRadius: 2,
  },
  layerNumber: {
    width: 28,
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: GOLD,
  },
  layerContent: {
    flex: 1,
  },
  layerName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: DARK,
    marginBottom: 2,
  },
  layerDescription: {
    fontSize: 9,
    color: GRAY,
  },
  layerServicesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 16,
    gap: 6,
  },
  serviceTag: {
    backgroundColor: LIGHT_GRAY,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 3,
    fontSize: 8,
    color: DARK,
  },

  // Financial table
  finRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: LIGHT_GRAY,
  },
  finRowHighlight: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "#FFFBEB",
    borderTopWidth: 2,
    borderTopColor: GOLD,
    borderRadius: 4,
    marginTop: 4,
  },
  finLabel: {
    fontSize: 10,
    color: DARK,
  },
  finLabelBold: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: DARK,
  },
  finValue: {
    fontSize: 10,
    color: DARK,
    textAlign: "right",
  },
  finValueBold: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: GOLD,
    textAlign: "right",
  },
  finDisclaimer: {
    fontSize: 7,
    color: GRAY,
    marginTop: 12,
    fontStyle: "italic",
  },

  // Helpers
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: LIGHT_GRAY,
    marginVertical: 10,
  },
  textBody: {
    fontSize: 9,
    color: GRAY,
    lineHeight: 1.5,
    marginBottom: 6,
  },
});

// ── Helpers ───────────────────────────────────────────────────────────

function usd(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "N/A";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function num(n: number | null | undefined): string {
  if (n == null) return "--";
  return n.toLocaleString("en-US");
}

function psfLabel(price: number, sqft: number): string {
  if (!sqft || !price) return "";
  return `$${Math.round(price / sqft).toLocaleString("en-US")}/sqft`;
}

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ── Shared components ─────────────────────────────────────────────────

function Header() {
  return (
    <View style={s.headerBar}>
      <View style={s.headerLeft}>
        <Text style={s.brokerageName}>MALLAN REAL ESTATE INC.</Text>
        <Text style={s.headerSubText}>
          400 East 90th Street, Suite 17C, New York, NY 10128
        </Text>
      </View>
      <View style={s.headerRight}>
        <Text style={s.headerSubText}>646-258-4460</Text>
        <Text style={s.headerSubText}>mallan.nyc</Text>
      </View>
    </View>
  );
}

function Footer({ attribution, date }: { attribution: string; date: string }) {
  return (
    <View style={s.footer} fixed>
      <Text style={s.footerAttribution}>{attribution}</Text>
      <Text style={s.footerLine}>
        Prepared by Mallan Real Estate Inc. | mallan.nyc | {date}
      </Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View>
      <Text style={s.pageTitle}>{title}</Text>
      <View style={s.pageTitleAccent} />
    </View>
  );
}

// ── Page 1: Cover + Property Intel ────────────────────────────────────

function CoverPage({
  data,
  preparedDate,
}: {
  data: PitchPacketData;
  preparedDate: string;
}) {
  const p = data.property_intel.prospect_data;
  const sales = data.property_intel.recent_sales;

  return (
    <Page size="LETTER" style={s.page}>
      <Header />
      <Footer attribution={data.attribution} date={preparedDate} />

      <Text style={s.coverAddress}>{p.address || "Property Address"}</Text>
      {p.unit ? <Text style={s.coverUnit}>Unit {p.unit}</Text> : null}
      {p.owner_name ? (
        <Text style={s.coverOwner}>Prepared for {p.owner_name}</Text>
      ) : null}
      <Text style={s.coverPrepared}>
        Prepared by {data.agent_name} | {preparedDate}
      </Text>

      {/* Key stats */}
      <View style={s.statsRow}>
        {p.beds != null ? (
          <View style={s.statBox}>
            <Text style={s.statValue}>{p.beds}</Text>
            <Text style={s.statLabel}>Beds</Text>
          </View>
        ) : null}
        {p.baths != null ? (
          <View style={s.statBox}>
            <Text style={s.statValue}>{p.baths}</Text>
            <Text style={s.statLabel}>Baths</Text>
          </View>
        ) : null}
        {p.sqft ? (
          <View style={s.statBox}>
            <Text style={s.statValue}>{num(p.sqft)}</Text>
            <Text style={s.statLabel}>Sq Ft</Text>
          </View>
        ) : null}
        {p.year_built ? (
          <View style={s.statBox}>
            <Text style={s.statValue}>{p.year_built}</Text>
            <Text style={s.statLabel}>Year Built</Text>
          </View>
        ) : null}
        {p.floors ? (
          <View style={s.statBox}>
            <Text style={s.statValue}>{p.floors}</Text>
            <Text style={s.statLabel}>Floors</Text>
          </View>
        ) : null}
      </View>

      {/* Recent Sales in Building */}
      {sales.length > 0 ? (
        <View>
          <Text style={s.sectionLabel}>
            Recent Sales in Building ({sales.length})
          </Text>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, s.cellAddress]}>Address</Text>
            <Text style={[s.tableHeaderText, s.cellSmall]}>Price</Text>
            <Text style={[s.tableHeaderText, s.cellSmall]}>Beds</Text>
            <Text style={[s.tableHeaderText, s.cellSmall]}>Baths</Text>
            <Text style={[s.tableHeaderText, s.cellSmall]}>Sq Ft</Text>
            <Text style={[s.tableHeaderText, s.cellSmall]}>Date</Text>
          </View>
          {sales.map((sale, i) => (
            <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={s.cellAddress}>
                {sale.address}
                {sale.unit ? ` #${sale.unit}` : ""}
              </Text>
              <Text style={s.cellSmall}>{usd(sale.close_price)}</Text>
              <Text style={s.cellSmall}>{sale.beds ?? "--"}</Text>
              <Text style={s.cellSmall}>{sale.baths ?? "--"}</Text>
              <Text style={s.cellSmall}>{num(sale.sqft)}</Text>
              <Text style={s.cellSmall}>{formatDate(sale.close_date)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Page>
  );
}

// ── Page 2: Pricing Strategy ──────────────────────────────────────────

function PricingPage({
  data,
  preparedDate,
}: {
  data: PitchPacketData;
  preparedDate: string;
}) {
  const ps = data.pricing_strategy;
  const pp = ps.price_points;
  const sqft = ps.prospect_sqft;

  return (
    <Page size="LETTER" style={s.page}>
      <Header />
      <Footer attribution={data.attribution} date={preparedDate} />
      <SectionTitle title="Pricing Strategy" />

      <Text style={s.textBody}>
        Based on {ps.comps_used} comparable sales and {ps.competition.active_count}{" "}
        active listings in the area, we recommend three pricing strategies.
      </Text>

      {/* 3 price cards */}
      <View style={s.priceRow}>
        <View style={s.priceCard}>
          <Text style={s.priceCardLabel}>Conservative</Text>
          <Text style={s.priceCardValue}>
            {pp.conservative_label || "N/A"}
          </Text>
          {sqft > 0 && pp.conservative > 0 ? (
            <Text style={s.priceCardPsf}>
              {psfLabel(pp.conservative, sqft)}
            </Text>
          ) : null}
        </View>
        <View style={s.priceCardHighlight}>
          <Text style={s.priceCardLabel}>Recommended</Text>
          <Text style={s.priceCardValueHighlight}>
            {pp.recommended_label || "N/A"}
          </Text>
          {sqft > 0 && pp.recommended > 0 ? (
            <Text style={s.priceCardPsf}>
              {psfLabel(pp.recommended, sqft)}
            </Text>
          ) : null}
        </View>
        <View style={s.priceCard}>
          <Text style={s.priceCardLabel}>Aspirational</Text>
          <Text style={s.priceCardValue}>
            {pp.aspirational_label || "N/A"}
          </Text>
          {sqft > 0 && pp.aspirational > 0 ? (
            <Text style={s.priceCardPsf}>
              {psfLabel(pp.aspirational, sqft)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Metrics */}
      <View style={s.metricRow}>
        <View style={s.metricBox}>
          <Text style={s.metricValue}>{ps.competition.active_count}</Text>
          <Text style={s.metricLabel}>Active Competitors</Text>
        </View>
        <View style={s.metricBox}>
          <Text style={s.metricValue}>{ps.absorption_label}</Text>
          <Text style={s.metricLabel}>Absorption Rate</Text>
        </View>
        <View style={s.metricBox}>
          <Text style={s.metricValue}>{ps.closed_12mo_count}</Text>
          <Text style={s.metricLabel}>Closed (12 months)</Text>
        </View>
      </View>

      {/* Competition price range */}
      {ps.competition.price_range_label ? (
        <View style={{ marginTop: 8 }}>
          <Text style={s.sectionLabel}>Competition Price Range</Text>
          <Text style={s.textBody}>{ps.competition.price_range_label}</Text>
        </View>
      ) : null}

      {/* Active competition table */}
      {data.property_intel.active_competition.length > 0 ? (
        <View style={{ marginTop: 8 }}>
          <Text style={s.sectionLabel}>
            Active Competition ({data.property_intel.active_competition.length})
          </Text>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, s.cellAddress]}>Address</Text>
            <Text style={[s.tableHeaderText, s.cellSmall]}>List Price</Text>
            <Text style={[s.tableHeaderText, s.cellSmall]}>Beds</Text>
            <Text style={[s.tableHeaderText, s.cellSmall]}>Baths</Text>
            <Text style={[s.tableHeaderText, s.cellSmall]}>Sq Ft</Text>
          </View>
          {data.property_intel.active_competition.slice(0, 6).map((comp, i) => (
            <View key={i} style={i % 2 === 0 ? s.tableRow : s.tableRowAlt}>
              <Text style={s.cellAddress}>
                {comp.address}
                {comp.unit ? ` #${comp.unit}` : ""}
              </Text>
              <Text style={s.cellSmall}>{usd(comp.list_price)}</Text>
              <Text style={s.cellSmall}>{comp.beds ?? "--"}</Text>
              <Text style={s.cellSmall}>{comp.baths ?? "--"}</Text>
              <Text style={s.cellSmall}>{num(comp.sqft)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Page>
  );
}

// ── Page 3: Exposure Plan ─────────────────────────────────────────────

function ExposurePage({
  data,
  preparedDate,
}: {
  data: PitchPacketData;
  preparedDate: string;
}) {
  const ep = data.exposure_plan;

  const layerDetails: { name: string; description: string }[] = [
    {
      name: "Private Buyer Database",
      description: `${ep.buyer_database.toLocaleString()} qualified buyers actively searching in our CRM`,
    },
    {
      name: "Local Exposure",
      description: `StreetEasy + mallan.nyc + ${ep.firms}+ brokerage websites + ${ep.linkedin_followers.toLocaleString()} LinkedIn followers`,
    },
    {
      name: "Agent Network",
      description: `REBNY RLS — ${ep.agent_network.toLocaleString()}+ licensed agents across ${ep.firms}+ firms`,
    },
    {
      name: "National Portals",
      description:
        "Zillow, Realtor.com, Redfin, Homes.com, RentHop — millions of monthly visitors",
    },
    {
      name: "International Reach",
      description: "ListHub distribution to 100+ global real estate portals",
    },
  ];

  const services = [
    "Professional Photography",
    "3D Virtual Tours",
    "Floor Plans",
    "Video Walkthrough",
    "Open Houses",
    "Targeted Digital Ads",
    "Email Campaigns",
    "Social Media Marketing",
  ];

  return (
    <Page size="LETTER" style={s.page}>
      <Header />
      <Footer attribution={data.attribution} date={preparedDate} />
      <SectionTitle title="Marketing & Exposure Plan" />

      <Text style={s.textBody}>
        Your listing will receive maximum exposure through our five-layer
        marketing strategy, reaching buyers at every level — from our private
        database to international portals.
      </Text>

      {/* 5 layers */}
      {layerDetails.map((layer, i) => (
        <View key={i} style={s.layerBox}>
          <Text style={s.layerNumber}>{i + 1}</Text>
          <View style={s.layerContent}>
            <Text style={s.layerName}>{layer.name}</Text>
            <Text style={s.layerDescription}>{layer.description}</Text>
          </View>
        </View>
      ))}

      {/* Services */}
      <Text style={[s.sectionLabel, { marginTop: 16 }]}>
        Included Services
      </Text>
      <View style={s.layerServicesRow}>
        {services.map((svc, i) => (
          <Text key={i} style={s.serviceTag}>
            {svc}
          </Text>
        ))}
      </View>

      {/* Syndication portals */}
      <Text style={[s.sectionLabel, { marginTop: 16 }]}>
        Syndication Partners
      </Text>
      <Text style={s.textBody}>
        {ep.syndication_portals.join("  |  ")}
      </Text>
    </Page>
  );
}

// ── Page 4: Financial Picture ─────────────────────────────────────────

function FinancialPage({
  data,
  preparedDate,
}: {
  data: PitchPacketData;
  preparedDate: string;
}) {
  const fp = data.financial_picture;

  return (
    <Page size="LETTER" style={s.page}>
      <Header />
      <Footer attribution={data.attribution} date={preparedDate} />
      <SectionTitle title="Estimated Net Proceeds" />

      <Text style={s.textBody}>
        Below is an estimate of your net proceeds based on the recommended list
        price. All figures are approximate and subject to final negotiation.
      </Text>

      {/* Financial rows */}
      <View style={{ marginTop: 8 }}>
        <View style={s.finRow}>
          <Text style={s.finLabel}>Estimated Sale Price</Text>
          <Text style={s.finValue}>{fp.gross_label}</Text>
        </View>
        <View style={s.finRow}>
          <Text style={s.finLabel}>
            Less: Broker Commission ({(fp.commission_rate * 100).toFixed(0)}%)
          </Text>
          <Text style={s.finValue}>({fp.commission_label})</Text>
        </View>
        <View style={s.finRow}>
          <Text style={s.finLabel}>
            Less: NYC/NYS Transfer Tax ({(fp.transfer_tax_rate * 100).toFixed(2)}%)
          </Text>
          <Text style={s.finValue}>({fp.transfer_tax_label})</Text>
        </View>
        <View style={s.finRow}>
          <Text style={s.finLabel}>Less: Estimated Attorney Fees</Text>
          <Text style={s.finValue}>({fp.attorney_fees_label})</Text>
        </View>
        {fp.mortgage_payoff > 0 ? (
          <View style={s.finRow}>
            <Text style={s.finLabel}>Less: Estimated Mortgage Payoff</Text>
            <Text style={s.finValue}>({fp.mortgage_payoff_label})</Text>
          </View>
        ) : null}

        {/* Net proceeds total */}
        <View style={s.finRowHighlight}>
          <Text style={s.finLabelBold}>Estimated Net Proceeds</Text>
          <Text style={s.finValueBold}>{fp.net_proceeds_label}</Text>
        </View>
      </View>

      {/* Disclaimer */}
      <Text style={s.finDisclaimer}>{fp.disclaimer}</Text>

      {/* CTA */}
      <View
        style={{
          marginTop: 32,
          backgroundColor: LIGHT_GRAY,
          padding: 16,
          borderRadius: 4,
          borderLeftWidth: 4,
          borderLeftColor: GOLD,
        }}
      >
        <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: DARK, marginBottom: 4 }}>
          Ready to take the next step?
        </Text>
        <Text style={{ fontSize: 9, color: GRAY, lineHeight: 1.5 }}>
          Contact {data.agent_name} at Mallan Real Estate Inc. to schedule a
          complimentary consultation and discuss the best strategy for your
          property.
        </Text>
        <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: GOLD, marginTop: 8 }}>
          646-258-4460 | mallan.nyc
        </Text>
      </View>
    </Page>
  );
}

// ── Document ──────────────────────────────────────────────────────────

function PitchPacketDocument({ data }: { data: PitchPacketData }) {
  const preparedDate = formatDate(data.generated_at) || formatDate(new Date());

  return (
    <Document
      title={`Pitch Packet — ${data.property_intel.prospect_data.address || "Property"}`}
      author="Mallan Real Estate Inc."
      subject="Seller Prospect Pitch Packet"
      creator="mallan.nyc"
    >
      <CoverPage data={data} preparedDate={preparedDate} />
      <PricingPage data={data} preparedDate={preparedDate} />
      <ExposurePage data={data} preparedDate={preparedDate} />
      <FinancialPage data={data} preparedDate={preparedDate} />
    </Document>
  );
}

// ── Public API ────────────────────────────────────────────────────────

/**
 * Render a pitch packet PDF to a Node.js Buffer.
 * Serverless-friendly — no Puppeteer or headless browser.
 */
export async function renderPitchPacketPdf(
  data: PitchPacketData,
): Promise<Buffer> {
  const buffer = await renderToBuffer(
    <PitchPacketDocument data={data} />,
  );
  return Buffer.from(buffer);
}
