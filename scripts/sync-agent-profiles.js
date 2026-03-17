#!/usr/bin/env node
/**
 * One-time sync: imports agent profile data from data/agents.json into the DB.
 * Updates bio, photo, specialties, languages, title, public_slug, featured
 * for agents matched by email.
 *
 * Run: node scripts/sync-agent-profiles.js
 * Safe to run multiple times — updates only, never creates.
 */
const { PrismaClient } = require('@prisma/client');
const agents = require('../data/agents.json').agents;

const prisma = new PrismaClient();

async function main() {
  console.log('Syncing', agents.length, 'agent profiles from agents.json → DB...\n');

  for (const a of agents) {
    const slug = a.id || a.name.toLowerCase().replace(/\s+/g, '-');

    // Find by email
    const existing = await prisma.agent.findUnique({ where: { email: a.email } });

    if (!existing) {
      console.log('  SKIP:', a.name, '— email', a.email, 'not found in DB');
      continue;
    }

    const update = {};
    if (a.bio && (!existing.bio || existing.bio.length < a.bio.length)) update.bio = a.bio;
    if (a.photo && !existing.photo) update.photo = a.photo;
    if (a.title && !existing.title) update.title = a.title;
    if (a.specialties && a.specialties.length > 0 && (!existing.specialties || existing.specialties.length === 0)) {
      update.specialties = a.specialties;
    }
    if (a.languages && a.languages.length > 0 && (!existing.languages || existing.languages.length === 0)) {
      update.languages = a.languages;
    }
    if (!existing.public_slug) update.public_slug = slug;
    if (a.featured !== undefined && !existing.featured) update.featured = a.featured;
    if (a.phone && !existing.phone) update.phone = a.phone;

    if (Object.keys(update).length === 0) {
      console.log('  OK:', a.name, '— already up to date');
      continue;
    }

    await prisma.agent.update({
      where: { id: existing.id },
      data: update,
    });

    console.log('  UPDATED:', a.name, '—', Object.keys(update).join(', '));
  }

  console.log('\nDone.');
}

main()
  .catch((e) => { console.error('Error:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
