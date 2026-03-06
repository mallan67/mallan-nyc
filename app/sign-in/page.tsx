'use client';

import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SignInPage() {
  const router = useRouter();
  const [step, setStep] = useState<'method' | 'email'>('method');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
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
      // portalType "auto" — backend tries Agent table first, then Lead table
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, portalType: 'auto' }),
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
      setTimeout(() => {
        router.push(isAgent ? '/crm/MALLAN-NYC-CRM-FINAL2.html' : '/portal');
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
        <Header dark />
        <main className="pt-20 py-16">
          <div className="max-w-md mx-auto px-4 text-center">
            <div className="glass-card rounded-3xl p-10">
              <div className="w-16 h-16 bg-green-50/60 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-display font-semibold mb-2">
                {userName ? `Welcome, ${userName}` : 'Signed In'}
              </h1>
              <p className="text-brand-dark/60 mb-4">
                Redirecting to your {isAgent ? 'CRM dashboard' : 'portal'}...
              </p>
              <div className="w-full bg-black/5 rounded-full h-1.5 mb-6">
                <div className="bg-brand-gold h-1.5 rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
              <Link
                href="/"
                className="inline-block mt-2 px-6 py-3 bg-brand-dark text-white rounded-2xl hover:bg-brand-dark/90 transition-colors text-sm font-medium"
              >
                Back to Home
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <Header dark />
      <main className="pt-20 py-16">
        <div className="max-w-md mx-auto px-4">
          <div className="glass-card rounded-3xl p-10">

            {/* ─── Step 1: Choose Sign-In Method ─── */}
            {step === 'method' && (
              <>
                <h1 className="text-2xl font-display font-semibold text-center mb-2">Sign In</h1>
                <p className="text-brand-dark/50 text-center text-sm mb-8">
                  Access your Mallan Real Estate account
                </p>

                <div className="space-y-3">
                  {/* Google */}
                  <button
                    type="button"
                    disabled
                    className="w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl ring-1 ring-black/10 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-brand-dark/80 disabled:opacity-40 disabled:cursor-not-allowed relative"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Continue with Google</span>
                    <span className="absolute right-4 text-[10px] text-brand-dark/30 font-normal">Coming Soon</span>
                  </button>

                  {/* Facebook */}
                  <button
                    type="button"
                    disabled
                    className="w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl bg-[#1877F2] text-white hover:bg-[#166FE5] transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed relative"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    <span>Continue with Facebook</span>
                    <span className="absolute right-4 text-[10px] text-white/50 font-normal">Coming Soon</span>
                  </button>

                  {/* Apple */}
                  <button
                    type="button"
                    disabled
                    className="w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl bg-black text-white hover:bg-black/90 transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed relative"
                  >
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    <span>Continue with Apple</span>
                    <span className="absolute right-4 text-[10px] text-white/50 font-normal">Coming Soon</span>
                  </button>

                  {/* Email */}
                  <button
                    type="button"
                    onClick={() => setStep('email')}
                    className="w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl ring-1 ring-black/10 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-brand-dark cursor-pointer"
                  >
                    <svg className="w-5 h-5 flex-shrink-0 text-brand-dark/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <span>Continue with Email</span>
                  </button>
                </div>

                {/* Sign Up Link */}
                <div className="mt-8 pt-6 border-t border-black/5 text-center">
                  <p className="text-brand-dark/60 text-sm">
                    Don&apos;t have an account?{' '}
                    <Link href="/sign-up" className="text-brand-gold font-semibold hover:underline">
                      Create Account
                    </Link>
                  </p>
                </div>
              </>
            )}

            {/* ─── Step 2: Email + Password ─── */}
            {step === 'email' && (
              <>
                <div className="flex items-center mb-6">
                  <button
                    type="button"
                    onClick={() => { setStep('method'); setError(''); setShowForgot(false); }}
                    className="p-2 -ml-2 rounded-xl hover:bg-black/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <svg className="w-5 h-5 text-brand-dark/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h1 className="text-xl font-display font-semibold text-center flex-1 pr-8">Sign In with Email</h1>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      id="email"
                      required
                      autoFocus
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                      placeholder="you@example.com"
                    />
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-medium mb-1">
                      Password
                    </label>
                    <input
                      type="password"
                      id="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-2xl px-4 py-3 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30"
                      placeholder="Your password"
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
                    className="w-full bg-brand-dark text-white py-3 rounded-2xl hover:bg-brand-dark/90 transition-colors font-medium disabled:opacity-50 cursor-pointer"
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

                {showForgot && (
                  <div className="mt-4 p-4 bg-gray-50/50 rounded-2xl">
                    <p className="text-sm font-medium mb-3">Reset your password</p>
                    <form onSubmit={handleForgotPassword} className="space-y-3">
                      <input
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="w-full rounded-2xl px-4 py-2.5 bg-white/60 ring-1 ring-black/5 focus:outline-none focus:ring-2 focus:ring-brand-gold/30 text-sm"
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
                          className="px-4 py-2.5 text-sm text-brand-dark/60 hover:text-brand-dark rounded-2xl ring-1 ring-black/5"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Sign Up Link */}
                <div className="mt-6 pt-6 border-t border-black/5 text-center">
                  <p className="text-brand-dark/60 text-sm">
                    Don&apos;t have an account?{' '}
                    <Link href="/sign-up" className="text-brand-gold font-semibold hover:underline">
                      Create Account
                    </Link>
                  </p>
                </div>
              </>
            )}

            {/* Contact — always visible */}
            <div className="mt-6 text-center">
              <p className="text-brand-dark/50 text-xs mb-2">Need help?</p>
              <div className="flex gap-3 justify-center">
                <Link href="/agents" className="text-xs text-brand-gold hover:underline">
                  Contact an Agent
                </Link>
                <span className="text-brand-dark/20">|</span>
                <a href="tel:+16462584460" className="text-xs text-brand-gold hover:underline">
                  (646) 258-4460
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
