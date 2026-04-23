'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useToast } from '@/components/Toast';
import type { ApprovalStatus, Profile, UserRole } from '@/lib/types';

type AdminUser = Pick<
  Profile,
  | 'id'
  | 'full_name'
  | 'email'
  | 'role'
  | 'approval_status'
  | 'created_at'
  | 'approved_at'
  | 'rejected_note'
>;

export default function AdminPage() {
  const { user, role, loading } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | 'all'>('pending');

  const fetchUsers = async () => {
    setLoadingData(true);
    const res = await fetch('/api/admin/users', { cache: 'no-store' });
    const payload = await res.json();

    if (!res.ok) {
      showToast(payload?.error || 'Failed to fetch users', 'error');
      setLoadingData(false);
      return;
    }

    setUsers(payload.data || []);
    setLoadingData(false);
  };

  useEffect(() => {
    if (user && role === 'admin') {
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  const handleUpdate = async (
    userId: string,
    update: Partial<{ role: UserRole; approval_status: ApprovalStatus; rejected_note: string }>,
  ) => {
    setSavingId(userId);
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, ...update }),
    });
    const payload = await res.json();

    if (!res.ok) {
      showToast(payload?.error || 'Update failed', 'error');
      setSavingId(null);
      return;
    }

    showToast('User updated', 'success');
    setSavingId(null);
    fetchUsers();
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (statusFilter !== 'all' && u.approval_status !== statusFilter) return false;
      if (!search.trim()) return true;
      const keyword = search.toLowerCase();
      return (
        (u.full_name || '').toLowerCase().includes(keyword) ||
        (u.email || '').toLowerCase().includes(keyword)
      );
    });
  }, [users, search, statusFilter]);

  if (loading) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><div className="text-primary-600">Loading...</div></div>;
  }

  if (!user || role !== 'admin') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 text-center">
        <span className="mb-3 text-5xl">⛔</span>
        <h2 className="text-lg font-semibold text-slate-600">Admin Only</h2>
        <p className="mt-1 text-sm text-slate-400">You do not have permission to access this page.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-20 pt-4 animate-fade-in">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">🛡️ Admin Approval</h1>
            <p className="text-sm text-slate-500">Approve registrations and manage user roles</p>
          </div>
          <button
            onClick={fetchUsers}
            className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white hover:bg-primary-600"
          >
            Refresh
          </button>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name/email"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ApprovalStatus | 'all')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
          >
            <option value="all">All status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            Total: {filteredUsers.length}
          </div>
        </div>

        {loadingData ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
            No users found
          </div>
        ) : (
          <div className="space-y-3">
            {filteredUsers.map((u) => {
              const isSaving = savingId === u.id;
              return (
                <div key={u.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{u.full_name || 'Unnamed user'}</p>
                      <p className="text-xs text-slate-500">{u.email || 'No email'}</p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                        u.approval_status === 'approved'
                          ? 'bg-green-100 text-green-700'
                          : u.approval_status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {u.approval_status}
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={u.role}
                      disabled={isSaving}
                      onChange={(e) => handleUpdate(u.id, { role: e.target.value as UserRole })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
                    >
                      <option value="student">student</option>
                      <option value="mentor">mentor</option>
                      <option value="admin">admin</option>
                    </select>
                    <select
                      value={u.approval_status}
                      disabled={isSaving}
                      onChange={(e) => handleUpdate(u.id, { approval_status: e.target.value as ApprovalStatus })}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
                    >
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                    </select>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={isSaving}
                      onClick={() => handleUpdate(u.id, { approval_status: 'approved' })}
                      className="rounded-lg bg-green-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-600 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      disabled={isSaving}
                      onClick={() => handleUpdate(u.id, { approval_status: 'rejected' })}
                      className="rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
