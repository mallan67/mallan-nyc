/// <reference types="jest" />
/**
 * GET /api/media/proxy (app/api/media/proxy/route.ts): what it caches for 7 days, and what it refuses.
 *
 * This route had no test of its own. PROVEN IN PRODUCTION (Vercel runtime logs, read 2026-10-10 and 2026-10-11): `Non-image response: application/octet-stream` for the later photos
 * (/PHOTO-Jpeg/<key>/25, /30, /31) of one listing, each answered 502. The route refused every 200 whose Content-Type was not image/*. That rule exists to keep an HTML error page (a WAF,
 * rate-limit or maintenance page answered 200) out of a 7-day cache, but a header is a claim and the bytes are the evidence: an untyped answer (application/octet-stream, or no type
 * at all) is now served when its bytes are a JPEG, PNG, WebP or GIF, with the real type, and refused otherwise. An explicit non-image type (text/html, application/json) stays
 * refused whatever the bytes say, and an answer typed image/* behaves exactly as before.
 */
import { NextRequest } from 'next/server';

jest.mock('@/lib/idx/auth', () => ({ __esModule: true, getAccessToken: async () => 'test-token' }));

import { GET } from '@/app/api/media/proxy/route';

const MEDIA = 'https://api.cotality.com/trestle/Media/Property/PHOTO-Jpeg/1103557105/25/abc';
const IMAGE_CACHE = 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=2592000, immutable';

const text = (value: string) => new TextEncoder().encode(value);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00]);
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const GIF = text('GIF89a\u0001\u0000\u0001\u0000');
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, ...Array.from(text('WEBPVP8 '))]);
const HTML = text('<!DOCTYPE html><html><body>Access denied</body></html>');
const JSON_BODY = text('{"error":"rate limited"}');

const realFetch = global.fetch;
let fetchMock: jest.Mock;
let warn: jest.SpyInstance;
let info: jest.SpyInstance;
let error: jest.SpyInstance;

/** the route called the way the browser's <img> does */
const call = (url: string | null = MEDIA) =>
  GET(new NextRequest(`http://localhost/api/media/proxy${url === null ? '' : `?url=${encodeURIComponent(url)}`}`));

/** an ArrayBuffer copy of the bytes: newer TypeScript DOM typings do not accept a Uint8Array as a Response body */
const toBuffer = (data: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
};

/** what Cotality answers: the body, the status and the headers (a binary body carries no Content-Type of its own) */
const answer = (body: Uint8Array | null, headers: Record<string, string> = {}, status = 200) =>
  fetchMock.mockResolvedValueOnce(new Response(body ? toBuffer(body) : null, { status, headers }));

const bytesOf = async (res: Response) => Array.from(new Uint8Array(await res.arrayBuffer()));
const warned = () => warn.mock.calls.map((c) => String(c[0])).join('\n');

