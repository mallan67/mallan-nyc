/**
 * Seed agents from data/agents.json into the database.
 * Updates existing agents (by email) with public profile fields.
 *
 * Usage: npx tsx scripts/seed-agents.ts
 */
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve('.env.local'), override: true });

import { PrismaClient } from '@prisma/client';
import agentsData from '../data/agents.json';

const prisma = new PrismaClient();

async function main() {
  for (const agent of agentsData.agents) {
    const [firstName, ...rest] = agent.name.split(' ');
    const lastName = rest.join(' ');
    const slug = agent.id; // e.g. "maya-allan"

    const existing = await prisma.agent.findUnique({ where: { email: agent.email } });

    if (existing) {
      // Update existing agent with public profile fields
      await prisma.agent.update({
        where: { email: agent.email },
        data: {
          public_slug: slug,
          title: agent.title,
          bio: agent.bio,
          photo: agent.photo,
          specialties: agent.specialties,
          languages: agent.languages,
          featured: agent.featured,
          phone: agent.phone,
          full_name: agent.name,
        },
      });
      console.log(`Updated: ${agent.name} (${agent.email})`);
    } else {
      // Create new agent with a placeholder password hash
      // (they'll need to set a real password via the CRM)
      // `license_type` is the NY licence designation — an Associate Broker is
      // legitimately "broker". `role` is the CRM AUTHORISATION grant: "BROKER"
      // unlocks the admin surfaces (audit log, every agent's leads, automation,
      // campaigns, /admin login), so it belongs to the PRINCIPAL broker alone.
      // An *associate* broker must not inherit it from her title.
      const titleLc = agent.title.toLowerCase();
      const isLicensedBroker = titleLc.includes('broker');
      const isPrincipalBroker = isLicensedBroker && !titleLc.includes('associate');

      await prisma.agent.create({
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: agent.name,
          email: agent.email,
          password_hash: '$placeholder-needs-reset$',
          phone: agent.phone,
          license_type: isLicensedBroker ? 'broker' : 'salesperson',
          role: isPrincipalBroker ? 'BROKER' : 'AGENT',
          public_slug: slug,
          title: agent.title,
          bio: agent.bio,
          photo: agent.photo,
          specialties: agent.specialties,
          languages: agent.languages,
          featured: agent.featured,
        },
      });
      console.log(`Created: ${agent.name} (${agent.email})`);
    }
  }

  console.log('Done seeding agents.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
