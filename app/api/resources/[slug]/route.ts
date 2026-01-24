import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const RESOURCES_DIR = path.join(process.cwd(), 'data', 'resources');

async function getResource(slug: string) {
  try {
    const filePath = path.join(RESOURCES_DIR, `${slug}.json`);
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveResource(slug: string, content: Record<string, unknown>) {
  await mkdir(RESOURCES_DIR, { recursive: true });
  const filePath = path.join(RESOURCES_DIR, `${slug}.json`);
  await writeFile(filePath, JSON.stringify(content, null, 2));
}

async function getAllResources() {
  try {
    await mkdir(RESOURCES_DIR, { recursive: true });
    const files = await readdir(RESOURCES_DIR);
    const resources = await Promise.all(
      files
        .filter(f => f.endsWith('.json'))
        .map(async f => {
          const data = await readFile(path.join(RESOURCES_DIR, f), 'utf-8');
          return JSON.parse(data);
        })
    );
    return resources;
  } catch {
    return [];
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  // Special case: get all resources for listing
  if (slug === 'all') {
    const resources = await getAllResources();
    return NextResponse.json({ resources });
  }

  const content = await getResource(slug);

  if (!content) {
    return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  }

  return NextResponse.json(content);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await request.json();
    await saveResource(slug, body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save resource' },
      { status: 500 }
    );
  }
}
