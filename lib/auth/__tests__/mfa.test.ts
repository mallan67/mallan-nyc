/**
 * MFA Core Logic Tests — Email/SMS OTP
 */
import { generateOtpCode } from '../mfa';

describe('generateOtpCode', () => {
  it('returns a 6-digit string', () => {
    const code = generateOtpCode();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('generates different codes', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateOtpCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
