import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname === '/api/acris') {
    const url = req.nextUrl.clone();
    url.pathname = '/api/acris2';
    return NextResponse.rewrite(url);
  }
  return NextResponse.next();
}
export const config = { matcher: ['/api/acris'] };
