/// <reference types="jest" />
/**
 * P0 compute repair — static-compatible CSP + cache-header regressions.
 *
 * These pin the change that removed the per-request CSP nonce (which forced every
 * public page dynamic, disabling ISR/CDN caching and keeping Neon awake):
 *  - the root layout must not read headers()/x-nonce,
 *  - proxy.ts must not create or forward x-nonce,
 *  - the public CSP must still be present with the required restrictive directives
 *    and must NOT contain a per-request nonce,
 *  - private routes stay no-store,
 *  - public GET data APIs keep their own CDN cache headers (not blanket no-store),
 *    while writes / other APIs stay no-store.
 */
import fs from 'fs';
import path from 'path';
import { applySecurityHeaders } from '@/lib/middleware/security-headers';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Minimal NextResponse-shaped stub: only .headers (a real Headers) is used. */
function fakeRes() {
  const headers = new Headers();
  return { res: { headers } as unknown as import('next/server').NextResponse, headers };
}

describe('nonce architecture removed from the render path', () => {
  it('app/layout.tsx does not import or call headers()', () => {
    const src = read('app/layout.tsx');
    expect(src).not.toMatch(/from ['"]next\/headers['"]/);
    expect(src).not.toMatch(/headers\(\)/);
    expect(src).not.toMatch(/x-nonce/);
  });

  it('proxy.ts does not create or forward a per-request x-nonce', () => {
    const src = read('proxy.ts');
    expect(src).not.toMatch(/x-nonce/);
    expect(src).not.toMatch(/crypto\.randomUUID\(\)/);
  });
});

describe('public CSP is static, present, and restrictive', () => {
  const { res, headers } = fakeRes();
  applySecurityHeaders(res, '/', 'GET');
  const csp = headers.get('content-security-policy') ?? '';

  it('has no per-request nonce', () => {
    expect(csp).not.toMatch(/nonce-/);
  });
  it('contains the required restrictive directives', () => {
    expect(csp).toMatch(/default-src 'self'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(csp).toMatch(/base-uri 'self'/);
    expect(csp).toMatch(/form-action 'self'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/script-src 'self'/);
  });
  it('keeps HSTS + frame + nosniff hardening', () => {
    expect(headers.get('strict-transport-security')).toMatch(/max-age=/);
    expect(headers.get('x-frame-options')).toBe('DENY');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('cache policy: private no-store, public GET data APIs cacheable', () => {
  it('CRM page is no-store', () => {
    const { res, headers } = fakeRes();
    applySecurityHeaders(res, '/crm/dashboard', 'GET');
    expect(headers.get('cache-control')).toMatch(/no-store/);
  });
  it('admin page is no-store', () => {
    const { res, headers } = fakeRes();
    applySecurityHeaders(res, '/admin/seller-report/1', 'GET');
    expect(headers.get('cache-control')).toMatch(/no-store/);
  });
  it('private API (/api/crm) is no-store', () => {
    const { res, headers } = fakeRes();
    applySecurityHeaders(res, '/api/crm/listings', 'GET');
    expect(headers.get('cache-control')).toMatch(/no-store/);
  });
  it('public GET /api/listings is NOT overwritten with no-store (keeps its own CDN header)', () => {
    const { res, headers } = fakeRes();
    applySecurityHeaders(res, '/api/listings/RLS20100285', 'GET');
    expect(headers.get('cache-control')).toBeNull();
  });
  it('public GET /api/buildings + /api/idx/watermark are not no-store', () => {
    for (const p of ['/api/buildings', '/api/idx/watermark']) {
      const { res, headers } = fakeRes();
      applySecurityHeaders(res, p, 'GET');
      expect(headers.get('cache-control')).toBeNull();
    }
  });
  it('POST /api/listings (write) IS no-store', () => {
    const { res, headers } = fakeRes();
    applySecurityHeaders(res, '/api/listings/RLS20100285', 'POST');
    expect(headers.get('cache-control')).toMatch(/no-store/);
  });
  it('other GET APIs remain no-store', () => {
    const { res, headers } = fakeRes();
    applySecurityHeaders(res, '/api/analytics/event', 'GET');
    expect(headers.get('cache-control')).toMatch(/no-store/);
  });
});
