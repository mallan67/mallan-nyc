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
// The regulated designations come from the ONE constant set, so a NY DOS
// wording correction is a single edit there and never a seed rewrite.
import { PROFESSIONAL_DESIGNATIONS } from "../lib/agents/professional-title";

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
      title: PROFESSIONAL_DESIGNATIONS.broker,
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
      title: PROFESSIONAL_DESIGNATIONS.broker,
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
      // BROKERAGE PROFESSIONAL ROLE - recorded from the known fact, not
      // computed from the licence class beside it.
      role: "SALESPERSON",
      status: "active",
      public_slug: "leda-gorgone",
      title: PROFESSIONAL_DESIGNATIONS.salesperson,
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
      // BROKERAGE PROFESSIONAL ROLE - recorded from the known fact, not
      // computed from the licence class beside it.
      role: "SALESPERSON",
      status: "active",
      public_slug: "leda-gorgone",
      title: PROFESSIONAL_DESIGNATIONS.salesperson,
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
      // BROKERAGE PROFESSIONAL ROLE - recorded from the known fact, not
      // computed from the licence class beside it.
      role: "SALESPERSON",
      status: "active",
      public_slug: "julia-djaafar",
      title: PROFESSIONAL_DESIGNATIONS.salesperson,
      photo: "/images/agents/julia-djaafar.jpg",
      bio: "Julia Djaafar is a seasoned real estate salesperson. Whether you are a resident of New York City or a foreigner looking for a home or investment, she will meet your real estate requirements quickly and work hard for the best resolution. Julia has a keen sense of knowing what every deal needs and she guides her clients through the process effortlessly. A graduate of the Fashion Institute of Technology, Julia was a successful fashion designer with her own brand who sold her collections to Barney\u2019s New York and Japan among others. Her work, featured in fashion magazines, demonstrates her flair for bringing together the elements of design and beauty. Julia\u2019s love for fashion and new trends translates equally into her intrigue with new neighborhoods and the endless possibilities of the real estate market. With a light touch and cheerful demeanor, she is dedicated to finding every client the right home.",
      specialties: ["International Buyers", "Investment Properties", "Design-Forward Homes", "Buyer Representation"],
      languages: ["English", "Japanese", "Indonesian"],
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
      // BROKERAGE PROFESSIONAL ROLE - recorded from the known fact, not
      // computed from the licence class beside it.
      role: "SALESPERSON",
      status: "active",
      public_slug: "julia-djaafar",
      title: PROFESSIONAL_DESIGNATIONS.salesperson,
      photo: "/images/agents/julia-djaafar.jpg",
      bio: "Julia Djaafar is a seasoned real estate salesperson. Whether you are a resident of New York City or a foreigner looking for a home or investment, she will meet your real estate requirements quickly and work hard for the best resolution. Julia has a keen sense of knowing what every deal needs and she guides her clients through the process effortlessly. A graduate of the Fashion Institute of Technology, Julia was a successful fashion designer with her own brand who sold her collections to Barney\u2019s New York and Japan among others. Her work, featured in fashion magazines, demonstrates her flair for bringing together the elements of design and beauty. Julia\u2019s love for fashion and new trends translates equally into her intrigue with new neighborhoods and the endless possibilities of the real estate market. With a light touch and cheerful demeanor, she is dedicated to finding every client the right home.",
      specialties: ["International Buyers", "Investment Properties", "Design-Forward Homes", "Buyer Representation"],
      languages: ["English", "Japanese", "Indonesian"],
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
      // LICENCE CLASS. Claudia holds a NY associate real estate broker licence,
      // so the class is its own canonical value — it is NOT "broker" narrowed by
      // an authorisation grant. This record is corrected EXPLICITLY, by name,
      // from her known licence facts; no rule sweeps legacy rows.
      license_type: "associate_broker",
      // BROKERAGE PROFESSIONAL ROLE. Recorded from her known standing in the
      // firm, NOT computed from the licence class above - they agree because
      // both are facts, not because either implies the other. It is also not a
      // permission: principal-broker authority stays with role BROKER alone.
      role: "ASSOCIATE_BROKER",
      status: "active",
      public_slug: "claudia-milkowski",
      title: PROFESSIONAL_DESIGNATIONS.associate_broker,
      photo: "/images/agents/claudia-milkowski.jpg",
      bio: "With nearly two decades of experience in NYC real estate, Claudia Milkowski is a distinguished professional known for her comprehensive market insight, impeccable credentials, and unwavering commitment to her clients. She has earned the trust and loyalty of numerous clients who rely on her for exceptional real estate service and advice.\n\nClaudia\u2019s approach is distinguished by her keen eye, attentive listening skills, and unwavering attention to detail. Her clients remain loyal and genuinely satisfied because she treats each person with the respect, warmth, and personal care of a friend. She believes in guiding rather than pressuring, ensuring that her clients feel confident and comfortable with every decision.\n\nEfficiency and enjoyment define the buying and selling experience under Claudia\u2019s guidance. Her friendly, open demeanor makes what can often be a stressful process feel seamless and rewarding.\n\nBeyond her real estate expertise, Claudia\u2019s refined sense of taste and understanding of design\u2014cultivated through her studies at Parsons School of Design and her career as a former Chief Designer for leading fashion companies\u2014give her a uniquely creative perspective.\n\nAn accomplished artist with a lifelong passion for art, fashion, and design, she brings a sophisticated eye for aesthetics, branding, presentation, and visual storytelling to her work in real estate. She understands how design, architecture, and aesthetics influence the way people experience a home, allowing her to identify and fulfill each client\u2019s individual needs while helping them discover their dream property.\n\nA highly skilled negotiator, Claudia has adeptly guided clients through complex co-op approval processes and challenging negotiations. Drawing on her extensive real estate experience and creative background, she brings creativity, strategy, and determination to every transaction.\n\nFor buyers, she identifies exceptional opportunities and negotiates effectively. For sellers, she develops sophisticated, targeted marketing strategies designed to maximize exposure, attract qualified buyers, and achieve successful results.\n\nClaudia\u2019s passion for real estate is the driving force behind her thoughtful and effective approach to business. Her ability to discern market trends, analyze opportunities, and understand the emotional and aesthetic dimensions of a property sets her apart.\n\nHer leadership, organizational talents, creative vision, and positive attitude have consistently contributed to her clients\u2019 satisfaction and success.\n\nWhether helping a client find a home that feels uniquely theirs, positioning a property for the market, or bringing a creative eye to a complex transaction, Claudia combines expertise, intuition, design sensibility, and genuine personal care to create an exceptional real estate experience.",
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
      // LICENCE CLASS. Claudia holds a NY associate real estate broker licence,
      // so the class is its own canonical value — it is NOT "broker" narrowed by
      // an authorisation grant. This record is corrected EXPLICITLY, by name,
      // from her known licence facts; no rule sweeps legacy rows.
      license_type: "associate_broker",
      // BROKERAGE PROFESSIONAL ROLE. Recorded from her known standing in the
      // firm, NOT computed from the licence class above - they agree because
      // both are facts, not because either implies the other. It is also not a
      // permission: principal-broker authority stays with role BROKER alone.
      role: "ASSOCIATE_BROKER",
      status: "active",
      public_slug: "claudia-milkowski",
      title: PROFESSIONAL_DESIGNATIONS.associate_broker,
      photo: "/images/agents/claudia-milkowski.jpg",
      bio: "With nearly two decades of experience in NYC real estate, Claudia Milkowski is a distinguished professional known for her comprehensive market insight, impeccable credentials, and unwavering commitment to her clients. She has earned the trust and loyalty of numerous clients who rely on her for exceptional real estate service and advice.\n\nClaudia\u2019s approach is distinguished by her keen eye, attentive listening skills, and unwavering attention to detail. Her clients remain loyal and genuinely satisfied because she treats each person with the respect, warmth, and personal care of a friend. She believes in guiding rather than pressuring, ensuring that her clients feel confident and comfortable with every decision.\n\nEfficiency and enjoyment define the buying and selling experience under Claudia\u2019s guidance. Her friendly, open demeanor makes what can often be a stressful process feel seamless and rewarding.\n\nBeyond her real estate expertise, Claudia\u2019s refined sense of taste and understanding of design\u2014cultivated through her studies at Parsons School of Design and her career as a former Chief Designer for leading fashion companies\u2014give her a uniquely creative perspective.\n\nAn accomplished artist with a lifelong passion for art, fashion, and design, she brings a sophisticated eye for aesthetics, branding, presentation, and visual storytelling to her work in real estate. She understands how design, architecture, and aesthetics influence the way people experience a home, allowing her to identify and fulfill each client\u2019s individual needs while helping them discover their dream property.\n\nA highly skilled negotiator, Claudia has adeptly guided clients through complex co-op approval processes and challenging negotiations. Drawing on her extensive real estate experience and creative background, she brings creativity, strategy, and determination to every transaction.\n\nFor buyers, she identifies exceptional opportunities and negotiates effectively. For sellers, she develops sophisticated, targeted marketing strategies designed to maximize exposure, attract qualified buyers, and achieve successful results.\n\nClaudia\u2019s passion for real estate is the driving force behind her thoughtful and effective approach to business. Her ability to discern market trends, analyze opportunities, and understand the emotional and aesthetic dimensions of a property sets her apart.\n\nHer leadership, organizational talents, creative vision, and positive attitude have consistently contributed to her clients\u2019 satisfaction and success.\n\nWhether helping a client find a home that feels uniquely theirs, positioning a property for the market, or bringing a creative eye to a complex transaction, Claudia combines expertise, intuition, design sensibility, and genuine personal care to create an exceptional real estate experience.",
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
