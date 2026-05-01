'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';

function BrokerLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
  // MFA state — populated when /api/auth/login responds with `mfa_required: true`.
  // Until then, the password form is shown. Once set, the MFA-code input replaces it.
  const [mfaSession, setMfaSession] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  function redirectAfterAuth() {
    const redirectParam = searchParams.get('redirect');
    const safeRedirect = redirectParam && /^\/(?:crm|admin)(?:\/|$|\?|#)/.test(redirectParam)
      ? redirectParam
      : null;
    const destination = safeRedirect || '/crm/dashboard';
    setTimeout(() => {
      router.push(destination);
    }, 1000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          portalType: 'broker',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed.');
        setLoading(false);
        return;
      }

      // ── MFA required (broker login always triggers this) ──
      // The server returns `{ mfa_required: true, mfa_session: <token> }` and has
      // already dispatched a 6-digit code via email and (if Twilio configured) SMS.
      // Switch to the MFA-code-entry view; password form stays in state but is
      // hidden until cancel/back.
      if (data.mfa_required && data.mfa_session) {
        setMfaSession(data.mfa_session);
        setMfaError('');
        setMfaCode('');
        setLoading(false);
        return;
      }

      // ── Direct session (no-MFA path; not expected for brokers) ──
      // Verify this is actually a broker account (case-insensitive)
      if (data.user?.role?.toUpperCase() !== 'BROKER') {
        setError('Access denied. Broker credentials required.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      redirectAfterAuth();
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    setMfaError('');
    setMfaLoading(true);

    try {
      const trimmed = mfaCode.trim();
      if (!/^\d{6}$/.test(trimmed)) {
        setMfaError('Enter the 6-digit code from your email or phone.');
        setMfaLoading(false);
        return;
      }
      const res = await fetch('/api/auth/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfa_session: mfaSession, code: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMfaError(data.error || 'Verification failed.');
        // 422 with "Invalid or expired" / "Too many failed attempts" / "Code expired"
        // means the MFA session is dead — drop back to the password form.
        if (res.status === 422 || res.status === 429) {
          if (typeof data.error === 'string' && /(expired|too many|log in again)/i.test(data.error)) {
            setMfaSession('');
            setMfaCode('');
          }
        }
        setMfaLoading(false);
        return;
      }

      if (data.user?.role?.toUpperCase() !== 'BROKER') {
        setMfaError('Access denied. Broker credentials required.');
        setMfaLoading(false);
        return;
      }

      setSuccess(true);
      redirectAfterAuth();
    } catch {
      setMfaError('Network error.');
    } finally {
      setMfaLoading(false);
    }
  }

  function handleMfaCancel() {
    setMfaSession('');
    setMfaCode('');
    setMfaError('');
    setMfaLoading(false);
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    setForgotMessage('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      setForgotMessage(data.message || 'If an account exists, a reset link has been sent.');
    } catch {
      setForgotMessage('Network error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4 font-sans">
      <div className="w-full max-w-sm">
        {/* Minimal brand */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <span className="text-xl font-bold text-[#1a1a1a] tracking-tight">MALLAN</span>
            <span className="text-xl font-light text-[#C4A052] tracking-tight ml-1">NYC</span>
          </Link>
          <p className="text-[#1a1a1a]/30 text-xs mt-2 tracking-widest uppercase">Broker Admin</p>
        </div>

        {success ? (
          <div className="bg-[#141B2D] rounded-2xl p-8 text-center">
            <div className="w-12 h-12 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-white/70 text-sm">Redirecting to CRM...</p>
          </div>
        ) : mfaSession ? (
          <form onSubmit={handleMfaVerify} className="bg-[#141B2D] rounded-2xl p-8">
            <div className="space-y-4">
              <div>
                <p className="text-white text-sm font-medium mb-1">Two-factor verification</p>
                <p className="text-white/60 text-xs">
                  We sent a 6-digit code to your registered email and phone. Enter it below — it expires in 5 minutes.
                </p>
              </div>
              <div>
                <label htmlFor="mfaCode" className="block text-xs text-white/70 font-medium mb-1.5">
                  6-digit code
                </label>
                <input
                  type="text"
                  id="mfaCode"
                  required
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-xl px-4 py-3 bg-white/15 text-white text-base tracking-widest font-mono text-center placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#C4A052]/50"
                  placeholder="••••••"
                />
              </div>

              {mfaError && (
                <div className="p-3 rounded-xl bg-red-500/10 text-red-400 text-sm text-center">
                  {mfaError}
                </div>
              )}

              <button
                type="submit"
                disabled={mfaLoading || mfaCode.length !== 6}
                className="w-full bg-[#C4A052] text-[#1a1a1a] py-3 rounded-xl font-medium text-sm hover:bg-[#C4A052]/90 transition-colors disabled:opacity-50"
              >
                {mfaLoading ? 'Verifying...' : 'Verify'}
              </button>

              <div className="text-right">
                <button
                  type="button"
                  onClick={handleMfaCancel}
                  className="text-xs text-white/40 hover:text-white/60 transition-colors"
                >
                  Cancel and re-enter password
                </button>
              </div>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} className="bg-[#141B2D] rounded-2xl p-8">
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs text-white/70 font-medium mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  id="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 bg-white/15 text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#C4A052]/50"
                  placeholder="broker@mallan.nyc"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-xs text-white/70 font-medium mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl px-4 py-3 bg-white/15 text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#C4A052]/50"
                  placeholder="Password"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 text-red-400 text-sm text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#C4A052] text-[#1a1a1a] py-3 rounded-xl font-medium text-sm hover:bg-[#C4A052]/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </button>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgot(!showForgot)}
                  className="text-xs text-[#C4A052]/60 hover:text-[#C4A052] transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            </div>
          </form>
        )}

        {showForgot && !success && (
          <div className="mt-3 bg-[#141B2D] rounded-2xl p-5">
            <p className="text-xs text-white/70 mb-3">Reset your password</p>
            <form onSubmit={handleForgotPassword} className="space-y-3">
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="w-full rounded-xl px-4 py-2.5 bg-white/15 text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#C4A052]/50"
                placeholder="Enter your email"
              />
              {forgotMessage && (
                <p className={`text-xs ${forgotMessage.includes('error') ? 'text-red-400' : 'text-green-400'}`}>
                  {forgotMessage}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="flex-1 bg-[#C4A052] text-[#1a1a1a] py-2.5 rounded-xl text-xs font-medium hover:bg-[#C4A052]/90 transition-colors disabled:opacity-50"
                >
                  {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowForgot(false); setForgotMessage(''); }}
                  className="px-4 py-2.5 text-xs text-white/40 hover:text-white/60 rounded-xl bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <p className="text-center text-[#1a1a1a]/20 text-[10px] mt-8">
          Mallan Real Estate Inc. | Broker License #10991205323
        </p>
      </div>
    </div>
  );
}

export default function BrokerLoginPage() {
  return (
    <Suspense>
      <BrokerLoginContent />
    </Suspense>
  );
}
