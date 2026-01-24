import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const AGENTS_FILE = path.join(process.cwd(), 'data', 'agents.json');

const DEFAULT_AGENTS = {
  agents: []
};

async function getAgents() {
  try {
    const data = await readFile(AGENTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return DEFAULT_AGENTS;
  }
}

async function saveAgents(data: typeof DEFAULT_AGENTS) {
  const dir = path.dirname(AGENTS_FILE);
  await mkdir(dir, { recursive: true });
  await writeFile(AGENTS_FILE, JSON.stringify(data, null, 2));
}

export async function GET() {
  const data = await getAgents();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await saveAgents(body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save agents' },
      { status: 500 }
    );
  }
}
