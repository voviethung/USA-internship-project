'use client';

import { useEffect, useState, useCallback } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import { SkeletonProfile } from '@/components/Skeleton';
import { useRouter } from 'next/navigation';
import type { Profile } from '@/lib/types';

export default function ProfilePage() {
  const { user, role, signOut } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fullName, setFullName] = useState('');
  const [preferredProvider, setPreferredProvider] = useState('groq');
  const [message, setMessage] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, thisWeek: 0 });

  // ── Fetch profile + stats ────────────────────────────
  const fetchProfile = useCallback(async () => {
    if (!user) return;

    const supabase = createSupabaseBrowser();

    // Fetch profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileData) {
      setProfile(profileData);
      setFullName(profileData.full_name || '');
      setPreferredProvider(profileData.preferred_provider || 'groq');
    }

    // Fetch conversation stats
    const { count: totalCount } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const { count: weekCount } = await supabase
      .from('conversations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', weekAgo.toISOString());

    setStats({
      total: totalCount || 0,
      thisWeek: weekCount || 0,
    });

    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // ── Save profile ─────────────────────────────────────
  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    setMessage(null);

    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        full_name: fullName.trim() || null,
        preferred_provider: preferredProvider,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      setMessage('Failed to save: ' + error.message);
      showToast('Failed to save profile', 'error');
    } else {
      setMessage('Profile updated successfully!');
      showToast('Profile updated!', 'success');
    }
    setSaving(false);

    // Auto-clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000);
  };

  // ── Sign out ─────────────────────────────────────────
  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
    router.refresh();
  };

  if (loading) {
    return (
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-blue-50">
        <header className="safe-top bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <h1 className="text-lg font-bold">Profile</h1>
              <p className="text-[10px] uppercase tracking-wider text-blue-200">Loading...</p>
            </div>
            <span className="text-2xl">👤</span>
          </div>
        </header>
        <SkeletonProfile />
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-blue-50">
      {/* Header */}
      <header className="safe-top bg-gradient-to-r from-primary-600 to-primary-700 text-white shadow-lg">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-bold">Profile</h1>
            <p className="text-[10px] uppercase tracking-wider text-blue-200">
              Settings & Preferences
            </p>
          </div>
          <span className="text-2xl">👤</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-20 space-y-4">
        {/* ── User Info Card ────────────────────────── */}
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-2xl text-white shadow-md">
              {fullName ? fullName.charAt(0).toUpperCase() : '👤'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-slate-800">
                  {fullName || 'Unnamed User'}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  role === 'admin' ? 'bg-red-100 text-red-700' :
                  role === 'mentor' ? 'bg-blue-100 text-blue-700' :
                  'bg-green-100 text-green-700'
                }`}>
                  {role.charAt(0).toUpperCase() + role.slice(1)}
                </span>
              </div>
              <p className="text-sm text-slate-500">{user?.email}</p>
            </div>
          </div>
        </div>

        {/* ── Stats ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white p-4 text-center shadow-sm border border-slate-100">
            <p className="text-2xl font-bold text-primary-600">{stats.total}</p>
            <p className="text-xs text-slate-500">Total Conversations</p>
          </div>
          <div className="rounded-xl bg-white p-4 text-center shadow-sm border border-slate-100">
            <p className="text-2xl font-bold text-primary-600">{stats.thisWeek}</p>
            <p className="text-xs text-slate-500">This Week</p>
          </div>
        </div>

        {/* ── Edit Profile ──────────────────────────── */}
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100 space-y-4">
          <h2 className="font-semibold text-slate-700">Edit Profile</h2>

          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-slate-600">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your name"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-600">
              AI Provider
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setPreferredProvider('groq')}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                  preferredProvider === 'groq'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'
                }`}
              >
                ⚡ Groq
                <span className="block text-[10px] font-normal text-slate-400">
                  Fast & Free
                </span>
              </button>
              <button
                onClick={() => setPreferredProvider('openai')}
                className={`flex-1 rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${
                  preferredProvider === 'openai'
                    ? 'border-primary-500 bg-primary-50 text-primary-700'
                    : 'border-slate-300 text-slate-600 hover:border-slate-400'
                }`}
              >
                🤖 OpenAI
                <span className="block text-[10px] font-normal text-slate-400">
                  GPT-4o mini
                </span>
              </button>
            </div>
          </div>

          {/* Success/Error Message */}
          {message && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                message.startsWith('Failed')
                  ? 'bg-red-50 border border-red-200 text-red-600'
                  : 'bg-green-50 border border-green-200 text-green-600'
              }`}
            >
              {message}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-200 transition-all hover:from-primary-600 hover:to-primary-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        {/* ── About ─────────────────────────────────── */}
        <div className="rounded-xl bg-white p-4 shadow-sm border border-slate-100">
          <h2 className="font-semibold text-slate-700">About</h2>
          <div className="mt-2 space-y-1 text-sm text-slate-500">
            <p>Pharma Voice Assistant v0.4</p>
            <p>Phase 4 — Internship Management</p>
            <p className="text-xs text-slate-400">
              Built with Next.js, Supabase, and{' '}
              {preferredProvider === 'groq' ? 'Groq' : 'OpenAI'}
            </p>
          </div>
        </div>

        {/* ── Sign Out ──────────────────────────────── */}
        <button
          onClick={handleSignOut}
          className="w-full rounded-xl border border-red-200 bg-white py-3 text-sm font-semibold text-red-500 shadow-sm transition-colors hover:bg-red-50"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
