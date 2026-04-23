'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createSupabaseBrowser } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Resource, ResourceType, UploadResponse } from '@/lib/types';

function canPreviewOnline(fileType: string | null, url: string): boolean {
  if (fileType === 'image' || fileType === 'pdf') return true;
  return /\.(png|jpe?g|webp|gif|svg|pdf)(\?|$)/i.test(url);
}

function renderPreview(resource: Resource) {
  if (!canPreviewOnline(resource.file_type, resource.file_url)) {
    return (
      <a
        href={resource.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
      >
        🌐 Open file in new tab
      </a>
    );
  }

  const isImage = resource.file_type === 'image' || /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(resource.file_url);
  if (isImage) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resource.file_url}
        alt={resource.title}
        className="max-h-72 w-full rounded-lg border border-slate-200 object-contain bg-white"
      />
    );
  }

  return (
    <iframe
      src={resource.file_url}
      title={resource.title}
      className="h-80 w-full rounded-lg border border-slate-200 bg-white"
    />
  );
}

export default function ResourcesPage() {
  const { user, role, loading } = useAuth();
  const { showToast } = useToast();

  const [resources, setResources] = useState<Resource[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    title: '',
    description: '',
    resource_type: 'document' as ResourceType,
    file_url: '',
    file_name: '',
    file_type: '',
  });

  const canManage = role === 'admin' || role === 'mentor';

  const fetchResources = async () => {
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from('resources')
      .select('*, creator:profiles!resources_created_by_fkey(id, full_name), editor:profiles!resources_updated_by_fkey(id, full_name)')
      .order('created_at', { ascending: false });

    if (error) {
      showToast(error.message, 'error');
      setLoadingData(false);
      return;
    }

    setResources((data as Resource[]) || []);
    setLoadingData(false);
  };

  useEffect(() => {
    if (user) fetchResources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const filtered = useMemo(
    () =>
      resources.filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q) ||
          r.resource_type.toLowerCase().includes(q)
        );
      }),
    [resources, search],
  );

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload-file', { method: 'POST', body: formData });
      const payload: UploadResponse = await res.json();

      if (!res.ok || !payload.success || !payload.data) {
        throw new Error(payload.error || 'Upload failed');
      }

      setForm((prev) => ({
        ...prev,
        file_url: payload.data!.url,
        file_name: payload.data!.fileName,
        file_type: payload.data!.fileType,
      }));
      showToast('File uploaded', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      showToast(message, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm({
      title: '',
      description: '',
      resource_type: 'document',
      file_url: '',
      file_name: '',
      file_type: '',
    });
  };

  const handleSave = async () => {
    if (isSaving) return;

    if (!form.title.trim()) {
      showToast('Title is required', 'error');
      return;
    }
    if (!form.file_url.trim()) {
      showToast('Please upload or provide a file URL', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const supabase = createSupabaseBrowser();
      if (editId) {
        const { error } = await supabase
          .from('resources')
          .update({
            title: form.title,
            description: form.description || null,
            resource_type: form.resource_type,
            file_url: form.file_url,
            file_name: form.file_name || null,
            file_type: form.file_type || null,
            updated_by: user!.id,
          })
          .eq('id', editId);

        if (error) {
          showToast(error.message, 'error');
          return;
        }
        showToast('Resource updated', 'success');
      } else {
        const { error } = await supabase.from('resources').insert({
          title: form.title,
          description: form.description || null,
          resource_type: form.resource_type,
          file_url: form.file_url,
          file_name: form.file_name || null,
          file_type: form.file_type || null,
          created_by: user!.id,
          updated_by: user!.id,
        });

        if (error) {
          showToast(error.message, 'error');
          return;
        }
        showToast('Resource created', 'success');
      }

      resetForm();
      fetchResources();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save resource';
      showToast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (resource: Resource) => {
    setEditId(resource.id);
    setShowForm(true);
    setForm({
      title: resource.title,
      description: resource.description || '',
      resource_type: resource.resource_type,
      file_url: resource.file_url,
      file_name: resource.file_name || '',
      file_type: resource.file_type || '',
    });
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this resource?')) return;
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from('resources').delete().eq('id', id);
    if (error) {
      showToast(error.message, 'error');
      return;
    }
    showToast('Resource deleted', 'success');
    fetchResources();
  };

  if (loading) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><div className="text-primary-600">Loading...</div></div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 text-center">
        <span className="mb-3 text-5xl">🔒</span>
        <h2 className="text-lg font-semibold text-slate-600">Login Required</h2>
        <p className="mt-1 text-sm text-slate-400">Please log in to view resources.</p>
        <a href="/login" className="mt-4 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:from-primary-600 hover:to-primary-700">Go to Login</a>
      </div>
    );
  }

  return (
    <div className="h-[calc(100dvh-4rem)] overflow-hidden pt-4 animate-fade-in">
      <div className="mx-auto h-full max-w-lg overflow-y-auto px-4 pb-20">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">📚 Resources</h1>
            <p className="text-sm text-slate-500">{resources.length} items</p>
          </div>
          {canManage && (
            <button
              onClick={() => {
                if (showForm) resetForm();
                else setShowForm(true);
              }}
              className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white hover:bg-primary-600"
            >
              {showForm ? 'Close' : '+ Create'}
            </button>
          )}
        </div>

        <input
          type="text"
          placeholder="Search resources..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
        />

        {showForm && canManage && (
          <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50 p-4 animate-scale-in">
            <h3 className="mb-3 font-semibold text-slate-700">{editId ? 'Edit Resource' : 'New Resource'}</h3>
            <div className="space-y-3">
              <input
                placeholder="Title *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <textarea
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400 resize-none"
              />
              <select
                value={form.resource_type}
                onChange={(e) => setForm({ ...form, resource_type: e.target.value as ResourceType })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
              >
                <option value="lecture">Lecture</option>
                <option value="document">Document</option>
                <option value="image">Image</option>
                <option value="other">Other</option>
              </select>

              <div className="rounded-lg border border-dashed border-primary-300 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-slate-500">Upload file (Cloudinary)</label>
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                    }}
                    className="text-xs"
                    disabled={isUploading}
                  />
                </div>
                {isUploading && <p className="mt-2 text-xs text-primary-600">Uploading...</p>}
              </div>

              <input
                placeholder="File URL *"
                value={form.file_url}
                onChange={(e) => setForm({ ...form, file_url: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <input
                placeholder="File name"
                value={form.file_name}
                onChange={(e) => setForm({ ...form, file_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleSave}
                disabled={isSaving || isUploading}
                className="flex-1 rounded-lg bg-primary-500 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? (editId ? 'Updating...' : 'Creating...') : (editId ? 'Update' : 'Create')}
              </button>
              <button onClick={resetForm} className="flex-1 rounded-lg bg-slate-200 py-2 text-sm font-medium text-slate-600">
                Cancel
              </button>
            </div>
          </div>
        )}

        {loadingData ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">No resources found</div>
        ) : (
          <div className="space-y-3 stagger-children">
            {filtered.map((resource) => (
              <div key={resource.id} className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div className="cursor-pointer p-4" onClick={() => setExpandedId(expandedId === resource.id ? null : resource.id)}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-slate-800">{resource.title}</div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        📂 {resource.resource_type} · {resource.creator?.full_name || 'Unknown'}
                      </p>
                      {resource.description && <p className="mt-1 text-xs text-slate-400 line-clamp-2">{resource.description}</p>}
                    </div>
                    <span className="text-slate-300">{expandedId === resource.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {expandedId === resource.id && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4 animate-fade-in">
                    <div className="mb-3">{renderPreview(resource)}</div>
                    <a
                      href={resource.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary-600 hover:underline"
                    >
                      📎 {resource.file_name || 'Open attached file'}
                    </a>

                    {canManage && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => handleEdit(resource)}
                          className="rounded-lg bg-primary-100 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(resource.id)}
                          className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    <p className="mt-2 text-[10px] text-slate-400">
                      Created {new Date(resource.created_at).toLocaleDateString()} · Updated {new Date(resource.updated_at).toLocaleDateString()}
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
