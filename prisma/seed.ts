/**
 * prisma/seed.ts — Seeds the database with initial agent data ONLY.
 *
 * Usage: npx tsx prisma/seed.ts
 *   or via package.json prisma.seed config.
 *
 * Creates:
 *   - Maya Allan (broker) + Leda Gorgone + Julia Djaafar (agents)
 *
 * NOTE: Listings come ONLY from Trestle/IDX sync or CRM form submissions.
 *       Deals come ONLY from agent deal form submissions.
 *       No fake/test listings or deals are seeded.
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
      public_slug: "maya-allan",
      title: "Licensed Real Estate Broker",
      photo: "/images/agents/maya-allan.jpg",
      bio: "Maya is a dedicated New York City real estate professional known for strategic execution, strong negotiation, and results-driven performance. With a background in international business development, she brings high-level deal experience, contract negotiation expertise, and financial discipline to every transaction. Her analytical mindset and competitive edge translate directly into successful outcomes for buyers, sellers, and investors in NYC's fast-moving market.\n\nAs a REBNY member, Maya provides full access to all New York City listings. She specializes in co-ops, condops, condos, new developments, townhouses and commercial properties. For buyers and investors, she offers expert negotiation, board package strategy, co-op interview preparation, financial and mortgage analysis, full deal-cycle management, attorney coordination, ROI projections, and in-depth comparable market analysis to ensure smart pricing and strong positioning. She guides clients step-by-step with clarity and precision from offer through closing.\n\nFor sellers, Maya develops aggressive, tailored marketing strategies designed to maximize exposure and drive top-dollar results. Her approach includes strategic pricing, professional photography, high-impact marketing materials, targeted advertising, open houses, dedicated property web presence, broker outreach, and consistent reporting. Sellers receive weekly updates with market feedback and action plans. Leveraging her network and resources, Maya positions each property competitively to achieve the strongest possible outcome.",
      specialties: ["Co-ops & Condos", "New Developments", "Investment Properties", "Commercial & Retail"],
      languages: ["English", "Hebrew", "Georgian"],
      featured: true,
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
      public_slug: "maya-allan",
      title: "Licensed Real Estate Broker",
      photo: "/images/agents/maya-allan.jpg",
      bio: "Maya is a dedicated New York City real estate professional known for strategic execution, strong negotiation, and results-driven performance. With a background in international business development, she brings high-level deal experience, contract negotiation expertise, and financial discipline to every transaction. Her analytical mindset and competitive edge translate directly into successful outcomes for buyers, sellers, and investors in NYC's fast-moving market.\n\nAs a REBNY member, Maya provides full access to all New York City listings. She specializes in co-ops, condops, condos, new developments, townhouses and commercial properties. For buyers and investors, she offers expert negotiation, board package strategy, co-op interview preparation, financial and mortgage analysis, full deal-cycle management, attorney coordination, ROI projections, and in-depth comparable market analysis to ensure smart pricing and strong positioning. She guides clients step-by-step with clarity and precision from offer through closing.\n\nFor sellers, Maya develops aggressive, tailored marketing strategies designed to maximize exposure and drive top-dollar results. Her approach includes strategic pricing, professional photography, high-impact marketing materials, targeted advertising, open houses, dedicated property web presence, broker outreach, and consistent reporting. Sellers receive weekly updates with market feedback and action plans. Leveraging her network and resources, Maya positions each property competitively to achieve the strongest possible outcome.",
      specialties: ["Co-ops & Condos", "New Developments", "Investment Properties", "Commercial & Retail"],
      languages: ["English", "Hebrew", "Georgian"],
      featured: true,
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
      public_slug: "leda-gorgone",
      title: "Licensed Real Estate Salesperson",
      photo: "/images/agents/leda-gorgone.jpg",
      bio: "Blending her creative background with a passion for helping people, Leda brings an inspired and hands-on approach to every real estate journey. Her warmth, professionalism, and tireless dedication make her the perfect partner for anyone seeking their dream home or selling their current one. From preparing marketing strategies and board packages to coordinating showings and handling every detail behind the scenes, Leda ensures a seamless and stress-free experience from start to finish. Originally from S\u00e3o Paulo, Brazil, Leda moved to New York to advance her editorial fashion career. After years as a fashion journalist, stylist, producer, and location scout, she developed an exceptional eye for aesthetics and an instinct for finding the perfect match \u2014 whether it\u2019s a backdrop or a property.",
      specialties: ["Marketing Strategy", "Board Packages", "Styling & Staging", "Buyer Representation"],
      languages: ["English", "Portuguese"],
      featured: false,
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
      public_slug: "leda-gorgone",
      title: "Licensed Real Estate Salesperson",
      photo: "/images/agents/leda-gorgone.jpg",
      bio: "Blending her creative background with a passion for helping people, Leda brings an inspired and hands-on approach to every real estate journey. Her warmth, professionalism, and tireless dedication make her the perfect partner for anyone seeking their dream home or selling their current one. From preparing marketing strategies and board packages to coordinating showings and handling every detail behind the scenes, Leda ensures a seamless and stress-free experience from start to finish. Originally from S\u00e3o Paulo, Brazil, Leda moved to New York to advance her editorial fashion career. After years as a fashion journalist, stylist, producer, and location scout, she developed an exceptional eye for aesthetics and an instinct for finding the perfect match \u2014 whether it\u2019s a backdrop or a property.",
      specialties: ["Marketing Strategy", "Board Packages", "Styling & Staging", "Buyer Representation"],
      languages: ["English", "Portuguese"],
      featured: false,
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
      public_slug: "julia-djaafar",
      title: "Licensed Real Estate Salesperson",
      photo: "/images/agents/julia-djaafar.jpg",
      bio: "Julia Djaafar is a seasoned real estate salesperson. Whether you are a resident of New York City or a foreigner looking for a home or investment, she will meet your real estate requirements quickly and work hard for the best resolution. Julia has a keen sense of knowing what every deal needs and she guides her clients through the process effortlessly. A graduate of the Fashion Institute of Technology, Julia was a successful fashion designer with her own brand who sold her collections to Barney\u2019s New York and Japan among others. Her work, featured in fashion magazines, demonstrates her flair for bringing together the elements of design and beauty. Julia\u2019s love for fashion and new trends translates equally into her intrigue with new neighborhoods and the endless possibilities of the real estate market. With a light touch and cheerful demeanor, she is dedicated to finding every client the right home.",
      specialties: ["International Buyers", "Investment Properties", "Design-Forward Homes", "Buyer Representation"],
      languages: ["English", "Japanese"],
      featured: false,
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
      public_slug: "julia-djaafar",
      title: "Licensed Real Estate Salesperson",
      photo: "/images/agents/julia-djaafar.jpg",
      bio: "Julia Djaafar is a seasoned real estate salesperson. Whether you are a resident of New York City or a foreigner looking for a home or investment, she will meet your real estate requirements quickly and work hard for the best resolution. Julia has a keen sense of knowing what every deal needs and she guides her clients through the process effortlessly. A graduate of the Fashion Institute of Technology, Julia was a successful fashion designer with her own brand who sold her collections to Barney\u2019s New York and Japan among others. Her work, featured in fashion magazines, demonstrates her flair for bringing together the elements of design and beauty. Julia\u2019s love for fashion and new trends translates equally into her intrigue with new neighborhoods and the endless possibilities of the real estate market. With a light touch and cheerful demeanor, she is dedicated to finding every client the right home.",
      specialties: ["International Buyers", "Investment Properties", "Design-Forward Homes", "Buyer Representation"],
      languages: ["English", "Japanese"],
      featured: false,
    },
  });
  console.log("  Agent: Julia Djaafar (AGENT) id=" + julia.id);

  const claudia = await prisma.agent.upsert({
    where: { email: "cmilkowski@mallan.nyc" },
    update: {
      first_name: "Claudia",
      last_name: "Milkowski",
      full_name: "Claudia Milkowski",
      password_hash: agentHash,
      phone: "(646) 418-8388",
      license_no: "10301200574",
      // NY licence designation is Associate Broker (license_type "broker"), but
      // `role` is the CRM AUTHORISATION grant — "BROKER" unlocks the admin
      // surfaces (audit log, all-agent leads, automation, campaigns). Only the
      // principal broker holds that. An associate broker is role "AGENT".
      license_type: "broker",
      role: "AGENT",
      status: "active",
      public_slug: "claudia-milkowski",
      title: "Licensed Real Estate Associate Broker",
      photo: "/images/agents/claudia-milkowski.jpg",
      bio: "With nearly two decades of experience in New York City real estate, Claudia Milkowski is known for her comprehensive market insight, impeccable credentials, and unwavering commitment to her clients. Her approach is defined by a keen eye, attentive listening, and meticulous attention to detail \u2014 she guides rather than pressures, treating every client with the respect, warmth, and personal care of a friend, so that what can be a stressful process feels seamless and rewarding. Shaped by her studies at Parsons School of Design and her career as a former Chief Designer for leading fashion companies, Claudia is an accomplished artist whose lifelong passion for art, fashion, and design brings a sophisticated eye for aesthetics, branding, and presentation to her work. She understands how design and architecture shape the way people experience a home, allowing her to identify each client\u2019s individual needs and help them discover their dream property. A highly skilled negotiator, she has adeptly guided clients through complex co-op approval processes and challenging negotiations, bringing creativity, strategy, and determination to every transaction. For buyers, she identifies exceptional opportunities and negotiates effectively; for sellers, she develops sophisticated, targeted marketing strategies designed to maximize exposure, attract qualified buyers, and achieve successful results.",
      specialties: ["Co-op Board Approvals", "Negotiation", "Seller Marketing Strategy", "Buyer Representation"],
      languages: ["English", "Spanish"],
      featured: false,
    },
    create: {
      first_name: "Claudia",
      last_name: "Milkowski",
      full_name: "Claudia Milkowski",
      email: "cmilkowski@mallan.nyc",
      password_hash: agentHash,
      phone: "(646) 418-8388",
      license_no: "10301200574",
      // NY licence designation is Associate Broker (license_type "broker"), but
      // `role` is the CRM AUTHORISATION grant — "BROKER" unlocks the admin
      // surfaces (audit log, all-agent leads, automation, campaigns). Only the
      // principal broker holds that. An associate broker is role "AGENT".
      license_type: "broker",
      role: "AGENT",
      status: "active",
      public_slug: "claudia-milkowski",
      title: "Licensed Real Estate Associate Broker",
      photo: "/images/agents/claudia-milkowski.jpg",
      bio: "With nearly two decades of experience in New York City real estate, Claudia Milkowski is known for her comprehensive market insight, impeccable credentials, and unwavering commitment to her clients. Her approach is defined by a keen eye, attentive listening, and meticulous attention to detail \u2014 she guides rather than pressures, treating every client with the respect, warmth, and personal care of a friend, so that what can be a stressful process feels seamless and rewarding. Shaped by her studies at Parsons School of Design and her career as a former Chief Designer for leading fashion companies, Claudia is an accomplished artist whose lifelong passion for art, fashion, and design brings a sophisticated eye for aesthetics, branding, and presentation to her work. She understands how design and architecture shape the way people experience a home, allowing her to identify each client\u2019s individual needs and help them discover their dream property. A highly skilled negotiator, she has adeptly guided clients through complex co-op approval processes and challenging negotiations, bringing creativity, strategy, and determination to every transaction. For buyers, she identifies exceptional opportunities and negotiates effectively; for sellers, she develops sophisticated, targeted marketing strategies designed to maximize exposure, attract qualified buyers, and achieve successful results.",
      specialties: ["Co-op Board Approvals", "Negotiation", "Seller Marketing Strategy", "Buyer Representation"],
      languages: ["English", "Spanish"],
      featured: false,
    },
  });
  console.log("  Agent: Claudia Milkowski (AGENT) id=" + claudia.id);

  // ═══════════════════════════════════════════════════════════
  // NO FAKE LISTINGS OR DEALS
  // ═══════════════════════════════════════════════════════════
  // Listings come ONLY from:
  //   1. Trestle/IDX sync (cron every 4h)
  //   2. Agent submissions via SALE-FORM-REDESIGN / RENTAL-FORM-REDESIGN
  //   3. CRM listing POST via dashboard
  //
  // Deals come ONLY from:
  //   1. Agent deal form submissions (BUYER-DEAL-FORM / TENANT-DEAL-FORM)
  //   2. CRM deal creation

  // ═══════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════

  const agentCount = await prisma.agent.count();

  console.log("\nSeed complete!");
  console.log("  Agents: " + agentCount);
  console.log("  (Listings and deals are NOT seeded — they come from Trestle sync and CRM submissions only)");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
