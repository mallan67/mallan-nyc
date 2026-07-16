// Hardening tests for lib/email/sendgrid.ts: fail-closed suppression, dry-run,
// test-send allowlist, batch cap, and the signed unsubscribe token in headers.
// SMTP is mocked (nodemailer) and prisma is mocked — no real delivery, no DB.

// Configure BEFORE requiring the module (isConfigured + secret are read at load/call).
process.env.SMTP_USER = 'contact@mallan.nyc';
process.env.SMTP_PASS = 'app-password';
process.env.UNSUBSCRIBE_SECRET = 'test-secret';

const mockLeadFindUnique = jest.fn<Promise<unknown>, [unknown]>();
const mockAuditCreate = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(undefined);
// findEmailSuppression (lib/email/suppression.ts) also reads the AuditEvent ledger.
const mockAuditFindFirst = jest.fn<Promise<unknown>, [unknown]>().mockResolvedValue(null);
const mockSendMail = jest.fn<Promise<{ messageId: string }>, [unknown]>();

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    lead: { findUnique: (a: unknown) => mockLeadFindUnique(a) },
    auditEvent: {
      create: (a: unknown) => mockAuditCreate(a),
      findFirst: (a: unknown) => mockAuditFindFirst(a),
    },
  },
}));

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: { createTransport: () => ({ sendMail: (a: unknown) => mockSendMail(a) }) },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { sendEmail, sendBulkEmail } = require('../sendgrid') as typeof import('../sendgrid');

beforeEach(() => {
  mockLeadFindUnique.mockReset().mockResolvedValue(null);
  mockAuditFindFirst.mockReset().mockResolvedValue(null);
  mockAuditCreate.mockClear();
  mockSendMail.mockReset().mockResolvedValue({ messageId: 'mid-1' });
});

describe('sendEmail — suppression', () => {
  it('skips a Lead-opt-out recipient (no SMTP)', async () => {
    mockLeadFindUnique.mockResolvedValue({ last_unsubscribe_at: new Date() });
    const r = await sendEmail('opted@out.com', 'S', '<p>x</p>');
    expect(r.success).toBe(false);
    expect(r._suppressed).toBe(true);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'email:send_suppressed_unsubscribed', changes: expect.objectContaining({ suppression_source: 'lead' }) }) }),
    );
  });

  it('blocks a NON-Lead recipient using the AuditEvent ledger ALONE (no SMTP)', async () => {
    mockLeadFindUnique.mockResolvedValue(null); // no Lead row
    mockAuditFindFirst.mockResolvedValue({ created_at: new Date() }); // opted out via AuditEvent
    const r = await sendEmail('cold@acris.com', 'S', '<p>x</p>');
    expect(r.success).toBe(false);
    expect(r._suppressed).toBe(true);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'email:send_suppressed_unsubscribed', changes: expect.objectContaining({ suppression_source: 'audit_event' }) }) }),
    );
  });

  it('when BOTH sources prove opt-out, still suppressed once (source=both, no duplicate send)', async () => {
    mockLeadFindUnique.mockResolvedValue({ last_unsubscribe_at: new Date() });
    mockAuditFindFirst.mockResolvedValue({ created_at: new Date() });
    const r = await sendEmail('opted@out.com', 'S', '<p>x</p>');
    expect(r._suppressed).toBe(true);
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ changes: expect.objectContaining({ suppression_source: 'both' }) }) }),
    );
  });

  it('FAIL-CLOSED: a suppression-lookup failure BLOCKS the send (no SMTP)', async () => {
    mockLeadFindUnique.mockRejectedValue(new Error('prisma db timeout'));
    const r = await sendEmail('who@x.com', 'S', '<p>x</p>');
    expect(r.success).toBe(false);
    // Distinct sentinel from a VERIFIED opt-out — an infra outage, not an unsubscribe.
    expect(r._suppressionError).toBe(true);
    expect(r._suppressed).toBeUndefined();
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'email:send_blocked_suppression_error' }) }),
    );
  });

  it('a transactional send bypasses suppression entirely', async () => {
    mockLeadFindUnique.mockResolvedValue({ last_unsubscribe_at: new Date() });
    const r = await sendEmail('opted@out.com', 'S', '<p>x</p>', undefined, { transactional: true });
    expect(r.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});

describe('sendEmail — dry-run + test allowlist', () => {
  it('dry-run performs no delivery', async () => {
    mockLeadFindUnique.mockResolvedValue(null);
    const r = await sendEmail('a@b.com', 'S', '<p>x</p>', undefined, { dryRun: true });
    expect(r.success).toBe(true);
    expect(r._dryRun).toBe(true);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('test mode CANNOT send outside the allowlist, but delivers an allowlisted address', async () => {
    mockLeadFindUnique.mockResolvedValue(null);
    const skipped = await sendEmail('stranger@x.com', 'S', '<p>x</p>', undefined, { testAllowlist: ['maya@mallan.nyc'] });
    expect(skipped._skippedTestMode).toBe(true);
    expect(mockSendMail).not.toHaveBeenCalled();

    const ok = await sendEmail('Maya@Mallan.NYC', 'S', '<p>x</p>', undefined, { testAllowlist: ['maya@mallan.nyc'] });
    expect(ok._skippedTestMode).toBeUndefined();
    expect(ok.success).toBe(true);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});

describe('sendEmail — signed unsubscribe token in the link', () => {
  it('a delivered marketing send carries a token in the List-Unsubscribe header', async () => {
    mockLeadFindUnique.mockResolvedValue(null);
    await sendEmail('a@b.com', 'S', '<p>x</p>');
    const mail = mockSendMail.mock.calls[0][0] as { headers?: Record<string, string> };
    const luh = String(mail.headers?.['List-Unsubscribe']);
    // RFC 8058: header must point at the API handler (not the /unsubscribe page) + carry the token.
    expect(luh).toMatch(/\/api\/unsubscribe\?email=/);
    expect(luh).toMatch(/[?&]token=/);
  });
});

describe('sendBulkEmail — batch cap + dry-run', () => {
  it('refuses a batch over the cap and sends nothing', async () => {
    const recips = Array.from({ length: 5 }, (_, i) => ({ email: `u${i}@x.com`, name: 'U' }));
    const r = await sendBulkEmail(recips, 'S', '<p>x</p>', undefined, { maxBatch: 3 });
    expect(r.success).toBe(false);
    expect(r.sent).toBe(0);
    expect(r.skipped).toBe(5);
    expect(mockSendMail).not.toHaveBeenCalled();
  });

  it('dry-run bulk delivers nothing', async () => {
    mockLeadFindUnique.mockResolvedValue(null);
    const recips = Array.from({ length: 3 }, (_, i) => ({ email: `u${i}@x.com`, name: 'U' }));
    const r = await sendBulkEmail(recips, 'S', '<p>x</p>', undefined, { dryRun: true, maxBatch: 10 });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(r.sent).toBe(3); // simulated (no delivery)
  });
});
