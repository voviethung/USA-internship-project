import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServer } from '@/lib/supabase-server';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import type { ResourceType, UserRole } from '@/lib/types';

function canManageResources(role: UserRole) {
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

    const { data, error } = await auth.adminDb
      .from('resources')
      .select('*, creator:profiles!resources_created_by_fkey(id, full_name), editor:profiles!resources_updated_by_fkey(id, full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getRequesterRole();
    if ('error' in auth) return auth.error;
    if (!canManageResources(auth.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const payload = {
      title: body?.title?.toString() ?? '',
      description: body?.description?.toString() || null,
      resource_type: (body?.resource_type?.toString() as ResourceType) ?? 'document',
      file_url: body?.file_url?.toString() ?? '',
      file_name: body?.file_name?.toString() || null,
      file_type: body?.file_type?.toString() || null,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    };

    if (!payload.title.trim() || !payload.file_url.trim()) {
      return NextResponse.json({ success: false, error: 'title and file_url are required' }, { status: 400 });
    }

    const { error } = await auth.adminDb.from('resources').insert(payload);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getRequesterRole();
    if ('error' in auth) return auth.error;
    if (!canManageResources(auth.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const resourceId = body?.id?.toString() ?? '';
    if (!resourceId) {
      return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    }

    const { error } = await auth.adminDb
      .from('resources')
      .update({
        title: body?.title?.toString() ?? '',
        description: body?.description?.toString() || null,
        resource_type: (body?.resource_type?.toString() as ResourceType) ?? 'document',
        file_url: body?.file_url?.toString() ?? '',
        file_name: body?.file_name?.toString() || null,
        file_type: body?.file_type?.toString() || null,
        updated_by: auth.user.id,
      })
      .eq('id', resourceId);

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
    if (!canManageResources(auth.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id') ?? '';
    if (!id) {
      return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    }

    const { error } = await auth.adminDb.from('resources').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
