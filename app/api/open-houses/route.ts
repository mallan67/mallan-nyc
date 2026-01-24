import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const OPEN_HOUSES_FILE = path.join(process.cwd(), 'data', 'open-houses.json');

const DEFAULT_DATA = {
  openHouses: []
};

async function getOpenHouses() {
  try {
    const data = await readFile(OPEN_HOUSES_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return DEFAULT_DATA;
  }
}

async function saveOpenHouses(data: typeof DEFAULT_DATA) {
  const dir = path.dirname(OPEN_HOUSES_FILE);
  await mkdir(dir, { recursive: true });
  await writeFile(OPEN_HOUSES_FILE, JSON.stringify(data, null, 2));
}

export async function GET() {
  const data = await getOpenHouses();
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    await saveOpenHouses(body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save open houses' },
      { status: 500 }
    );
  }
}
