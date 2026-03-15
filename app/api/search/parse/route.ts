import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export const maxDuration = 10;
export const dynamic = 'force-dynamic';

// Rate limit: simple in-memory (Groq free tier = 30 RPM)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 20) return false; // 20/min per IP (leave headroom for Groq's 30/min)
  entry.count++;
  return true;
}

const SYSTEM_PROMPT = `You are a NYC real estate search parser. Convert natural language queries into structured JSON filters.

Return ONLY valid JSON (no markdown, no explanation) with these fields:
{
  "tab": "buy-residential" | "rent-residential",
  "beds": number | null,
  "baths": number | null,
  "minPrice": number | null,
  "maxPrice": number | null,
  "neighborhood": string | null,
  "borough": string | null,
  "propertySubTypes": string[] | null,
  "amenities": string[] | null,
  "yearBuilt": "pre-war" | "post-war" | null,
  "furnished": boolean | null,
  "openHouse": boolean | null,
  "minSqft": number | null,
  "q": string | null
}

Rules:
- Default tab is "buy-residential" unless user says rent/lease/rental
- Prices: "$2M" = 2000000, "$500K" = 500000, "under $X" = maxPrice, "over $X" = minPrice
- "studio" = beds: 0
- NYC neighborhoods: Upper East Side, UES, Midtown, Chelsea, Tribeca, SoHo, etc.
- NYC boroughs: Manhattan, Brooklyn, Queens, Bronx, Staten Island
- amenities values: doorman, gym, pool, elevator, pet-friendly, laundry-room, washer-dryer, outdoor-space, garage, central-air, dishwasher, roof-deck, storage, bike-storage, park-views, river-views, skyline-views, high-ceilings, fireplace, no-fee, renovated, quiet
- propertySubTypes values: Condo, Co-op, Condop, Townhouse, Loft, Duplex, Triplex, Multi-Family, Single Family, New Development
- "pets" or "dogs" or "cats" = amenity "pet-friendly"
- "no fee" = amenity "no-fee"
- "views" = amenity "skyline-views"
- "sunny" or "bright" or "light" = amenity "natural-light" (not in list, skip)
- If something doesn't match any field, put the text in "q" for free-text search
- Omit null fields entirely`;

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ success: false, error: 'Rate limited' }, { status: 429 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'AI search not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const query = String(body.query || '').trim();
    if (!query || query.length > 200) {
      return NextResponse.json({ success: false, error: 'Invalid query' }, { status: 400 });
    }

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: query },
      ],
      temperature: 0,
      max_tokens: 300,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) {
      return NextResponse.json({ success: false, error: 'Empty response' }, { status: 500 });
    }

    // Parse JSON — strip any markdown fencing if present
    const jsonStr = content.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    return NextResponse.json({ success: true, filters: parsed });
  } catch (error) {
    console.error('[/api/search/parse] AI parse error:', error);
    return NextResponse.json({ success: false, error: 'Parse failed' }, { status: 500 });
  }
}
