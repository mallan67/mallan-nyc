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

  // Forgot-password (SMS code) flow state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'verify'>('request');
  const [resetSession, setResetSession] = useState('');
  const [phoneHint, setPhoneHint] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotError, setForgotError] = useState('');

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

      // Verify this is actually a broker account (case-insensitive)
      if (data.user?.role?.toUpperCase() !== 'BROKER') {
        setError('Access denied. Broker credentials required.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      // Use redirect param if provided and safe, otherwise default to CRM
      const redirectParam = searchParams.get('redirect');
      const safeRedirect = redirectParam && /^\/(?:crm|admin)(?:\/|$|\?|#)/.test(redirectParam)
        ? redirectParam
        : null;
      const destination = safeRedirect || '/crm/dashboard';
      setTimeout(() => {
        router.push(destination);
      }, 1000);
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setForgotError(data.error || 'Could not send code.');
        return;
      }
      setResetSession(data.reset_session);
      setPhoneHint(data.phone_hint || '');
      setForgotStep('verify');
    } catch {
      setForgotError('Network error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleVerifyAndReset(e: React.FormEvent) {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reset_session: resetSession,
          code: resetCode,
          password: newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setForgotError(data.error || 'Reset failed.');
        return;
      }
      // Reset succeeded + we're signed in. Redirect to CRM.
      setSuccess(true);
      const redirectParam = searchParams.get('redirect');
      const safeRedirect = redirectParam && /^\/(?:crm|admin)(?:\/|$|\?|#)/.test(redirectParam)
        ? redirectParam
        : null;
      const destination = safeRedirect || '/crm/dashboard';
      setTimeout(() => router.push(destination), 1000);
    } catch {
      setForgotError('Network error. Please try again.');
    } finally {
      setForgotLoading(false);
    }
  }

  function resetForgotFlow() {
    setShowForgot(false);
    setForgotStep('request');
    setForgotEmail('');
    setResetSession('');
    setPhoneHint('');
    setResetCode('');
    setNewPassword('');
    setForgotError('');
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
            {forgotStep === 'request' ? (
              <>
                <p className="text-xs text-white/70 mb-3">Reset your password — we&apos;ll text you a code</p>
                <form onSubmit={handleRequestCode} className="space-y-3">
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 bg-white/15 text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#C4A052]/50"
                    placeholder="Enter your account email"
                  />
                  {forgotError && (
                    <p className="text-xs text-red-400">{forgotError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="flex-1 bg-[#C4A052] text-[#1a1a1a] py-2.5 rounded-xl text-xs font-medium hover:bg-[#C4A052]/90 transition-colors disabled:opacity-50"
                    >
                      {forgotLoading ? 'Sending code...' : 'Send Code'}
                    </button>
                    <button
                      type="button"
                      onClick={resetForgotFlow}
                      className="px-4 py-2.5 text-xs text-white/40 hover:text-white/60 rounded-xl bg-white/5"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <p className="text-xs text-white/70 mb-1">Enter the 6-digit code</p>
                {phoneHint && (
                  <p className="text-[11px] text-white/40 mb-3">Sent to {phoneHint}</p>
                )}
                <form onSubmit={handleVerifyAndReset} className="space-y-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full rounded-xl px-4 py-2.5 bg-white/15 text-white text-center text-lg tracking-[0.5em] font-mono placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#C4A052]/50"
                    placeholder="000000"
                  />
                  <input
                    type="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl px-4 py-2.5 bg-white/15 text-white text-sm placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-[#C4A052]/50"
                    placeholder="New password (8+ chars)"
                  />
                  {forgotError && (
                    <p className="text-xs text-red-400">{forgotError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={forgotLoading || resetCode.length !== 6 || newPassword.length < 8}
                      className="flex-1 bg-[#C4A052] text-[#1a1a1a] py-2.5 rounded-xl text-xs font-medium hover:bg-[#C4A052]/90 transition-colors disabled:opacity-50"
                    >
                      {forgotLoading ? 'Verifying...' : 'Reset & Sign In'}
                    </button>
                    <button
                      type="button"
                      onClick={resetForgotFlow}
                      className="px-4 py-2.5 text-xs text-white/40 hover:text-white/60 rounded-xl bg-white/5"
                    >
                      Cancel
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setForgotStep('request'); setResetCode(''); setNewPassword(''); setForgotError(''); }}
                    className="w-full text-[11px] text-white/40 hover:text-white/60 mt-1"
                  >
                    Didn&apos;t get the code? Send a new one.
                  </button>
                </form>
              </>
            )}
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
