import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import type { UserRole } from '@/lib/types';

function canManageStudents(role: UserRole) {
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
    if (!canManageStudents(auth.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const [studentsRes, mentorsRes, assignRes] = await Promise.all([
      auth.adminDb.from('profiles').select('*').eq('role', 'student').order('full_name'),
      auth.adminDb.from('profiles').select('id, full_name, role').eq('role', 'mentor').order('full_name'),
      auth.adminDb.from('mentor_students').select('mentor_id, student_id'),
    ]);

    const errors = [studentsRes.error, mentorsRes.error, assignRes.error].filter(Boolean);
    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, error: errors.map((e) => e?.message).join(' | ') },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        students: studentsRes.data ?? [],
        mentors: mentorsRes.data ?? [],
        assignments: assignRes.data ?? [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getRequesterRole();
    if ('error' in auth) return auth.error;
    if (!canManageStudents(auth.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const studentId = body?.studentId?.toString() ?? '';

    if (!studentId) {
      return NextResponse.json({ success: false, error: 'studentId required' }, { status: 400 });
    }

    const { error } = await auth.adminDb
      .from('profiles')
      .update({
        full_name: body?.full_name?.toString() ?? null,
        phone: body?.phone?.toString() || null,
        department: body?.department?.toString() || null,
      })
      .eq('id', studentId)
      .eq('role', 'student');

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await getRequesterRole();
    if ('error' in auth) return auth.error;
    if (!canManageStudents(auth.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const studentId = body?.studentId?.toString() ?? '';
    const mentorId = body?.mentorId?.toString() ?? '';

    if (!studentId) {
      return NextResponse.json({ success: false, error: 'studentId required' }, { status: 400 });
    }

    const { error: deleteError } = await auth.adminDb
      .from('mentor_students')
      .delete()
      .eq('student_id', studentId);

    if (deleteError) {
      return NextResponse.json({ success: false, error: deleteError.message }, { status: 500 });
    }

    if (mentorId) {
      const { error: insertError } = await auth.adminDb
        .from('mentor_students')
        .insert({
          mentor_id: mentorId,
          student_id: studentId,
        });

      if (insertError) {
        return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
