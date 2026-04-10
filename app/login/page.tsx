'use client';

import { Suspense, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';

type AuthMode = 'login' | 'register' | 'magic-link';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    searchParams.get('error') ? 'Authentication failed. Please try again.' : null,
  );

  const supabase = createSupabaseBrowser();

  // ── Email + Password Sign In ─────────────────────────
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // If user signed up via magic link and has no password
        if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. If you signed up with Magic Link, please use that method instead.');
        } else {
          setError(error.message);
        }
        setLoading(false);
        return;
      }

      router.push('/');
      router.refresh();
    } catch (err: any) {
      console.error('[login] signInWithPassword error:', err);
      setError(err?.message || 'Sign in failed. Please try again.');
      setLoading(false);
    }
  };

  // ── Email + Password Register ────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setMessage('Check your email for a confirmation link!');
      setLoading(false);
    } catch (err: any) {
      console.error('[login] signUp error:', err);
      setError(err?.message || 'Registration failed. Please try again.');
      setLoading(false);
    }
  };

  // ── Magic Link ───────────────────────────────────────
  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setMessage('Magic link sent! Check your email.');
      setLoading(false);
    } catch (err: any) {
      console.error('[login] signInWithOtp error:', err);
      setError(err?.message || 'Failed to send magic link. Please try again.');
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100 px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 shadow-lg shadow-blue-200">
          <span className="text-4xl">🏥</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800">Pharma Voice</h1>
        <p className="mt-1 text-sm text-slate-500">AI Assistant for Pharmaceutical Interns</p>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl shadow-blue-100/50">
        {/* Mode Tabs */}
        <div className="mb-6 flex rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => { setMode('login'); setError(null); setMessage(null); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              mode === 'login'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setMode('register'); setError(null); setMessage(null); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              mode === 'register'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Register
          </button>
          <button
            onClick={() => { setMode('magic-link'); setError(null); setMessage(null); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              mode === 'magic-link'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Magic Link
          </button>
        </div>

        {/* Error / Success Messages */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}
        {message && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-600">
            {message}
          </div>
        )}

        {/* ─── Sign In Form ──────────────────────── */}
        {mode === 'login' && (
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-200 transition-all hover:from-primary-600 hover:to-primary-700 disabled:opacity-50"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* ─── Register Form ─────────────────────── */}
        {mode === 'register' && (
          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-slate-700">
                Full Name
              </label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyen Van A"
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <div>
              <label htmlFor="regEmail" className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="regEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <div>
              <label htmlFor="regPassword" className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="regPassword"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-200 transition-all hover:from-primary-600 hover:to-primary-700 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>
        )}

        {/* ─── Magic Link Form ───────────────────── */}
        {mode === 'magic-link' && (
          <form onSubmit={handleMagicLink} className="space-y-4">
            <p className="text-sm text-slate-500">
              We&apos;ll send a login link to your email — no password needed.
            </p>
            <div>
              <label htmlFor="mlEmail" className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="mlEmail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-200 transition-all hover:from-primary-600 hover:to-primary-700 disabled:opacity-50"
            >
              {loading ? 'Sending link...' : 'Send Magic Link'}
            </button>
          </form>
        )}
      </div>

      {/* Footer */}
      <p className="mt-6 text-xs text-slate-400">
        Pharma Voice Assistant v0.4 — Phase 4
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-100">
          <div className="text-primary-600">Loading...</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
