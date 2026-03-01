/**
 * prisma/seed.ts — Seeds the database with initial data.
 *
 * Usage: npx tsx prisma/seed.ts
 *   or via package.json prisma.seed config.
 *
 * Creates:
 *   - Maya Allan (broker) + 2 test agents
 *   - 26 mock listings matching search-modular/js/core/mock-data.js
 *   - Sample clients
 *   - Sample deals
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

  const mayaHash = await hashPassword("MallanBroker2026!");

  const maya = await prisma.agent.upsert({
    where: { email: "maya@mallan.nyc" },
    update: {
      first_name: "Maya",
      last_name: "Allan",
      full_name: "Maya Allan",
      password_hash: mayaHash,
      phone: "(646) 258-4460",
      license_no: "10311201806",
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
      license_type: "broker",
      license_expiry: new Date("2027-12-31"),
      sale_split: 60,
      rental_split: 60,
      role: "BROKER",
      status: "active",
    },
  });
  console.log("  Agent: Maya Allan (BROKER) id=" + maya.id);

  const agentAHash = await hashPassword("TestAgent2026!");

  const agentA = await prisma.agent.upsert({
    where: { email: "alex@mallan.nyc" },
    update: {
      first_name: "Alex",
      last_name: "Rivera",
      full_name: "Alex Rivera",
      password_hash: agentAHash,
      phone: "(646) 555-0101",
      license_no: "10401201001",
      license_type: "salesperson",
      license_expiry: new Date("2027-06-30"),
      sale_split: 50,
      rental_split: 50,
      role: "AGENT",
      status: "active",
    },
    create: {
      first_name: "Alex",
      last_name: "Rivera",
      full_name: "Alex Rivera",
      email: "alex@mallan.nyc",
      password_hash: agentAHash,
      phone: "(646) 555-0101",
      license_no: "10401201001",
      license_type: "salesperson",
      license_expiry: new Date("2027-06-30"),
      sale_split: 50,
      rental_split: 50,
      role: "AGENT",
      status: "active",
    },
  });
  console.log("  Agent: Alex Rivera (AGENT) id=" + agentA.id);

  const agentBHash = await hashPassword("TestAgent2026!");

  const agentB = await prisma.agent.upsert({
    where: { email: "jamie@mallan.nyc" },
    update: {
      first_name: "Jamie",
      last_name: "Chen",
      full_name: "Jamie Chen",
      password_hash: agentBHash,
      phone: "(646) 555-0202",
      license_no: "10401201002",
      license_type: "salesperson",
      license_expiry: new Date("2027-06-30"),
      sale_split: 55,
      rental_split: 50,
      role: "AGENT",
      status: "active",
    },
    create: {
      first_name: "Jamie",
      last_name: "Chen",
      full_name: "Jamie Chen",
      email: "jamie@mallan.nyc",
      password_hash: agentBHash,
      phone: "(646) 555-0202",
      license_no: "10401201002",
      license_type: "salesperson",
      license_expiry: new Date("2027-06-30"),
      sale_split: 55,
      rental_split: 50,
      role: "AGENT",
      status: "active",
    },
  });
  console.log("  Agent: Jamie Chen (AGENT) id=" + agentB.id);

  // ═══════════════════════════════════════════════════════════
  // CLIENTS (Leads)
  // ═══════════════════════════════════════════════════════════

  const clientA = await prisma.lead.upsert({
    where: { email: "john.doe@example.com" },
    update: {},
    create: {
      first_name: "John",
      last_name: "Doe",
      email: "john.doe@example.com",
      phone: "(212) 555-0301",
      roles: ["buyer"],
      status: "active",
      portal_role: "buyer",
      agent_id: maya.id,
      source: "referral",
    },
  });
  console.log("  Client: John Doe (buyer) id=" + clientA.id);

  const clientB = await prisma.lead.upsert({
    where: { email: "sarah.smith@example.com" },
    update: {},
    create: {
      first_name: "Sarah",
      last_name: "Smith",
      email: "sarah.smith@example.com",
      phone: "(917) 555-0401",
      roles: ["renter"],
      status: "active",
      portal_role: "tenant",
      agent_id: agentA.id,
      source: "website",
    },
  });
  console.log("  Client: Sarah Smith (tenant) id=" + clientB.id);

  const clientC = await prisma.lead.upsert({
    where: { email: "michael.jones@example.com" },
    update: {},
    create: {
      first_name: "Michael",
      last_name: "Jones",
      email: "michael.jones@example.com",
      phone: "(718) 555-0501",
      roles: ["seller"],
      status: "active",
      portal_role: "seller",
      agent_id: maya.id,
      source: "manual",
    },
  });
  console.log("  Client: Michael Jones (seller) id=" + clientC.id);

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

  // Non-Maya listings (from other brokerages — imported via RLS)
  const otherListings = [
    {
      listing_id: "SL-23709741",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 500000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      living_area: 675,
      borough: "Manhattan",
      neighborhood: "Fort George",
      address: { street: "140 HILLSIDE AVENUE", unit: "2C", city: "New York", state: "NY", zip: "10040" },
      agent_info: { company: "Bohemia Realty Group", agentName: "Sales Team" },
    },
    {
      listing_id: "SL-23603339",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 500000,
      bedrooms_total: 2,
      bathrooms_full: 1,
      living_area: 900,
      borough: "Manhattan",
      neighborhood: "Inwood",
      address: { street: "581 ACADEMY STREET", unit: "2F", city: "New York", state: "NY", zip: "10034" },
      agent_info: { company: "Maz Group NY", agentName: "Tarek Bendida" },
    },
    {
      listing_id: "SL-23692908",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 509900,
      bedrooms_total: 1,
      bathrooms_full: 1,
      living_area: 650,
      borough: "Manhattan",
      neighborhood: "Morningside Heights",
      address: { street: "516 WEST 112TH STREET", unit: "4B", city: "New York", state: "NY", zip: "10025" },
      agent_info: { company: "Manhattan Network Inc", agentName: "Victor Laino" },
    },
    {
      listing_id: "SL-23663883",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 519000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      living_area: 472,
      borough: "Manhattan",
      neighborhood: "Lenox Hill",
      address: { street: "350 EAST 62ND STREET", unit: "1M", city: "New York", state: "NY", zip: "10065" },
      agent_info: { company: "REDF - Redfin REBNY", agentName: "Jason Warner" },
    },
    {
      listing_id: "SL-MOCK-005",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 525000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      living_area: 636,
      borough: "Manhattan",
      neighborhood: "Hamilton Heights",
      address: { street: "504 WEST 136TH STREET", unit: "6A", city: "New York", state: "NY", zip: "10031" },
      agent_info: { company: "Unknown", agentName: "Unknown" },
    },
    {
      listing_id: "SL-MOCK-006",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 525000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      borough: "Manhattan",
      neighborhood: "Sugar Hill",
      address: { street: "753 ST NICHOLAS AVENUE", unit: "5B", city: "New York", state: "NY", zip: "10031" },
      agent_info: { company: "Unknown", agentName: "Unknown" },
    },
    {
      listing_id: "SL-MOCK-007",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 525000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      living_area: 654,
      borough: "Manhattan",
      neighborhood: "Harlem",
      address: { street: "250 MANHATTAN AVENUE", unit: "1A", city: "New York", state: "NY", zip: "10026" },
      agent_info: { company: "Unknown", agentName: "Unknown" },
    },
    {
      listing_id: "SL-MOCK-008",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 530000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      borough: "Manhattan",
      neighborhood: "Upper East Side",
      address: { street: "1420 YORK AVENUE", unit: "7B", city: "New York", state: "NY", zip: "10021" },
      agent_info: { company: "Unknown", agentName: "Unknown" },
    },
    {
      listing_id: "SL-MOCK-009",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 535000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      bathrooms_half: 1,
      living_area: 728,
      borough: "Manhattan",
      neighborhood: "Washington Heights",
      address: { street: "456 WEST 167TH STREET", unit: "4D", city: "New York", state: "NY", zip: "10032" },
      agent_info: { company: "Unknown", agentName: "Unknown" },
    },
    {
      listing_id: "SL-MOCK-010",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 535000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      living_area: 686,
      borough: "Manhattan",
      neighborhood: "Fort George",
      address: { street: "140 HILLSIDE AVENUE", unit: "2A", city: "New York", state: "NY", zip: "10040" },
      agent_info: { company: "Unknown", agentName: "Unknown" },
    },
    // Rental - other brokerages
    {
      listing_id: "SL-23810003",
      listing_type: "rent",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Apartment",
      list_price: 2800,
      bedrooms_total: 0,
      bathrooms_full: 1,
      living_area: 480,
      borough: "Manhattan",
      neighborhood: "Upper East Side",
      address: { street: "170 EAST 87TH STREET", unit: "3C", city: "New York", state: "NY", zip: "10128" },
      agent_info: { company: "Related Sales", agentName: "Sarah Kim" },
    },
    {
      listing_id: "SL-23810004",
      listing_type: "rent",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Apartment",
      list_price: 4100,
      bedrooms_total: 1,
      bathrooms_full: 1,
      living_area: 720,
      borough: "Manhattan",
      neighborhood: "Hell's Kitchen",
      address: { street: "420 WEST 42ND STREET", unit: "28F", city: "New York", state: "NY", zip: "10036" },
      agent_info: { company: "Douglas Elliman", agentName: "Michael Torres" },
    },
    {
      listing_id: "SL-23810005",
      listing_type: "rent",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 8500,
      bedrooms_total: 2,
      bathrooms_full: 2,
      living_area: 1250,
      borough: "Manhattan",
      neighborhood: "Tribeca",
      address: { street: "100 BARCLAY STREET", unit: "15G", city: "New York", state: "NY", zip: "10007" },
      agent_info: { company: "Brown Harris Stevens", agentName: "Amanda Chen" },
    },
    {
      listing_id: "SL-23810006",
      listing_type: "rent",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Apartment",
      list_price: 2200,
      bedrooms_total: 1,
      bathrooms_full: 1,
      living_area: 600,
      borough: "Manhattan",
      neighborhood: "Washington Heights",
      address: { street: "3345 BROADWAY", unit: "4E", city: "New York", state: "NY", zip: "10031" },
      agent_info: { company: "Maz Group NY", agentName: "Tarek Bendida" },
    },
    // Distribution gate test listings (no agent — RLS imports)
    {
      listing_id: "SL-23830001",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 4500000,
      bedrooms_total: 3,
      bathrooms_full: 3,
      borough: "Manhattan",
      neighborhood: "Upper East Side",
      address: { street: "999 PARK AVENUE", unit: "30A", city: "New York", state: "NY", zip: "10028" },
      owner_opt_out: true,
      agent_info: { company: "Sotheby's", agentName: "Test Agent" },
    },
    {
      listing_id: "SL-23830002",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 3200000,
      bedrooms_total: 2,
      bathrooms_full: 2,
      borough: "Manhattan",
      neighborhood: "Midtown",
      address: { street: "100 CENTRAL PARK SOUTH", unit: "15B", city: "New York", state: "NY", zip: "10019" },
      participant_only: true,
      idx_display_yn: false,
      agent_info: { company: "Douglas Elliman", agentName: "Test Agent 2" },
    },
    {
      listing_id: "SL-23830004",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 1650000,
      bedrooms_total: 2,
      bathrooms_full: 2,
      living_area: 1100,
      borough: "Manhattan",
      neighborhood: "Upper West Side",
      address: { street: "220 RIVERSIDE BOULEVARD", unit: "19F", city: "New York", state: "NY", zip: "10069" },
      idx_display_yn: false,
      agent_info: { company: "Compass", agentName: "IDX Test Agent" },
    },
    {
      listing_id: "SL-23830005",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condominium",
      list_price: 5900000,
      bedrooms_total: 4,
      bathrooms_full: 3,
      living_area: 2800,
      borough: "Manhattan",
      neighborhood: "Upper West Side",
      address: { street: "15 CENTRAL PARK WEST", unit: "22A", city: "New York", state: "NY", zip: "10023" },
      internet_address_display_yn: false,
      agent_info: { company: "Brown Harris Stevens", agentName: "Address Test Agent" },
    },
    // Studio + Condop (other agents)
    {
      listing_id: "SL-23820002",
      listing_type: "sale",
      status: "Pending",
      property_type: "Residential",
      property_sub_type: "Cooperative",
      list_price: 395000,
      bedrooms_total: 0,
      bathrooms_full: 1,
      living_area: 486,
      borough: "Manhattan",
      neighborhood: "Upper East Side",
      address: { street: "330 EAST 75TH STREET", unit: "3F", city: "New York", state: "NY", zip: "10021" },
      agent_info: { company: "Corcoran Group", agentName: "Lisa Park" },
    },
    {
      listing_id: "SL-23820004",
      listing_type: "sale",
      status: "Active",
      property_type: "Residential",
      property_sub_type: "Condop",
      list_price: 575000,
      bedrooms_total: 1,
      bathrooms_full: 1,
      living_area: 710,
      borough: "Manhattan",
      neighborhood: "Upper East Side",
      address: { street: "1760 SECOND AVENUE", unit: "9C", city: "New York", state: "NY", zip: "10128" },
      agent_info: { company: "Compass", agentName: "David Kim" },
    },
  ];

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

  // Insert other listings (no agent_id — RLS imports)
  for (const l of otherListings) {
    await prisma.listing.upsert({
      where: { listing_id: l.listing_id },
      update: {},
      create: {
        listing_id: l.listing_id,
        agent_id: null,
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
        agent_info: l.agent_info as object,
        idx_display_yn: l.idx_display_yn ?? true,
        internet_address_display_yn: l.internet_address_display_yn ?? true,
        participant_only: l.participant_only ?? false,
        owner_opt_out: l.owner_opt_out ?? false,
        modification_timestamp: now,
      },
    });
  }
  console.log("  Listings: " + otherListings.length + " RLS import listings inserted");

  // ═══════════════════════════════════════════════════════════
  // DEALS
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

  await prisma.deal.upsert({
    where: { id: BigInt(3) },
    update: {},
    create: {
      agent_id: agentA.id,
      representation_code: "buyer",
      property_address: "350 East 62nd Street, 1M, New York, NY 10065",
      price_usd: 519000,
      commission_rate_percent: 2.5,
      split_percent: 50,
      status: "submitted",
      contract_signed: new Date("2026-02-15"),
    },
  });

  console.log("  Deals: 3 inserted");

  // ═══════════════════════════════════════════════════════════
  // SPRINT 6: Additional clients matching CRM CLIENT_DATA
  // ═══════════════════════════════════════════════════════════

  const clientJohn = await prisma.lead.upsert({
    where: { email: "john.miller@email.com" },
    update: {},
    create: {
      first_name: "John",
      last_name: "Miller",
      email: "john.miller@email.com",
      phone: "(212) 555-1234",
      roles: ["buyer"],
      status: "active",
      portal_role: "buyer",
      agent_id: maya.id,
      source: "referral",
    },
  });

  const clientDavid = await prisma.lead.upsert({
    where: { email: "david.chen@email.com" },
    update: {},
    create: {
      first_name: "David",
      last_name: "Chen",
      email: "david.chen@email.com",
      phone: "(917) 555-8899",
      roles: ["buyer"],
      status: "active",
      portal_role: "buyer",
      agent_id: maya.id,
      source: "referral",
    },
  });

  await prisma.lead.upsert({
    where: { email: "lisa.park@email.com" },
    update: {},
    create: {
      first_name: "Lisa",
      last_name: "Park",
      email: "lisa.park@email.com",
      phone: "(646) 555-3344",
      roles: ["buyer"],
      status: "new",
      portal_role: "buyer",
      agent_id: maya.id,
      source: "website",
    },
  });

  await prisma.lead.upsert({
    where: { email: "tom.wilson@email.com" },
    update: {},
    create: {
      first_name: "Tom",
      last_name: "Wilson",
      email: "tom.wilson@email.com",
      phone: "(212) 555-7788",
      roles: ["renter"],
      status: "new",
      portal_role: "tenant",
      agent_id: agentA.id,
      source: "website",
    },
  });

  await prisma.lead.upsert({
    where: { email: "emma.r@email.com" },
    update: {},
    create: {
      first_name: "Emma",
      last_name: "Rodriguez",
      email: "emma.r@email.com",
      phone: "(917) 555-1122",
      roles: ["buyer"],
      status: "active",
      portal_role: "buyer",
      agent_id: maya.id,
      source: "referral",
    },
  });

  console.log("  Sprint 6 clients: 5 inserted (matching CRM CLIENT_DATA)");

  // ═══════════════════════════════════════════════════════════
  // CLIENT PREFERENCES (2 leads)
  // ═══════════════════════════════════════════════════════════

  // Get listing IDs for actions
  const listing1 = await prisma.listing.findUnique({ where: { listing_id: "SL-23820001" } });
  const listing2 = await prisma.listing.findUnique({ where: { listing_id: "SL-23810001" } });

  await prisma.clientPreference.upsert({
    where: { lead_id: clientJohn.id },
    update: {},
    create: {
      lead_id: clientJohn.id,
      property_types: ["Cooperative", "Condominium"],
      neighborhoods: ["Upper West Side", "Upper East Side"],
      boroughs: ["Manhattan"],
      min_beds: 2,
      max_beds: 4,
      min_baths: 2,
      min_price: 1500000,
      max_price: 2200000,
      must_haves: ["Doorman", "Elevator", "Laundry"],
      deal_breakers: ["Walk-up"],
      notes: "Prefer pre-war buildings with southern exposure.",
    },
  });

  await prisma.clientPreference.upsert({
    where: { lead_id: clientDavid.id },
    update: {},
    create: {
      lead_id: clientDavid.id,
      property_types: ["Condominium"],
      neighborhoods: ["Tribeca", "SoHo", "Financial District"],
      boroughs: ["Manhattan"],
      min_beds: 2,
      min_price: 3000000,
      max_price: 5000000,
      must_haves: ["Gym", "Concierge", "Parking"],
      deal_breakers: [],
      notes: "Looking for new construction or recently renovated.",
    },
  });

  console.log("  Client preferences: 2 inserted");

  // ═══════════════════════════════════════════════════════════
  // CLIENT LISTING ACTIONS (3)
  // ═══════════════════════════════════════════════════════════

  if (listing1) {
    await prisma.clientListingAction.upsert({
      where: {
        lead_id_listing_id_action: {
          lead_id: clientJohn.id,
          listing_id: listing1.id,
          action: "liked",
        },
      },
      update: {},
      create: {
        lead_id: clientJohn.id,
        listing_id: listing1.id,
        action: "liked",
      },
    });

    await prisma.clientListingAction.upsert({
      where: {
        lead_id_listing_id_action: {
          lead_id: clientJohn.id,
          listing_id: listing1.id,
          action: "discuss",
        },
      },
      update: {},
      create: {
        lead_id: clientJohn.id,
        listing_id: listing1.id,
        action: "discuss",
        comment: "Love the layout, but need to check maintenance fees.",
      },
    });
  }

  if (listing2) {
    await prisma.clientListingAction.upsert({
      where: {
        lead_id_listing_id_action: {
          lead_id: clientDavid.id,
          listing_id: listing2.id,
          action: "schedule",
        },
      },
      update: {},
      create: {
        lead_id: clientDavid.id,
        listing_id: listing2.id,
        action: "schedule",
        comment: "Available weekday mornings.",
      },
    });
  }

  console.log("  Client listing actions: 3 inserted");

  // ═══════════════════════════════════════════════════════════
  // SHOWINGS (2)
  // ═══════════════════════════════════════════════════════════

  if (listing1) {
    await prisma.showing.create({
      data: {
        lead_id: clientJohn.id,
        listing_id: listing1.id,
        agent_id: maya.id,
        date: new Date("2026-03-15T10:00:00Z"),
        time: "10:00 AM",
        type: "private",
        status: "requested",
        notes: "Client prefers morning viewings.",
      },
    });
  }

  if (listing2) {
    await prisma.showing.create({
      data: {
        lead_id: clientDavid.id,
        listing_id: listing2.id,
        agent_id: maya.id,
        date: new Date("2026-03-12T14:00:00Z"),
        time: "2:00 PM",
        type: "private",
        status: "confirmed",
      },
    });
  }

  console.log("  Showings: 2 inserted");

  // ═══════════════════════════════════════════════════════════
  // SAVED SEARCHES (1)
  // ═══════════════════════════════════════════════════════════

  await prisma.savedSearch.create({
    data: {
      lead_id: clientJohn.id,
      agent_id: maya.id,
      name: "UWS 2-3BR Co-ops $1.5-2.2M",
      criteria: {
        type: "sale",
        property_types: ["Cooperative"],
        neighborhoods: ["Upper West Side"],
        min_beds: 2,
        max_beds: 3,
        min_price: 1500000,
        max_price: 2200000,
      },
      result_count: 12,
      last_run: now,
    },
  });

  console.log("  Saved searches: 1 inserted");

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════

  const counts = await Promise.all([
    prisma.agent.count(),
    prisma.lead.count(),
    prisma.listing.count(),
    prisma.deal.count(),
    prisma.clientPreference.count(),
    prisma.clientListingAction.count(),
    prisma.showing.count(),
    prisma.savedSearch.count(),
  ]);

  console.log("\nSeed complete!");
  console.log("  Agents:       " + counts[0]);
  console.log("  Clients:      " + counts[1]);
  console.log("  Listings:     " + counts[2]);
  console.log("  Deals:        " + counts[3]);
  console.log("  Preferences:  " + counts[4]);
  console.log("  Actions:      " + counts[5]);
  console.log("  Showings:     " + counts[6]);
  console.log("  Saved Srch:   " + counts[7]);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
