import { createSupabaseServer } from '@/lib/supabase-server';
import type { NotificationType } from '@/lib/types';

/** Create a notification for a user (server-side) */
export async function createNotification({
  userId,
  title,
  message,
  type = 'info',
  link,
}: {
  userId: string;
  title: string;
  message: string;
  type?: NotificationType;
  link?: string;
}) {
  const supabase = createSupabaseServer();
  await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type,
    link,
  });
}

/** Create notifications for multiple users */
export async function notifyMany(
  userIds: string[],
  payload: { title: string; message: string; type?: NotificationType; link?: string },
) {
  const supabase = createSupabaseServer();
  const rows = userIds.map((uid) => ({
    user_id: uid,
    title: payload.title,
    message: payload.message,
    type: payload.type || 'info',
    link: payload.link,
  }));
  await supabase.from('notifications').insert(rows);
}