beforeEach(() => {
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
  error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('what is asked of the route', () => {
  it('a missing url is a 400 and nothing is fetched', async () => {
    const res = await call(null);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['https://evil.example.com/photo.jpg', 'https://api.cotality.com.evil.example.com/x', 'not a url'])('a host that is not allowed is a 403: %s', async (url) => {
    const res = await call(url);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('asks Cotality with the Bearer token and Accept: image/*, and with a timeout signal', async () => {
    answer(JPEG, { 'content-type': 'image/jpeg' });
    await call();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(MEDIA);
    expect(init.headers).toEqual({ Authorization: 'Bearer test-token', Accept: 'image/*' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('an answer typed image/*: unchanged', () => {
  it('is streamed through with its own Content-Type and the 7-day cache headers', async () => {
    answer(JPEG, { 'content-type': 'image/jpeg' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toBe(IMAGE_CACHE);
    expect(res.headers.get('cdn-cache-control')).toBe('public, max-age=604800, immutable');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await bytesOf(res)).toEqual(Array.from(JPEG));
  });

  it('a mixed-case type with parameters is served with the header exactly as Cotality sent it (the one change here: the old check was case-sensitive and refused "Image/PNG")', async () => {
    answer(PNG, { 'content-type': 'Image/PNG; charset=binary' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('Image/PNG; charset=binary');
  });

  it('is not read into memory by the route (the body is passed on as a stream)', async () => {
    answer(JPEG, { 'content-type': 'image/jpeg' });
    const res = await call();
    expect(res.body).not.toBeNull();
    expect(info).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('an untyped answer (application/octet-stream, or no type): the bytes decide', () => {
  it.each([
    ['a JPEG', JPEG, 'image/jpeg'],
    ['a PNG', PNG, 'image/png'],
    ['a GIF', GIF, 'image/gif'],
    ['a WebP', WEBP, 'image/webp'],
  ] as const)('%s typed application/octet-stream is served with its real type and the 7-day cache headers', async (_name, body, expected) => {
    answer(body, { 'content-type': 'application/octet-stream' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(expected);
    expect(res.headers.get('cache-control')).toBe(IMAGE_CACHE);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await bytesOf(res)).toEqual(Array.from(body));
    expect(info.mock.calls.map((c) => String(c[0])).join('\n')).toContain(`is a ${expected}`);
  });

  it.each(['binary/octet-stream', 'Application/Octet-Stream', 'application/octet-stream; charset=binary'])('%s is untyped too', async (type) => {
    answer(JPEG, { 'content-type': type });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
  });

  it('an answer with no Content-Type at all is checked by its bytes, not trusted as a JPEG (it used to be)', async () => {
    answer(JPEG);
    const ok = await call();
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/jpeg');

    answer(HTML);
    const refused = await call();
    expect(refused.status).toBe(502);
    expect(refused.headers.get('cache-control')).toBe('no-store');
  });

  it.each([
    ['an HTML page', HTML, 'html'],
    ['JSON', JSON_BODY, 'json'],
    ['an empty body', new Uint8Array(0), 'empty'],
    ['a PDF', text('%PDF-1.7 ...'), 'other'],
    ['a HEIC file', Uint8Array.from([0, 0, 0, 0x18, ...Array.from(text('ftypheic'))]), 'other'],
  ] as const)('%s typed application/octet-stream is refused with a 502 that is never cached, and the log says what it was', async (_name, body, kind) => {
    answer(body, { 'content-type': 'application/octet-stream' });
    const res = await call();
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.body).toBeNull();
    expect(warned()).toContain('Non-image response: application/octet-stream');
    expect(warned()).toContain(`body=${kind}`);
    expect(warned()).toContain(`bytes=${body.byteLength}`);
    expect(info).not.toHaveBeenCalled();
  });

  it('the log never contains the body', async () => {
    answer(text('<html>SECRET-PAGE-CONTENT</html>'), { 'content-type': 'application/octet-stream' });
    await call();
    expect(warned()).not.toContain('SECRET-PAGE-CONTENT');
  });

  it('an answer longer than the limit is refused without being read to the end (declared length)', async () => {
    answer(JPEG, { 'content-type': 'application/octet-stream', 'content-length': String(30 * 1024 * 1024) });
    const res = await call();
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(warned()).toContain('body=over-limit');
  });

  it('an answer that turns out longer than the limit is cancelled and refused (no declared length)', async () => {
    let cancelled = false;
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1;
        controller.enqueue(sent === 1 ? JPEG : new Uint8Array(1024 * 1024));
      },
      cancel() {
        cancelled = true;
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(stream, { status: 200, headers: { 'content-type': 'application/octet-stream' } }));
    const res = await call();
    expect(res.status).toBe(502);
    expect(warned()).toContain('body=over-limit');
    expect(cancelled).toBe(true);
    expect(sent).toBeLessThan(40);
  });
});

describe('an explicit non-image type stays refused, whatever the bytes say', () => {
  it.each(['text/html', 'text/html; charset=utf-8', 'application/json', 'text/plain', 'application/pdf', 'video/mp4'])('%s with a JPEG inside is a 502 that is never cached', async (type) => {
    answer(JPEG, { 'content-type': type });
    const res = await call();
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(warned()).toContain(`Non-image response: ${type}`);
    expect(info).not.toHaveBeenCalled();
  });

  it('the refused body is cancelled, so the upstream connection is not left open', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(HTML);
      },
      cancel() {
        cancelled = true;
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(stream, { status: 200, headers: { 'content-type': 'text/html' } }));
    const res = await call();
    expect(res.status).toBe(502);
    expect(cancelled).toBe(true);
  });

  it('an HTML error page answered 200 is not cached', async () => {
    answer(HTML, { 'content-type': 'text/html' });
    const res = await call();
    expect(res.status).toBe(502);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});

describe('what Cotality refuses or fails', () => {
  it.each([401, 403, 404, 429, 500, 503])('a %s from Cotality is passed on and never cached', async (status) => {
    answer(null, {}, status);
    const res = await call();
    expect(res.status).toBe(status);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('a request that fails or is aborted is a 502 and is logged', async () => {
    fetchMock.mockRejectedValueOnce(new Error('This operation was aborted'));
    const res = await call();
    expect(res.status).toBe(502);
    expect(error.mock.calls.map((c) => c.join(' ')).join('\n')).toContain('This operation was aborted');
  });
});

describe('the concurrency slot is always given back', () => {
  it('after more failures than the limit of 30, the next photo is still served', async () => {
    for (let i = 0; i < 35; i += 1) {
      fetchMock.mockRejectedValueOnce(new Error('boom'));
      expect((await call()).status).toBe(502);
    }
    for (let i = 0; i < 35; i += 1) {
      answer(HTML, { 'content-type': 'application/octet-stream' });
      expect((await call()).status).toBe(502);
    }
    for (let i = 0; i < 35; i += 1) {
      answer(HTML, { 'content-type': 'text/html' });
      expect((await call()).status).toBe(502);
    }
    answer(JPEG, { 'content-type': 'application/octet-stream' });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
  });
});

// Module scope: without a top-level import/export TypeScript treats this file as a global script.
export {};
