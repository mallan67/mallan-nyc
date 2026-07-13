import { makeUnsubscribeToken, verifyUnsubscribeToken } from '../unsubscribe-token';

const ORIG = { ...process.env };
afterEach(() => {
  process.env = { ...ORIG };
});

describe('unsubscribe HMAC token', () => {
  it('make + verify round-trips (and normalizes case/whitespace)', () => {
    process.env.UNSUBSCRIBE_SECRET = 's3cr3t';
    const t = makeUnsubscribeToken('Alice@Example.com');
    expect(t).toBeTruthy();
    expect(verifyUnsubscribeToken('alice@example.com', t)).toBe(true);
    expect(verifyUnsubscribeToken('  Alice@Example.com ', t)).toBe(true);
  });

  it('rejects an ALTERED email (the URL-tamper attack)', () => {
    process.env.UNSUBSCRIBE_SECRET = 's3cr3t';
    const t = makeUnsubscribeToken('alice@example.com');
    expect(verifyUnsubscribeToken('bob@example.com', t)).toBe(false);
  });

  it('rejects a garbage or truncated/altered token', () => {
    process.env.UNSUBSCRIBE_SECRET = 's3cr3t';
    expect(verifyUnsubscribeToken('alice@example.com', 'not-a-real-token')).toBe(false);
    const t = makeUnsubscribeToken('alice@example.com')!;
    const flipped = t.slice(0, -1) + (t.endsWith('A') ? 'B' : 'A');
    expect(verifyUnsubscribeToken('alice@example.com', flipped)).toBe(false);
    expect(verifyUnsubscribeToken('alice@example.com', '')).toBe(false);
    expect(verifyUnsubscribeToken('alice@example.com', null)).toBe(false);
  });

  it('no secret configured: make() is null and verify() rejects any token (fail-closed)', () => {
    delete process.env.UNSUBSCRIBE_SECRET;
    delete process.env.UNSUBSCRIBE_SECRET_PREVIOUS;
    expect(makeUnsubscribeToken('alice@example.com')).toBeNull();
    expect(verifyUnsubscribeToken('alice@example.com', 'anything')).toBe(false);
  });

  it('key rotation: a token signed with the PREVIOUS secret still verifies during the window', () => {
    process.env.UNSUBSCRIBE_SECRET = 'old-secret';
    const t = makeUnsubscribeToken('alice@example.com');
    // rotate: new current + keep previous accepted
    process.env.UNSUBSCRIBE_SECRET = 'new-secret';
    process.env.UNSUBSCRIBE_SECRET_PREVIOUS = 'old-secret';
    expect(verifyUnsubscribeToken('alice@example.com', t)).toBe(true);
    // after the window (previous cleared) the old token no longer verifies
    delete process.env.UNSUBSCRIBE_SECRET_PREVIOUS;
    expect(verifyUnsubscribeToken('alice@example.com', t)).toBe(false);
  });
});
