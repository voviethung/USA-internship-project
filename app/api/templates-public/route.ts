import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { TemplateLine, TemplateSection } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type SectionRow = Omit<TemplateSection, 'lines'>;

type LineRow = TemplateLine;

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase server env is not configured.' },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: sectionsData, error: sectionsError } = await supabase
      .from('template_sections')
      .select('id, template_id, week_no, track_no, title, section_type, sort_order, notes')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (sectionsError) {
      return NextResponse.json(
        { success: false, error: sectionsError.message },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const sectionIds = (sectionsData ?? []).map((s) => s.id as string);

    const { data: linesData, error: linesError } = sectionIds.length
      ? await supabase
          .from('template_lines')
          .select('id, section_id, line_no, role_label, line_kind, language_code, text_content')
          .in('section_id', sectionIds)
          .eq('is_active', true)
          .order('line_no', { ascending: true })
          .order('language_code', { ascending: true })
      : { data: [], error: null };

    if (linesError) {
      return NextResponse.json(
        { success: false, error: linesError.message },
        { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
      );
    }

    const linesBySection = new Map<string, LineRow[]>();
    for (const line of (linesData ?? []) as LineRow[]) {
      const bucket = linesBySection.get(line.section_id) ?? [];
      bucket.push(line);
      linesBySection.set(line.section_id, bucket);
    }

    const sections = ((sectionsData ?? []) as SectionRow[]).map((section) => ({
      ...section,
      lines: linesBySection.get(section.id) ?? [],
    }));

    return NextResponse.json(
      { success: true, data: sections },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }
}
