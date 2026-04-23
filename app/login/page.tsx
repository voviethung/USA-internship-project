'use client';

import { Suspense, useState } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase';
import { useRouter, useSearchParams } from 'next/navigation';

type AuthMode = 'login' | 'register';
type RegisterStep = 'request' | 'verify';

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

async function signOutEverywhere() {
  const supabase = createSupabaseBrowser();
  await supabase.auth.signOut();
  await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {
    // Middleware will clear profile cache cookies on the next navigation if needed.
  });
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<AuthMode>('login');
  const [registerStep, setRegisterStep] = useState<RegisterStep>('request');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() => {
    if (searchParams.get('pending')) return 'Tài khoản đang chờ admin phê duyệt.';
    if (searchParams.get('rejected')) return 'Tài khoản đã bị từ chối. Vui lòng liên hệ admin.';
    if (searchParams.get('error')) return 'Authentication failed. Please try again.';
    return null;
  });

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
        setError(error.message);
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Login failed. Please try again.');
        setLoading(false);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('approval_status, role')
        .eq('id', user.id)
        .single();

      if (profileError || !profile) {
        await signOutEverywhere();
        setError('Không tìm thấy hồ sơ người dùng. Vui lòng đăng ký lại hoặc liên hệ admin.');
        setLoading(false);
        return;
      }

      if (profile.approval_status !== 'approved') {
        await signOutEverywhere();
        if (profile.approval_status === 'rejected') {
          setError('Tài khoản đã bị từ chối. Vui lòng liên hệ admin.');
        } else {
          setError('Tài khoản đang chờ admin phê duyệt.');
        }
        setLoading(false);
        return;
      }

      router.push(profile.role === 'student' ? '/resources' : '/');
      router.refresh();
    } catch (err: unknown) {
      console.error('[login] signInWithPassword error:', err);
      setError(getErrorMessage(err, 'Sign in failed. Please try again.'));
      setLoading(false);
    }
  };

  // ── Register Request (sends OTP code) ─────────────────
  const handleRegisterRequest = async (e: React.FormEvent) => {
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
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      setRegisterStep('verify');
      setMessage('Mã xác nhận đã được gửi tới email. Vui lòng nhập mã để hoàn tất đăng ký.');
      setLoading(false);
    } catch (err: unknown) {
      console.error('[login] signUp error:', err);
      setError(getErrorMessage(err, 'Registration failed. Please try again.'));
      setLoading(false);
    }
  };

  // ── Register Verify (OTP code) ────────────────────────
  const handleVerifyRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otpCode,
        type: 'signup',
      });

      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { error: profileError } = await supabase.from('profiles').upsert(
          {
            id: user.id,
            full_name: fullName || null,
            email,
            role: 'student',
            approval_status: 'pending',
          },
          { onConflict: 'id' },
        );

        if (profileError) {
          console.error('[login] profile upsert error:', profileError.message);
        }
      }

      await signOutEverywhere();
      setMode('login');
      setRegisterStep('request');
      setOtpCode('');
      setPassword('');
      setMessage('Đăng ký thành công. Tài khoản đang chờ admin phê duyệt trước khi đăng nhập.');
      setLoading(false);
    } catch (err: unknown) {
      console.error('[login] verifyOtp error:', err);
      setError(getErrorMessage(err, 'Xác nhận mã thất bại. Vui lòng thử lại.'));
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
            onClick={() => {
              setMode('login');
              setError(null);
              setMessage(null);
              setRegisterStep('request');
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              mode === 'login'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setMode('register');
              setError(null);
              setMessage(null);
              setRegisterStep('request');
            }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              mode === 'register'
                ? 'bg-white text-primary-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Register
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
          <form onSubmit={registerStep === 'request' ? handleRegisterRequest : handleVerifyRegister} className="space-y-4">
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
                disabled={registerStep === 'verify'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            {registerStep === 'request' ? (
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
            ) : (
              <div>
                <label htmlFor="otpCode" className="mb-1 block text-sm font-medium text-slate-700">
                  Verification Code
                </label>
                <input
                  id="otpCode"
                  type="text"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  placeholder="Nhập mã từ email"
                  required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                />
              </div>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-200 transition-all hover:from-primary-600 hover:to-primary-700 disabled:opacity-50"
            >
              {loading
                ? registerStep === 'request'
                  ? 'Creating account...'
                  : 'Verifying code...'
                : registerStep === 'request'
                  ? 'Create Account'
                  : 'Verify Code'}
            </button>
            {registerStep === 'verify' && (
              <button
                type="button"
                onClick={() => {
                  setRegisterStep('request');
                  setOtpCode('');
                  setError(null);
                  setMessage(null);
                }}
                className="w-full rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Back
              </button>
            )}
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
