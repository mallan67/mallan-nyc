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
// ONE authority for the licence class and the regulated designation. The
// roster's `title` string is INPUT EVIDENCE about the licence, normalised
// here; the stored designation always comes back out of the constant set, so
// a NY DOS wording correction never has to be swept through this script.
import { normaliseLicenseType, titleForLicenseClass } from '../lib/agents/professional-title';
// The BROKERAGE PROFESSIONAL ROLE is a recorded fact on the roster, never
// computed from the licence class. They correlate; neither implies the other.
import { isCanonicalBrokerageRole } from '../lib/agents/brokerage-role';

const prisma = new PrismaClient();

async function main() {
  for (const agent of agentsData.agents) {
    const [firstName, ...rest] = agent.name.split(' ');
    const lastName = rest.join(' ');
    const slug = agent.id; // e.g. "maya-allan"

    // The roster title STATES a licence class ("... Associate Real Estate
    // Broker"), which is evidence about the licence. It is normalised through
    // the one authority — never string-sniffed for the substring "broker",
    // which could not tell an associate from a principal and is what forced the
    // old role-based inference. Unrecognised text yields '' and the record
    // keeps whatever it already had rather than being guessed at.
    const licenceClass = normaliseLicenseType(agent.title);
    const canonicalTitle = licenceClass ? titleForLicenseClass(licenceClass) : agent.title;

    // Read, validated, and refused if malformed - not inferred from the licence
    // class sitting next to it.
    const brokerageRole = (agent as { role?: string }).role;
    if (!isCanonicalBrokerageRole(brokerageRole)) {
      throw new Error(
        `data/agents.json: ${agent.id} has no canonical brokerage role `
        + `(got ${JSON.stringify(brokerageRole)}). It is a recorded fact and must be set.`,
      );
    }
    const role = brokerageRole;   // exact canonical value, validated above

    const existing = await prisma.agent.findUnique({ where: { email: agent.email } });

    if (existing) {
      // Update existing agent with public profile fields
      await prisma.agent.update({
        where: { email: agent.email },
        data: {
          public_slug: slug,
          ...(licenceClass ? { license_type: licenceClass } : {}),
          role,
          title: canonicalTitle,
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
      // `license_type` is the NY LICENCE CLASS and carries the associate fact
      // itself. `role` is the BROKERAGE PROFESSIONAL ROLE, read above from the
      // roster. Neither is computed from the other, and neither is a
      // permission: principal-broker authority is a separate decision made
      // about a session, and it belongs to role BROKER alone.
      await prisma.agent.create({
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: agent.name,
          email: agent.email,
          password_hash: '$placeholder-needs-reset$',
          phone: agent.phone,
          license_type: licenceClass || null,
          role,
          public_slug: slug,
          title: canonicalTitle,
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
