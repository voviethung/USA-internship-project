'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createSupabaseBrowser } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Lecture } from '@/lib/types';

export default function LecturesPage() {
  const { user, role, loading } = useAuth();
  const { showToast } = useToast();

  const [lectures, setLectures] = useState<Lecture[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: '',
    description: '',
    content: '',
    category: 'general',
    is_published: false,
    file_url: '',
    file_name: '',
  });
  const [search, setSearch] = useState('');

  const canCreate = role === 'admin' || role === 'mentor';

  const fetchLectures = async () => {
    const supabase = createSupabaseBrowser();
    const query = supabase
      .from('lectures')
      .select('*, creator:profiles!lectures_created_by_fkey(id, full_name)')
      .order('created_at', { ascending: false });

    const { data } = await query;
    setLectures((data as any) || []);
    setLoadingData(false);
  };

  useEffect(() => {
    if (user) fetchLectures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      showToast('Title is required', 'error');
      return;
    }

    const supabase = createSupabaseBrowser();

    if (editId) {
      const { error } = await supabase
        .from('lectures')
        .update({
          title: form.title,
          description: form.description || null,
          content: form.content || null,
          category: form.category,
          is_published: form.is_published,
          file_url: form.file_url || null,
          file_name: form.file_name || null,
        })
        .eq('id', editId);
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Lecture updated', 'success');
    } else {
      const { error } = await supabase.from('lectures').insert({
        title: form.title,
        description: form.description || null,
        content: form.content || null,
        category: form.category,
        is_published: form.is_published,
        created_by: user!.id,
        file_url: form.file_url || null,
        file_name: form.file_name || null,
      });
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Lecture created', 'success');
    }

    setShowForm(false);
    setEditId(null);
    setForm({ title: '', description: '', content: '', category: 'general', is_published: false, file_url: '', file_name: '' });
    fetchLectures();
  };

  const handleEdit = (l: Lecture) => {
    setForm({
      title: l.title,
      description: l.description || '',
      content: l.content || '',
      category: l.category,
      is_published: l.is_published,
      file_url: l.file_url || '',
      file_name: l.file_name || '',
    });
    setEditId(l.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lecture?')) return;
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from('lectures').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Lecture deleted', 'success');
    fetchLectures();
  };

  const handlePublishToggle = async (id: string, current: boolean) => {
    const supabase = createSupabaseBrowser();
    await supabase.from('lectures').update({ is_published: !current }).eq('id', id);
    fetchLectures();
    showToast(current ? 'Lecture unpublished' : 'Lecture published', 'success');
  };

  const categories = ['general', 'GMP', 'QA', 'QC', 'R&D', 'RA', 'safety'];

  const filtered = lectures.filter(
    (l) =>
      !search ||
      l.title.toLowerCase().includes(search.toLowerCase()) ||
      l.category.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><div className="text-primary-600">Loading...</div></div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 text-center">
        <span className="mb-3 text-5xl">🔒</span>
        <h2 className="text-lg font-semibold text-slate-600">Login Required</h2>
        <p className="mt-1 text-sm text-slate-400">Please log in to view lectures.</p>
        <a href="/login" className="mt-4 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-primary-600 hover:to-primary-700">Go to Login</a>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] pb-20 pt-4 animate-fade-in">
      <div className="mx-auto max-w-lg px-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">📚 Lectures</h1>
            <p className="text-sm text-slate-500">{lectures.length} lectures</p>
          </div>
          {canCreate && (
            <button
              onClick={() => {
                setShowForm(!showForm);
                setEditId(null);
                setForm({ title: '', description: '', content: '', category: 'general', is_published: false, file_url: '', file_name: '' });
              }}
              className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white hover:bg-primary-600"
            >
              + Create
            </button>
          )}
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search lectures..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
        />

        {/* Create/Edit Form */}
        {showForm && canCreate && (
          <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50 p-4 animate-scale-in">
            <h3 className="mb-3 font-semibold text-slate-700">{editId ? 'Edit Lecture' : 'New Lecture'}</h3>
            <div className="space-y-3">
              <input
                placeholder="Title *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <input
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <textarea
                placeholder="Content (markdown supported)"
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                rows={5}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400 resize-none"
              />
              <div className="flex gap-2">
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                    className="h-4 w-4 rounded"
                  />
                  Published
                </label>
              </div>
              <input
                placeholder="File URL (optional)"
                value={form.file_url}
                onChange={(e) => setForm({ ...form, file_url: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handleSave} className="flex-1 rounded-lg bg-primary-500 py-2 text-sm font-medium text-white hover:bg-primary-600">
                {editId ? 'Update' : 'Create'}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null); }} className="flex-1 rounded-lg bg-slate-200 py-2 text-sm font-medium text-slate-600">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Lecture List */}
        {loadingData ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
            No lectures found
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {filtered.map((lecture) => (
              <div key={lecture.id} className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div
                  className="p-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === lecture.id ? null : lecture.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-800">{lecture.title}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                          lecture.is_published ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {lecture.is_published ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        📂 {lecture.category} · {(lecture.creator as any)?.full_name || 'Unknown'}
                      </p>
                      {lecture.description && (
                        <p className="mt-1 text-xs text-slate-400 line-clamp-2">{lecture.description}</p>
                      )}
                    </div>
                    <span className="text-slate-300">{expandedId === lecture.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expandedId === lecture.id && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4 animate-fade-in">
                    {lecture.content && (
                      <div className="mb-3 rounded-lg bg-white p-3 text-sm text-slate-700 whitespace-pre-wrap">
                        {lecture.content}
                      </div>
                    )}
                    {lecture.file_url && (
                      <a
                        href={lecture.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mb-3 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                      >
                        📎 {lecture.file_name || 'Attached File'}
                      </a>
                    )}
                    {canCreate && (
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handlePublishToggle(lecture.id, lecture.is_published)}
                          className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-300"
                        >
                          {lecture.is_published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          onClick={() => handleEdit(lecture)}
                          className="rounded-lg bg-primary-100 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(lecture.id)}
                          className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                    <p className="mt-2 text-[10px] text-slate-400">
                      Created {new Date(lecture.created_at).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
