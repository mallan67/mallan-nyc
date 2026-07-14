// Tests for the campaign recipient-list parser + suppression filter.
// Parsing is pure (no DB); the suppression filter takes an injected prisma-like
// client so it runs without a database.

import ExcelJS from 'exceljs';
import {
  parseRecipientFile,
  filterSuppressedRecipients,
  type CampaignRecipient,
} from '../recipient-list';

const buf = (s: string) => Buffer.from(s, 'utf8');

describe('parseRecipientFile — CSV', () => {
  it('parses a headered Email/Name CSV', async () => {
    const r = await parseRecipientFile(buf('Email,Name\nalice@x.com,Alice A\nbob@y.com,Bob B\n'), 'list.csv');
    expect(r.recipients).toEqual([
      { email: 'alice@x.com', name: 'Alice A' },
      { email: 'bob@y.com', name: 'Bob B' },
    ]);
    expect(r.counts).toMatchObject({ total: 2, valid: 2, duplicate: 0, invalid: 0, missing: 0 });
  });

  it('assumes col0=email, col1=name when there is NO recognizable header', async () => {
    const r = await parseRecipientFile(buf('carol@x.com,Carol\ndan@x.com,Dan\n'), 'list.csv');
    expect(r.recipients).toEqual([
      { email: 'carol@x.com', name: 'Carol' },
      { email: 'dan@x.com', name: 'Dan' },
    ]);
  });

  it('lowercases + de-duplicates emails case-insensitively', async () => {
    const r = await parseRecipientFile(buf('Email,Name\nA@X.com,First\na@x.com,Second\n'), 'l.csv');
    expect(r.recipients).toEqual([{ email: 'a@x.com', name: 'First' }]);
    expect(r.counts.duplicate).toBe(1);
    expect(r.counts.valid).toBe(1);
  });

  it('classifies invalid + missing emails without dropping the whole file', async () => {
    const r = await parseRecipientFile(
      buf('Email,Name\ngood@x.com,Good\nnot-an-email,Bad\n,NoEmail\n'),
      'l.csv',
    );
    expect(r.recipients).toEqual([{ email: 'good@x.com', name: 'Good' }]);
    expect(r.counts).toMatchObject({ valid: 1, invalid: 1, missing: 1 });
    expect(r.invalidSamples).toContain('not-an-email');
  });

  it('handles quoted fields containing commas', async () => {
    const r = await parseRecipientFile(buf('Email,Name\neve@x.com,"Eve, Esq."\n'), 'l.csv');
    expect(r.recipients[0]).toEqual({ email: 'eve@x.com', name: 'Eve, Esq.' });
  });

  it('detects a tab-delimited file', async () => {
    const r = await parseRecipientFile(buf('Email\tName\nfrank@x.com\tFrank\n'), 'l.tsv');
    expect(r.recipients).toEqual([{ email: 'frank@x.com', name: 'Frank' }]);
  });

  it('composes a name from First/Last columns when there is no Name column', async () => {
    const r = await parseRecipientFile(buf('First Name,Last Name,Email\nGrace,Hopper,grace@x.com\n'), 'l.csv');
    expect(r.recipients[0]).toEqual({ email: 'grace@x.com', name: 'Grace Hopper' });
  });

  it('falls back to the email local-part when no name is present', async () => {
    const r = await parseRecipientFile(buf('Email\nheidi@x.com\n'), 'l.csv');
    expect(r.recipients[0]).toEqual({ email: 'heidi@x.com', name: 'heidi' });
  });
});

describe('parseRecipientFile — XLSX', () => {
  it('parses a real .xlsx workbook (Email/Name header)', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Recipients');
    ws.addRow(['Email', 'Name']);
    ws.addRow(['ivan@x.com', 'Ivan']);
    ws.addRow(['judy@x.com', 'Judy']);
    const out = await wb.xlsx.writeBuffer();

    const r = await parseRecipientFile(Buffer.from(out), 'investors.xlsx');
    expect(r.recipients).toEqual([
      { email: 'ivan@x.com', name: 'Ivan' },
      { email: 'judy@x.com', name: 'Judy' },
    ]);
    expect(r.counts.valid).toBe(2);
  });
});

describe('filterSuppressedRecipients', () => {
  const recips: CampaignRecipient[] = [
    { email: 'keep@x.com', name: 'Keep' },
    { email: 'gone@x.com', name: 'Gone' },
  ];

  it('splits out addresses with a matching unsubscribed Lead', async () => {
    const db = {
      lead: { findMany: jest.fn().mockResolvedValue([{ email: 'gone@x.com' }]) },
    };
    const r = await filterSuppressedRecipients(recips, db);
    expect(r.kept).toEqual([{ email: 'keep@x.com', name: 'Keep' }]);
    expect(r.suppressed).toEqual([{ email: 'gone@x.com', name: 'Gone' }]);
    // Must query only unsubscribed leads among the uploaded emails.
    expect(db.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: { in: ['keep@x.com', 'gone@x.com'] },
          last_unsubscribe_at: { not: null },
        }),
      }),
    );
  });

  it('keeps everyone when the DB reports no opt-outs', async () => {
    const db = { lead: { findMany: jest.fn().mockResolvedValue([]) } };
    const r = await filterSuppressedRecipients(recips, db);
    expect(r.kept).toHaveLength(2);
    expect(r.suppressed).toHaveLength(0);
  });

  it('short-circuits an empty list without querying', async () => {
    const db = { lead: { findMany: jest.fn() } };
    const r = await filterSuppressedRecipients([], db);
    expect(r).toEqual({ kept: [], suppressed: [] });
    expect(db.lead.findMany).not.toHaveBeenCalled();
  });
});
