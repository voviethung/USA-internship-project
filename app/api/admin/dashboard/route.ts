import { NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import type { UserRole } from '@/lib/types';

function canViewDashboard(role: UserRole) {
  return role === 'admin' || role === 'mentor';
}

export async function GET() {
  try {
    const supabaseServer = createSupabaseServer();
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const adminDb = createSupabaseAdmin();
    const { data: profile } = await adminDb
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    const role = (profile?.role ?? 'student') as UserRole;
    if (!canViewDashboard(role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const [students, mentors, resources, tasks, pendingT, completedT, convos] =
      await Promise.all([
        adminDb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        adminDb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'mentor'),
        adminDb.from('resources').select('id', { count: 'exact', head: true }),
        adminDb.from('tasks').select('id', { count: 'exact', head: true }),
        adminDb.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        adminDb.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
        adminDb.from('conversations').select('id', { count: 'exact', head: true }),
      ]);

    const errors = [
      students.error,
      mentors.error,
      resources.error,
      tasks.error,
      pendingT.error,
      completedT.error,
      convos.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: errors.map((e) => e?.message).join(' | '),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        totalStudents: students.count ?? 0,
        totalMentors: mentors.count ?? 0,
        totalResources: resources.count ?? 0,
        totalTasks: tasks.count ?? 0,
        pendingTasks: pendingT.count ?? 0,
        completedTasks: completedT.count ?? 0,
        totalConversations: convos.count ?? 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
