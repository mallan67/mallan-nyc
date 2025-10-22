import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

export async function POST(req: NextRequest) {
  const { firstName, lastName, email, licenseNo, expiry, splitPlan } = await req.json()
  if (!firstName || !lastName || !email || !licenseNo || !expiry) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  const split = await prisma.splitPlan.findFirst({ where: { name: splitPlan } })
  if (!split) return NextResponse.json({ error: 'Split plan not found' }, { status: 400 })

  const agent = await prisma.agent.create({
    data: {
      email,
      password: await bcrypt.hash('GoogleSignInDummyPassword', 10),
      firstName,
      lastName,
      licenseNo,
      licenseExpiry: new Date(expiry),
      splitPlanId: split.id,
      role: splitPlan === '80-20' ? 'ADMIN' : 'AGENT',
    },
  })

  await prisma.$executeRaw`
    INSERT INTO neon_auth.users_sync (id, email, name, created_at, updated_at)
    VALUES (gen_random_uuid(), ${email}, ${firstName || ''} || ' ' || ${lastName || ''}, now(), now())
    ON CONFLICT (email) DO NOTHING;
  `

  return NextResponse.json({ id: agent.id })
}
