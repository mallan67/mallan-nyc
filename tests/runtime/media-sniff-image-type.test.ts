/// <reference types="jest" />
/**
 * What a media answer's bytes are (lib/media/sniff-image-type.ts).
 *
 * The media proxy refuses every 200 answer whose Content-Type is not image/*, because Cotality sometimes answers an HTML error page 200 and a cached error page would break the photo
 * for 7 days. Production logs of 2026-10-10 and 2026-10-11 show the proxy also refusing `application/octet-stream` answers for the later photos of one listing; a header is a claim and
 * the bytes are the evidence. Only the four formats a browser shows in an <img> are accepted; everything else stays refused.
 */
import { classifyBody, sniffImageType } from '@/lib/media/sniff-image-type';

const bytes = (...values: number[]) => Uint8Array.from(values);
const text = (value: string) => new TextEncoder().encode(value);
const riff = (kind: string) => bytes(0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, ...Array.from(text(kind)));

describe('sniffImageType: the four formats a browser shows in an <img>', () => {
  it.each([
    ['a JPEG (JFIF)', bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46), 'image/jpeg'],
    ['a JPEG (Exif)', bytes(0xff, 0xd8, 0xff, 0xe1, 0x12, 0x34, 0x45, 0x78, 0x69, 0x66), 'image/jpeg'],
    ['a PNG', bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00), 'image/png'],
    ['a GIF87a', text('GIF87a\u0001\u0000'), 'image/gif'],
    ['a GIF89a', text('GIF89a\u0001\u0000'), 'image/gif'],
    ['a WebP', riff('WEBPVP8 '), 'image/webp'],
  ] as const)('%s', (_name, data, expected) => {
    expect(sniffImageType(data)).toBe(expected);
  });

  it('needs the whole signature, not a prefix of it', () => {
    expect(sniffImageType(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47))).toBeNull();
    expect(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b))).toBeNull();
    expect(sniffImageType(text('GIF8'))).toBeNull();
    expect(sniffImageType(text('GIF88a'))).toBeNull();
    expect(sniffImageType(text('RIFF'))).toBeNull();
    expect(sniffImageType(text('RIFF$\u0000\u0000\u0000WEB'))).toBeNull();
  });

  it('a RIFF file that is not WebP is not an image the page can show', () => {
    expect(sniffImageType(riff('WAVEfmt '))).toBeNull();
    expect(sniffImageType(riff('AVI LIST'))).toBeNull();
  });

  it.each([
    ['HEIC', Uint8Array.from([0, 0, 0, 0x18, ...Array.from(text('ftypheic'))])],
    ['AVIF', Uint8Array.from([0, 0, 0, 0x1c, ...Array.from(text('ftypavif'))])],
    ['TIFF', bytes(0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00)],
    ['a PDF', text('%PDF-1.7')],
    ['an HTML page', text('<!DOCTYPE html><html></html>')],
    ['JSON', text('{"error":"rate limited"}')],
    ['nothing', new Uint8Array(0)],
    ['one byte', bytes(0xff)],
  ] as const)('%s is refused', (_name, data) => {
    expect(sniffImageType(data)).toBeNull();
  });
});

describe('classifyBody: what a refused body was (logged, the content itself never is)', () => {
  it('passes an image type through', () => {
    expect(classifyBody(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(classifyBody(riff('WEBPVP8 '))).toBe('image/webp');
  });

  it('empty, however it came', () => {
    expect(classifyBody(new Uint8Array(0))).toBe('empty');
  });

  it.each([
    ['a doctype', '<!DOCTYPE html><html><body>Access denied</body></html>'],
    ['an html tag', '<html><head></head></html>'],
    ['white space first', '  \r\n\t<html>'],
    ['a byte order mark first', '﻿<html>'],
    ['an XML-ish page', '<?xml version="1.0"?><error/>'],
  ])('an HTML page: %s', (_name, page) => {
    expect(classifyBody(text(page))).toBe('html');
  });

  it.each([
    ['an object', '{"error":"rate limited"}'],
    ['an array', '[{"error":1}]'],
    ['an object after white space', '\n  {"a":1}'],
  ])('JSON: %s', (_name, body) => {
    expect(classifyBody(text(body))).toBe('json');
  });

  it('anything else, including a binary that is not an image the page can show', () => {
    expect(classifyBody(text('%PDF-1.7'))).toBe('other');
    expect(classifyBody(bytes(0x49, 0x49, 0x2a, 0x00))).toBe('other');
    expect(classifyBody(bytes(0x00, 0x01, 0x02))).toBe('other');
    expect(classifyBody(text('plain words'))).toBe('other');
  });
});

// Module scope: without a top-level import/export TypeScript treats this file as a global script.
export {};
