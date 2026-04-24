import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import type { UserRole } from '@/lib/types';

function canViewMentors(role: UserRole) {
  return role === 'admin' || role === 'mentor';
}

async function getRequesterRole() {
  const supabaseServer = createSupabaseServer();
  const {
    data: { user },
  } = await supabaseServer.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) };
  }

  const adminDb = createSupabaseAdmin();
  const { data: profile } = await adminDb
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  return {
    user,
    role: (profile?.role ?? 'student') as UserRole,
    adminDb,
  };
}

export async function GET() {
  try {
    const auth = await getRequesterRole();
    if ('error' in auth) return auth.error;
    if (!canViewMentors(auth.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const [mentorsRes, assignsRes, studentsRes] = await Promise.all([
      auth.adminDb.from('profiles').select('*').eq('role', 'mentor').order('full_name'),
      auth.adminDb.from('mentor_students').select('mentor_id, student_id'),
      auth.adminDb.from('profiles').select('id, full_name, email, department').eq('role', 'student'),
    ]);

    const errors = [mentorsRes.error, assignsRes.error, studentsRes.error].filter(Boolean);
    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors.map((e) => e?.message).join(' | ') },
        { status: 500 },
      );
    }

    const studentsById = new Map((studentsRes.data ?? []).map((s) => [s.id, s]));
    const assignments = (assignsRes.data ?? []) as { mentor_id: string; student_id: string }[];

    const mentors = (mentorsRes.data ?? []).map((mentor) => {
      const studentRows = assignments
        .filter((a) => a.mentor_id === mentor.id)
        .map((a) => studentsById.get(a.student_id))
        .filter(Boolean);

      return {
        ...mentor,
        studentCount: studentRows.length,
        students: studentRows,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        mentors,
        allStudents: auth.role === 'admin' ? studentsRes.data ?? [] : [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getRequesterRole();
    if ('error' in auth) return auth.error;
    if (auth.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const userId = body?.userId?.toString() ?? '';
    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId required' }, { status: 400 });
    }

    const { error } = await auth.adminDb
      .from('profiles')
      .update({ role: 'mentor' })
      .eq('id', userId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await getRequesterRole();
    if ('error' in auth) return auth.error;
    if (auth.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const mentorId = searchParams.get('mentorId') ?? '';

    if (!mentorId) {
      return NextResponse.json({ success: false, error: 'mentorId required' }, { status: 400 });
    }

    const { error: deleteError } = await auth.adminDb
      .from('mentor_students')
      .delete()
      .eq('mentor_id', mentorId);

    if (deleteError) {
      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
    }

    const { error: updateError } = await auth.adminDb
      .from('profiles')
      .update({ role: 'student' })
      .eq('id', mentorId);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
