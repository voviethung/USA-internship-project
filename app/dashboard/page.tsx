'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useRouter } from 'next/navigation';
import { ROLE_LABELS, ROLE_COLORS } from '@/lib/roles';

interface DashboardStats {
  totalStudents: number;
  totalMentors: number;
  totalResources: number;
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  totalConversations: number;
}

export default function DashboardPage() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AUTH TEMPORARILY DISABLED — no redirect for guests
  // useEffect(() => {
  //   if (!loading && (!user || role === 'student')) {
  //     router.push('/');
  //   }
  // }, [user, role, loading, router]);

  useEffect(() => {
    if (!user || role === 'student') {
      setStats(null);
      setLoadingStats(false);
      return;
    }

    setLoadingStats(true);
    setError(null);

    const fetchStats = async () => {
      try {
        const response = await fetch('/api/admin/dashboard', { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok || !payload.success) {
          throw new Error(payload.error || 'Failed to load statistics');
        }

        setStats(payload.data as DashboardStats);
      } catch (err) {
        console.error('[dashboard] fetchStats error:', err);
        setError('Failed to load statistics');
        setStats({
          totalStudents: 0, totalMentors: 0, totalResources: 0,
          totalTasks: 0, pendingTasks: 0, completedTasks: 0, totalConversations: 0,
        });
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, [user, role]);

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="text-primary-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 text-center">
        <span className="mb-3 text-5xl">🔒</span>
        <h2 className="text-lg font-semibold text-slate-600">Login Required</h2>
        <p className="mt-1 text-sm text-slate-400">Please log in to access the dashboard.</p>
        <a href="/login" className="mt-4 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-primary-600 hover:to-primary-700">Go to Login</a>
      </div>
    );
  }

  const cards = stats
    ? [
        { label: 'Students', value: stats.totalStudents, icon: '🎓', color: 'bg-blue-50 border-blue-200' },
        { label: 'Mentors', value: stats.totalMentors, icon: '👨‍🏫', color: 'bg-purple-50 border-purple-200' },
        { label: 'Resources', value: stats.totalResources, icon: '📚', color: 'bg-green-50 border-green-200' },
        { label: 'Total Tasks', value: stats.totalTasks, icon: '📝', color: 'bg-orange-50 border-orange-200' },
        { label: 'Pending', value: stats.pendingTasks, icon: '⏳', color: 'bg-yellow-50 border-yellow-200' },
        { label: 'Completed', value: stats.completedTasks, icon: '✅', color: 'bg-emerald-50 border-emerald-200' },
        { label: 'Voice Q&A', value: stats.totalConversations, icon: '🎤', color: 'bg-pink-50 border-pink-200' },
      ]
    : [];

  return (
    <div className="min-h-[100dvh] pb-20 pt-4 animate-fade-in">
      <div className="mx-auto max-w-lg px-4">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-800">📊 Dashboard</h1>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role]}`}>
              {ROLE_LABELS[role]}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Overview of the internship program
          </p>
        </div>

        {/* Stats Grid */}
        {loadingStats ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 stagger-children">
            {cards.map((card) => (
              <div
                key={card.label}
                className={`rounded-xl border p-4 ${card.color} transition-transform active:scale-95`}
              >
                <div className="text-2xl">{card.icon}</div>
                <div className="mt-2 text-2xl font-bold text-slate-800">{card.value}</div>
                <div className="text-xs text-slate-500">{card.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            ⚠️ {error} — data may be incomplete. Check browser console for details.
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-slate-600">Quick Actions</h2>
          <div className="flex flex-col gap-2">
            {role === 'admin' && (
              <button
                onClick={() => router.push('/mentors')}
                className="flex items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm border border-slate-100 transition-colors hover:bg-slate-50"
              >
                <span className="text-xl">👨‍🏫</span>
                <div>
                  <div className="text-sm font-medium text-slate-700">Manage Mentors</div>
                  <div className="text-xs text-slate-400">Add, edit, assign mentors</div>
                </div>
              </button>
            )}
            <button
              onClick={() => router.push('/students')}
              className="flex items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm border border-slate-100 transition-colors hover:bg-slate-50"
            >
              <span className="text-xl">🎓</span>
              <div>
                <div className="text-sm font-medium text-slate-700">Manage Students</div>
                <div className="text-xs text-slate-400">View and manage student list</div>
              </div>
            </button>
            <button
              onClick={() => router.push('/resources')}
              className="flex items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm border border-slate-100 transition-colors hover:bg-slate-50"
            >
              <span className="text-xl">📚</span>
              <div>
                <div className="text-sm font-medium text-slate-700">Manage Resources</div>
                <div className="text-xs text-slate-400">Lectures, documents, and images</div>
              </div>
            </button>
            <button
              onClick={() => router.push('/tasks')}
              className="flex items-center gap-3 rounded-xl bg-white p-3 text-left shadow-sm border border-slate-100 transition-colors hover:bg-slate-50"
            >
              <span className="text-xl">✅</span>
              <div>
                <div className="text-sm font-medium text-slate-700">Assign Tasks</div>
                <div className="text-xs text-slate-400">Create and assign tasks to students</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
