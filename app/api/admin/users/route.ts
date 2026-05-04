import { createSupabaseServer } from '@/lib/supabase-server';
import { NextResponse } from 'next/server';

/** GET /api/admin/users — List all users (admin only) */
export async function GET() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

/** PATCH /api/admin/users — Update user role (admin only) */
export async function PATCH(request: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { userId, role, approval_status, rejected_note, full_name, department, phone } = body;

  if (!userId) {
    return NextResponse.json({ error: 'userId required' }, { status: 400 });
  }

  const updates: Record<string, string | null> = {};

  if (role && !['admin', 'mentor', 'student'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }
  if (approval_status && !['pending', 'approved', 'rejected'].includes(approval_status)) {
    return NextResponse.json({ error: 'Invalid approval_status' }, { status: 400 });
  }

  if (role) updates.role = role;
  if (approval_status) {
    updates.approval_status = approval_status;
    if (approval_status === 'approved') {
      updates.approved_at = new Date().toISOString();
      updates.approved_by = user.id;
      updates.rejected_note = null;
    }
    if (approval_status === 'rejected') {
      updates.rejected_note = rejected_note || null;
    }
  }
  if (full_name !== undefined) updates.full_name = full_name;
  if (department !== undefined) updates.department = department;
  if (phone !== undefined) updates.phone = phone;

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
