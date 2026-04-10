'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createSupabaseBrowser } from '@/lib/supabase';
import type { Notification } from '@/lib/types';

const TYPE_ICONS: Record<string, string> = {
  info: 'ℹ️',
  task: '✅',
  lecture: '📚',
  mentor: '👨‍🏫',
  system: '⚙️',
};

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const fetchNotifications = async () => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
    setLoadingData(false);
  };

  useEffect(() => {
    if (user) fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const markRead = async (id: string) => {
    const supabase = createSupabaseBrowser();
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
  };

  const markAllRead = async () => {
    const supabase = createSupabaseBrowser();
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user!.id)
      .eq('is_read', false);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const filtered =
    filter === 'unread'
      ? notifications.filter((n) => !n.is_read)
      : notifications;

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  if (loading || !user) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><div className="text-primary-600">Loading...</div></div>;
  }

  return (
    <div className="min-h-[100dvh] pb-20 pt-4 animate-fade-in">
      <div className="mx-auto max-w-lg px-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">🔔 Notifications</h1>
            <p className="text-sm text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="rounded-lg bg-primary-100 px-3 py-2 text-xs font-medium text-primary-700 hover:bg-primary-200"
            >
              Mark all read
            </button>
          )}
        </div>

        {/* Filter */}
        <div className="mb-4 flex rounded-lg bg-slate-100 p-1">
          <button
            onClick={() => setFilter('all')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              filter === 'all' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500'
            }`}
          >
            All ({notifications.length})
          </button>
          <button
            onClick={() => setFilter('unread')}
            className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${
              filter === 'unread' ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500'
            }`}
          >
            Unread ({unreadCount})
          </button>
        </div>

        {/* Notifications List */}
        {loadingData ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </div>
        ) : (
          <div className="space-y-2 stagger-children">
            {filtered.map((notif) => (
              <div
                key={notif.id}
                onClick={() => !notif.is_read && markRead(notif.id)}
                className={`rounded-xl border p-3.5 transition-colors cursor-pointer ${
                  notif.is_read
                    ? 'border-slate-100 bg-white'
                    : 'border-primary-200 bg-primary-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg">{TYPE_ICONS[notif.type] || 'ℹ️'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-medium ${notif.is_read ? 'text-slate-600' : 'text-slate-800'}`}>
                        {notif.title}
                      </span>
                      {!notif.is_read && (
                        <span className="h-2 w-2 rounded-full bg-primary-500 flex-shrink-0" />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 line-clamp-2">{notif.message}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      {new Date(notif.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
