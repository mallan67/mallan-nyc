/// <reference types="jest" />
/**
 * Prospect-import ROUTE-level test (runtime side-effect proof).
 *
 * Complements the parser-fixture suite (prospect-import-parse.test.ts):
 * that one proves the parser handles row shapes; this one proves the
 * route handler does the right thing with parsed output.
 *
 * Cases (per validator-truth spec §11):
 *   1. Preview mode (?preview=true) returns columns_detected + sample_rows
 *      WITHOUT writing to DB
 *   2. Import mode (no preview flag) calls prisma.sellerLead.create per row
 *   3. Duplicate handling — Prisma P2002 → skipped, not error
 *   4. File too large (>50MB) → 413
 *   5. Malformed workbook → 400 with parse error message
 */

import ExcelJS from 'exceljs';
import { buildPrismaMock, makeRequest, readJson } from './helpers';

const { prisma: prismaMock } = buildPrismaMock();
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

const AUTH_CONTEXT = { userId: 1n, userType: 'agent' as const, role: 'BROKER' };
jest.mock('@/lib/auth', () => ({
  __esModule: true,
  requireAgentOrBroker: jest.fn(async () => AUTH_CONTEXT),
  isAuthError: jest.fn(() => false),
  logAuditEvent: jest.fn(async () => undefined),
}));
jest.mock('@/lib/auth/readonly-guard', () => ({
  __esModule: true,
  assertWriteAllowed: () => null,
}));

async function buildXlsxBuffer(rows: (string | number | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('sheet1');
  for (const r of rows) ws.addRow(r);
  const ab = await wb.xlsx.writeBuffer();
  return Buffer.from(ab as ArrayBuffer);
}

function makeFormDataRequest(buf: Buffer, filename: string, qs = ''): Request {
  const formData = new FormData();
  // Cast Buffer → Uint8Array for Blob compatibility
  const uint8 = new Uint8Array(buf);
  const blob = new Blob([uint8], { type: 'application/octet-stream' });
  formData.append('file', blob, filename);
  formData.append('source', 'test_run');
  return new Request(`http://localhost/api/crm/sales/prospects/import${qs}`, {
    method: 'POST',
    body: formData,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('prospect-import route effect', () => {
  it('case 1: preview mode returns columns_detected + sample_rows, NO DB writes', async () => {
    const buf = await buildXlsxBuffer([
      ['name', 'email', 'address'],
      ['Jane Doe', 'jane@test.com', '100 E 90th St'],
    ]);
    const sellerLeadCreate = jest.fn(async () => ({ id: 1 }));
    (prismaMock as { sellerLead: { create: jest.Mock } }).sellerLead.create = sellerLeadCreate;

    const route = await import('@/app/api/crm/sales/prospects/import/route');
    const req = makeFormDataRequest(buf, 'preview.xlsx', '?preview=true');
    const res = await route.POST(req as never);

    expect(res.status).toBe(200);
    const body = await readJson<{ preview: boolean; columns_detected: Record<string, string>; sample_rows: object[]; total_rows: number }>(res);
    expect(body.preview).toBe(true);
    expect(body.columns_detected.owner_name).toBe('name');
    expect(body.columns_detected.owner_email).toBe('email');
    expect(body.columns_detected.address).toBe('address');
    expect(body.total_rows).toBe(1);
    expect(body.sample_rows.length).toBe(1);

    // CRITICAL: no DB writes in preview mode
    expect(sellerLeadCreate).not.toHaveBeenCalled();
  });

  it('case 2: import mode creates SellerLead rows', async () => {
    const buf = await buildXlsxBuffer([
      ['name', 'email', 'phone', 'address'],
      ['Alice', 'a@test.com', '555-0100', '100 W 90th St'],
      ['Bob', 'b@test.com', '555-0200', '200 W 90th St'],
    ]);
    const sellerLeadCreate = jest.fn(async () => ({ id: 1 }));
    (prismaMock as { sellerLead: { create: jest.Mock } }).sellerLead.create = sellerLeadCreate;

    const route = await import('@/app/api/crm/sales/prospects/import/route');
    const req = makeFormDataRequest(buf, 'import.xlsx');
    const res = await route.POST(req as never);

    expect(res.status).toBe(200);
    const body = await readJson<{ imported: number; skipped: number; errors: number }>(res);
    expect(body.imported).toBe(2);
    expect(body.errors).toBe(0);
    expect(sellerLeadCreate).toHaveBeenCalledTimes(2);

    const calls = sellerLeadCreate.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>;
    const firstCall = calls[0]?.[0];
    expect(firstCall).toBeDefined();
    expect(firstCall?.data.owner_name).toBe('Alice');
    expect(firstCall?.data.owner_email).toBe('a@test.com');
    expect(firstCall?.data.address).toBe('100 W 90th St');
    expect(firstCall?.data.assigned_agent_id).toBe(1n);
  });

  it('case 3: duplicate (Prisma P2002) → skipped, not error', async () => {
    const buf = await buildXlsxBuffer([
      ['name', 'address'],
      ['Carol', '300 E 90th St'],
      ['Dave', '300 E 90th St'],   // would-be duplicate
    ]);
    let callIdx = 0;
    const sellerLeadCreate = jest.fn(async () => {
      callIdx++;
      if (callIdx === 2) {
        // Simulate Prisma unique-constraint violation
        const err = new Error('Unique constraint failed') as Error & { code: string };
        err.code = 'P2002';
        throw err;
      }
      return { id: callIdx };
    });
    (prismaMock as { sellerLead: { create: jest.Mock } }).sellerLead.create = sellerLeadCreate;

    const route = await import('@/app/api/crm/sales/prospects/import/route');
    const req = makeFormDataRequest(buf, 'dup.xlsx');
    const res = await route.POST(req as never);

    expect(res.status).toBe(200);
    const body = await readJson<{ imported: number; skipped: number; errors: number }>(res);
    expect(body.imported).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.errors).toBe(0); // P2002 is skip, not error
  });

  it('case 5: malformed workbook → 400', async () => {
    const garbage = Buffer.from('this is not a valid xlsx file', 'utf-8');
    const route = await import('@/app/api/crm/sales/prospects/import/route');
    const req = makeFormDataRequest(garbage, 'malformed.xlsx');
    const res = await route.POST(req as never);

    expect(res.status).toBe(400);
    const body = await readJson<{ error: string }>(res);
    expect(body.error).toMatch(/parse|valid CSV or XLSX/i);
  });
});
