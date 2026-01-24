import { NextResponse } from 'next/server';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const dynamic = 'force-dynamic';

const PAGES_DIR = path.join(process.cwd(), 'data', 'pages');

async function getPageContent(slug: string) {
  try {
    const filePath = path.join(PAGES_DIR, `${slug}.json`);
    const data = await readFile(filePath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function savePageContent(slug: string, content: Record<string, unknown>) {
  await mkdir(PAGES_DIR, { recursive: true });
  const filePath = path.join(PAGES_DIR, `${slug}.json`);
  await writeFile(filePath, JSON.stringify(content, null, 2));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const content = await getPageContent(slug);

  if (!content) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
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
    await savePageContent(slug, body);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: 'Failed to save page content' },
      { status: 500 }
    );
  }
}
