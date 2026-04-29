'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect, Suspense } from 'react';

const BEHAVIORAL_SESSION_KEY = 'mallan_behavioral_session';

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Show error from OAuth redirect (e.g. ?error=Google+sign-in+failed)
  useEffect(() => {
    const urlError = searchParams.get('error');
    if (urlError) setError(urlError.replace(/\+/g, ' '));
  }, [searchParams]);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [userName, setUserName] = useState('');
  const [userType, setUserType] = useState('');
  const [userRole, setUserRole] = useState('');
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const sessionId = localStorage.getItem(BEHAVIORAL_SESSION_KEY) || undefined;
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, portalType: 'auto', sessionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed. Please try again.');
        setLoading(false);
        return;
      }

      setUserName(data.user?.name || '');
      setUserType(data.user?.userType || '');
      setUserRole(data.user?.role || '');
      setSubmitted(true);

      const role = data.user?.role || '';
      const uType = data.user?.userType || '';
      const isAgent = uType === 'agent' || role?.toUpperCase() === 'BROKER' || role?.toUpperCase() === 'AGENT';

      // Use redirect param if provided and safe, otherwise default by role
      const redirectParam = searchParams.get('redirect');
      const safeRedirect = redirectParam && /^\/(?:crm|admin|portal)(?:\/|$|\?|#)/.test(redirectParam)
        ? redirectParam
        : null;
      const destination = safeRedirect || (isAgent ? '/crm/dashboard' : '/portal');
      setTimeout(() => {
        router.push(destination);
      }, 1500);
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Success State ───
  if (submitted) {
    const isAgent = userType === 'agent' || userRole?.toUpperCase() === 'BROKER' || userRole?.toUpperCase() === 'AGENT';
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <main className="pt-20 py-16">
          <div className="max-w-md mx-auto px-4 text-center">
            <div className="glass-card rounded-3xl p-10">
              <div className="w-14 h-14 bg-green-50/60 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-display font-semibold mb-2">
                {userName ? `Welcome, ${userName}` : 'Signed In'}
              </h1>
              <p className="text-brand-dark/90 text-sm mb-4">
                Redirecting to your {isAgent ? 'CRM dashboard' : 'portal'}...
              </p>
              <div className="w-full bg-black/5 rounded-full h-1.5">
                <div className="bg-brand-gold h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-20 py-16">
        <div className="max-w-md mx-auto px-4">
          <div className="glass-card rounded-3xl p-8 sm:p-10">

            {/* Title */}
            <h1 className="text-2xl font-display font-bold text-center mb-3">Register / Sign In</h1>
            <p className="text-brand-dark text-center text-base font-semibold mb-8">
              Agents &middot; Buyers &middot; Renters &middot; Sellers &middot; Landlords
            </p>

            {/* Social Auth */}
            <div className="space-y-3 mb-6">
              {/* Google */}
              <a
                href="/api/auth/google"
                className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl ring-1 ring-black/10 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-brand-dark"
              >
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Continue with Google</span>
              </a>

              {/* LinkedIn */}
              <a
                href="/api/auth/linkedin"
                className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl bg-[#0A66C2] text-white hover:bg-[#004182] transition-colors text-sm font-medium"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                </svg>
                <span>Continue with LinkedIn</span>
              </a>

              {/* Facebook */}
              <a
                href="/api/auth/facebook"
                className="w-full flex items-center gap-4 px-5 py-3 rounded-2xl bg-[#1877F2] text-white hover:bg-[#166FE5] transition-colors text-sm font-medium"
              >
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span>Continue with Facebook</span>
              </a>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-black/10" />
              <span className="text-xs text-brand-dark/90 font-medium">or continue with email</span>
              <div className="flex-1 h-px bg-black/10" />
            </div>

            {/* Email Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="signin-email" className="sr-only">Email address</label>
                <input
                  type="email"
                  id="signin-email"
                  name="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/8 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                  placeholder="Email address"
                />
              </div>

              <div>
                <label htmlFor="signin-password" className="sr-only">Password</label>
                <input
                  type="password"
                  id="signin-password"
                  name="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/8 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                  placeholder="Password"
                />
              </div>

              {error && (
                <div className="p-3 rounded-2xl bg-red-50 text-red-700 text-sm text-center">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-brand-dark text-white py-3 rounded-2xl hover:bg-brand-dark/90 transition-colors text-sm font-medium disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>

              <div className="text-right">
                <button
                  type="button"
                  onClick={() => setShowForgot(!showForgot)}
                  onTouchEnd={(e) => { e.preventDefault(); setShowForgot(!showForgot); }}
                  className="text-sm text-brand-gold hover:underline py-2 px-1 min-h-[44px] inline-flex items-center"
                >
                  Forgot password?
                </button>
              </div>
            </form>

            {/* Forgot Password */}
            {showForgot && (
              <div className="mt-2 p-4 bg-gray-50/50 rounded-2xl">
                <p className="text-sm font-medium mb-3">Reset your password</p>
                <form onSubmit={handleForgotPassword} className="space-y-3">
                  <label htmlFor="forgot-email" className="sr-only">Email address for password reset</label>
                  <input
                    type="email"
                    id="forgot-email"
                    name="forgotEmail"
                    required
                    autoComplete="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/8 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
                    placeholder="Enter your email address"
                  />
                  {forgotMessage && (
                    <p className={`text-sm ${forgotMessage.includes('error') ? 'text-red-600' : 'text-green-600'}`}>
                      {forgotMessage}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={forgotLoading}
                      className="flex-1 bg-brand-gold text-white py-2.5 rounded-2xl hover:bg-brand-gold/90 transition-colors text-sm font-medium disabled:opacity-50"
                    >
                      {forgotLoading ? 'Sending...' : 'Send Reset Link'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowForgot(false); setForgotMessage(''); }}
                      className="px-4 py-2.5 text-sm text-brand-dark/90 hover:text-brand-dark rounded-2xl ring-1 ring-black/8"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Create Account */}
            <div className="mt-6 pt-6 border-t border-black/5 text-center">
              <p className="text-brand-dark/90 text-sm mb-3">Don&apos;t have an account?</p>
              <Link
                href="/sign-up"
                className="inline-block w-full px-5 py-3 ring-1 ring-brand-dark/20 text-brand-dark rounded-2xl hover:bg-black/3 transition-colors text-sm font-medium"
              >
                Create Account
              </Link>
            </div>

            {/* Help */}
            <div className="mt-5 text-center">
              <div className="flex gap-3 justify-center items-center text-xs">
                <Link href="/agents" className="text-brand-gold hover:underline">
                  Contact an Agent
                </Link>
                <span className="text-brand-dark/20">|</span>
                <a href="tel:+16462584460" className="text-brand-gold hover:underline">
                  (646) 258-4460
                </a>
                <span className="text-brand-dark/20">|</span>
                <Link href="/admin/login" aria-label="Broker Admin">
                  <Image
                    src="/images/broker-admin-icon.png"
                    alt=""
                    width={40}
                    height={40}
                    className="opacity-60 hover:opacity-100 transition-opacity"
                  />
                </Link>
              </div>
            </div>
          </div>

          <p className="text-center text-xs text-brand-dark/90 mt-6">
            By continuing, you agree to our{' '}
            <Link href="/terms" className="hover:text-brand-gold underline">Terms</Link>
            {' '}&amp;{' '}
            <Link href="/privacy" className="hover:text-brand-gold underline">Privacy Policy</Link>
          </p>
        </div>
      </main>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
