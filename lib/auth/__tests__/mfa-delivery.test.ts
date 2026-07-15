/**
 * deliverMfaCode — fail-closed OTP delivery.
 *
 * Regression pins for the login MFA path:
 *  - A false-RESOLVING sendOtpSms (Twilio unavailable / delivery failed) must NOT
 *    be treated as delivered. This is the exact bug that `.then(() => true)` caused.
 *  - When neither channel delivers, `delivered` is false so the caller fail-closes
 *    (deletes the mfa_session + returns 503) instead of advancing to the MFA screen.
 */
import { deliverMfaCode } from '../mfa-delivery';
import { sendOtpEmail, sendOtpSms } from '../mfa';

jest.mock('../mfa', () => ({
  sendOtpEmail: jest.fn(),
  sendOtpSms: jest.fn(),
}));

const mockEmail = sendOtpEmail as jest.MockedFunction<typeof sendOtpEmail>;
const mockSms = sendOtpSms as jest.MockedFunction<typeof sendOtpSms>;

const base = { email: 'maya@example.test', code: '123456', agentName: 'Maya' };

beforeEach(() => {
  mockEmail.mockReset();
  mockSms.mockReset();
});

describe('deliverMfaCode', () => {
  it('email false + SMS resolves false → NOT delivered (the SMS-boolean bug)', async () => {
    mockEmail.mockResolvedValue(false);
    mockSms.mockResolvedValue(false); // resolves false, does NOT reject
    const r = await deliverMfaCode({ ...base, phone: '+15551230000' });
    expect(r.smsSent).toBe(false);
    expect(r.emailSent).toBe(false);
    expect(r.delivered).toBe(false);
  });

  it('email false + no phone → NOT delivered', async () => {
    mockEmail.mockResolvedValue(false);
    const r = await deliverMfaCode({ ...base, phone: null });
    expect(mockSms).not.toHaveBeenCalled();
    expect(r.delivered).toBe(false);
  });

  it('email true → delivered', async () => {
    mockEmail.mockResolvedValue(true);
    const r = await deliverMfaCode({ ...base, phone: null });
    expect(r.emailSent).toBe(true);
    expect(r.delivered).toBe(true);
  });

  it('email false + SMS resolves true → delivered', async () => {
    mockEmail.mockResolvedValue(false);
    mockSms.mockResolvedValue(true);
    const r = await deliverMfaCode({ ...base, phone: '+15551230000' });
    expect(r.smsSent).toBe(true);
    expect(r.delivered).toBe(true);
  });

  it('SMS that REJECTS is caught and treated as not sent', async () => {
    mockEmail.mockResolvedValue(false);
    mockSms.mockRejectedValue(new Error('twilio boom'));
    const r = await deliverMfaCode({ ...base, phone: '+15551230000' });
    expect(r.smsSent).toBe(false);
    expect(r.delivered).toBe(false);
  });
});
