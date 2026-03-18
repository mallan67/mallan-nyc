/**
 * prisma/seed.ts — Seeds the database with initial data.
 *
 * Usage: npx tsx prisma/seed.ts
 *   or via package.json prisma.seed config.
 *
 * Creates:
 *   - Maya Allan (broker) + Leda Gorgone + Julia Djaafar (agents)
 *   - Maya's exclusive listings
 *   - Maya's closed deals
 */

import path from "node:path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(".env.local"), override: true });

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SALT_ROUNDS = 12;

async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

async function main() {
  console.log("Seeding database...");

  // ═══════════════════════════════════════════════════════════
  // AGENTS
  // ═══════════════════════════════════════════════════════════

  if (!process.env.SEED_BROKER_PASSWORD || !process.env.SEED_AGENT_PASSWORD) {
    throw new Error("SEED_BROKER_PASSWORD and SEED_AGENT_PASSWORD must be set in .env.local before seeding.");
  }
  const mayaHash = await hashPassword(process.env.SEED_BROKER_PASSWORD);

  const maya = await prisma.agent.upsert({
    where: { email: "maya@mallan.nyc" },
    update: {
      first_name: "Maya",
      last_name: "Allan",
      full_name: "Maya Allan",
      password_hash: mayaHash,
      phone: "(646) 258-4460",
      license_no: "10311201806",
      trestle_mls_id: "39361",
      license_type: "broker",
      license_expiry: new Date("2027-12-31"),
      sale_split: 60,
      rental_split: 60,
      role: "BROKER",
      status: "active",
    },
    create: {
      first_name: "Maya",
      last_name: "Allan",
      full_name: "Maya Allan",
      email: "maya@mallan.nyc",
      password_hash: mayaHash,
      phone: "(646) 258-4460",
      license_no: "10311201806",
      trestle_mls_id: "39361",
      license_type: "broker",
      license_expiry: new Date("2027-12-31"),
      sale_split: 60,
      rental_split: 60,
      role: "BROKER",
      status: "active",
    },
  });
  console.log("  Agent: Maya Allan (BROKER) id=" + maya.id);

  const agentHash = await hashPassword(process.env.SEED_AGENT_PASSWORD!);

  const leda = await prisma.agent.upsert({
    where: { email: "leda@mallan.nyc" },
    update: {
      first_name: "Leda",
      last_name: "Gorgone",
      full_name: "Leda Gorgone",
      password_hash: agentHash,
      phone: "(917) 207-5903",
      license_type: "salesperson",
      role: "AGENT",
      status: "active",
    },
    create: {
      first_name: "Leda",
      last_name: "Gorgone",
      full_name: "Leda Gorgone",
      email: "leda@mallan.nyc",
      password_hash: agentHash,
      phone: "(917) 207-5903",
      license_type: "salesperson",
      role: "AGENT",
      status: "active",
    },
  });
  console.log("  Agent: Leda Gorgone (AGENT) id=" + leda.id);

  const julia = await prisma.agent.upsert({
    where: { email: "julia@mallan.nyc" },
    update: {
      first_name: "Julia",
      last_name: "Djaafar",
      full_name: "Julia Djaafar",
      password_hash: agentHash,
      phone: "(646) 258-4460",
      license_type: "salesperson",
      role: "AGENT",
      status: "active",
    },
    create: {
      first_name: "Julia",
      last_name: "Djaafar",
      full_name: "Julia Djaafar",
      email: "julia@mallan.nyc",
      password_hash: agentHash,
      phone: "(646) 258-4460",
      license_type: "salesperson",
      role: "AGENT",
      status: "active",
    },
  });
  console.log("  Agent: Julia Djaafar (AGENT) id=" + julia.id);

  // ═══════════════════════════════════════════════════════════
  // CLIENTS (Leads)
  // ═══════════════════════════════════════════════════════════

  // NOTE: Real clients are created via the CRM portal or /api/inquiries endpoint.
  // No fake test clients with 555 numbers seeded.

  // ═══════════════════════════════════════════════════════════
  // LISTINGS — 26 from mock-data.js
  // ═══════════════════════════════════════════════════════════

  const now = new Date();

  // Helper: Maya's listings (she's the listing agent for these)
  const mayaListings = [
    {
      listing_id: "SL-23810001",
      listing_type: "rent",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Apartment",
      list_price: 3500,
      bedrooms_total: 1,
      bathrooms_full: 1,
      bathrooms_half: 0,
      living_area: 650,
      borough: "Manhattan",
      neighborhood: "Upper East Side",
      address: { street: "301 EAST 79TH STREET", unit: "5A", city: "New York", state: "NY", zip: "10075" },
      description: "Sunny 1BR in UES pre-war elevator building. Hardwood floors, updated kitchen.",
    },
    {
      listing_id: "SL-23810002",
      listing_type: "rent",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 5200,
      bedrooms_total: 2,
      bathrooms_full: 1,
      bathrooms_half: 0,
      living_area: 900,
      borough: "Manhattan",
      neighborhood: "Chelsea",
      address: { street: "555 WEST 23RD STREET", unit: "12D", city: "New York", state: "NY", zip: "10011" },
      description: "Luxury 2BR condo rental in Chelsea. Doorman, gym, rooftop deck. W/D in unit.",
    },
    {
      listing_id: "SL-23820001",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Cooperative",
      list_price: 1850000,
      bedrooms_total: 3,
      bathrooms_full: 2,
      bathrooms_half: 0,
      living_area: 1450,
      borough: "Manhattan",
      neighborhood: "Upper West Side",
      address: { street: "200 WEST 86TH STREET", unit: "12A", city: "New York", state: "NY", zip: "10024" },
      description: "Stunning pre-war 3BR co-op on the Upper West Side. Grand proportions, doorman building.",
    },
    {
      listing_id: "SL-23820003",
      listing_type: "sale",
      status: "Closed",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 1200000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      bathrooms_half: 0,
      living_area: 820,
      borough: "Manhattan",
      neighborhood: "Financial District",
      address: { street: "88 GREENWICH STREET", unit: "22H", city: "New York", state: "NY", zip: "10006" },
      description: "FiDi 1BR condo with Hudson River views. Luxury amenities.",
    },
    {
      listing_id: "SL-23830003",
      listing_type: "sale",
      status: "ComingSoon",
      property_type: "Residential",
      property_sub_type: "Cooperative",
      list_price: 875000,
      bedrooms_total: 2,
      bathrooms_full: 1,
      bathrooms_half: 0,
      living_area: 950,
      borough: "Manhattan",
      neighborhood: "Sutton Place",
      address: { street: "425 EAST 58TH STREET", unit: "8D", city: "New York", state: "NY", zip: "10022" },
      description: "COMING SOON — Beautiful pre-war 2BR co-op in Sutton Place.",
    },
    {
      listing_id: "SL-23830006",
      listing_type: "sale",
      status: "Closed",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 780000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      bathrooms_half: 0,
      living_area: 700,
      borough: "Manhattan",
      neighborhood: "Upper East Side",
      address: { street: "401 EAST 60TH STREET", unit: "11C", city: "New York", state: "NY", zip: "10065" },
      description: "Recently closed listing.",
    },
  ];

  // NOTE: Other brokerage listings come from the Trestle/IDX sync pipeline.
  // No mock RLS listings seeded — production uses real data.

  // Insert Maya's listings (with agent_id)
  for (const l of mayaListings) {
    await prisma.listing.upsert({
      where: { listing_id: l.listing_id },
      update: {},
      create: {
        listing_id: l.listing_id,
        agent_id: maya.id,
        status: l.status,
        listing_type: l.listing_type,
        property_type: l.property_type,
        property_sub_type: l.property_sub_type,
        list_price: l.list_price,
        bedrooms_total: l.bedrooms_total,
        bathrooms_full: l.bathrooms_full,
        bathrooms_half: l.bathrooms_half ?? 0,
        living_area: l.living_area,
        borough: l.borough,
        neighborhood: l.neighborhood,
        address: l.address as object,
        features: {},
        media: [],
        compliance: {},
        agent_info: { company: "Mallan Real Estate Inc.", agentName: "Maya Allan" },
        modification_timestamp: now,
      },
    });
  }
  console.log("  Listings: " + mayaListings.length + " Maya listings inserted");

  // ═══════════════════════════════════════════════════════════
  // DEALS (Maya's real closed deals)
  // ═══════════════════════════════════════════════════════════

  await prisma.deal.upsert({
    where: { id: BigInt(1) },
    update: {},
    create: {
      agent_id: maya.id,
      representation_code: "buyer",
      property_address: "88 Greenwich Street, 22H, New York, NY 10006",
      price_usd: 1200000,
      commission_rate_percent: 3,
      split_percent: 60,
      gross_commission_usd: 36000,
      agent_fee_usd: 21600,
      company_fee_usd: 14400,
      status: "closed",
      contract_signed: new Date("2025-06-01"),
      contract_closed: new Date("2025-09-01"),
    },
  });

  await prisma.deal.upsert({
    where: { id: BigInt(2) },
    update: {},
    create: {
      agent_id: maya.id,
      representation_code: "tenant",
      property_address: "301 East 79th Street, 5A, New York, NY 10075",
      price_usd: 3500,
      commission_rate_percent: 15,
      split_percent: 60,
      gross_commission_usd: 6300,
      agent_fee_usd: 3780,
      company_fee_usd: 2520,
      status: "closed",
      contract_signed: new Date("2025-05-10"),
      contract_closed: new Date("2025-05-25"),
    },
  });

  console.log("  Deals: 2 inserted");

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════

  const counts = await Promise.all([
    prisma.agent.count(),
    prisma.lead.count(),
    prisma.listing.count(),
    prisma.deal.count(),
  ]);

  console.log("\nSeed complete!");
  console.log("  Agents:       " + counts[0]);
  console.log("  Clients:      " + counts[1]);
  console.log("  Listings:     " + counts[2]);
  console.log("  Deals:        " + counts[3]);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
