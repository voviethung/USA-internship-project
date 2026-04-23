'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createSupabaseBrowser } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { ROLE_COLORS } from '@/lib/roles';
import type { Profile } from '@/lib/types';

export default function StudentsPage() {
  const { user, role, loading } = useAuth();
  const { showToast } = useToast();

  const [students, setStudents] = useState<Profile[]>([]);
  const [mentors, setMentors] = useState<Profile[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string>>({}); // studentId → mentorId
  const [loadingData, setLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', department: '' });
  const [search, setSearch] = useState('');

  // AUTH TEMPORARILY DISABLED — no redirect for guests
  // useEffect(() => {
  //   if (!loading && (!user || role === 'student')) {
  //     router.push('/');
  //   }
  // }, [user, role, loading, router]);

  const fetchData = async () => {
    try {
      const supabase = createSupabaseBrowser();

      const [studentsRes, mentorsRes, assignRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('role', 'student').order('full_name'),
        supabase.from('profiles').select('id, full_name').eq('role', 'mentor'),
        supabase.from('mentor_students').select('mentor_id, student_id'),
      ]);

      if (studentsRes.error) console.warn('[students] profiles error:', studentsRes.error.message);
      if (mentorsRes.error) console.warn('[students] mentors error:', mentorsRes.error.message);
      if (assignRes.error) console.warn('[students] assignments error:', assignRes.error.message);

      setStudents(studentsRes.data || []);
      setMentors((mentorsRes.data as Profile[]) || []);

      const map: Record<string, string> = {};
      (assignRes.data || []).forEach((a: { mentor_id: string; student_id: string }) => {
        map[a.student_id] = a.mentor_id;
      });
      setAssignments(map);
    } catch (err) {
      console.error('[students] fetchData error:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user && role !== 'student') fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      showToast('Name is required', 'error');
      return;
    }

    const supabase = createSupabaseBrowser();

    if (editId) {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: form.full_name,
          phone: form.phone || null,
          department: form.department || null,
        })
        .eq('id', editId);
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Student updated', 'success');
    } else {
      showToast('To add a student, they need to register and admin assigns the role.', 'info');
    }

    setShowForm(false);
    setEditId(null);
    setForm({ full_name: '', email: '', phone: '', department: '' });
    fetchData();
  };

  const handleEdit = (s: Profile) => {
    setForm({
      full_name: s.full_name || '',
      email: s.email || '',
      phone: s.phone || '',
      department: s.department || '',
    });
    setEditId(s.id);
    setShowForm(true);
  };

  const handleAssignMentor = async (studentId: string, mentorId: string) => {
    const supabase = createSupabaseBrowser();

    // Remove existing assignment
    await supabase.from('mentor_students').delete().eq('student_id', studentId);

    if (mentorId) {
      const { error } = await supabase.from('mentor_students').insert({
        mentor_id: mentorId,
        student_id: studentId,
      });
      if (error) { showToast(error.message, 'error'); return; }
    }

    showToast('Mentor assigned', 'success');
    fetchData();
  };

  const filtered = students.filter(
    (s) =>
      !search ||
      s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.department?.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><div className="text-primary-600">Loading...</div></div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 text-center">
        <span className="mb-3 text-5xl">🔒</span>
        <h2 className="text-lg font-semibold text-slate-600">Login Required</h2>
        <p className="mt-1 text-sm text-slate-400">Please log in to manage students.</p>
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
            <h1 className="text-xl font-bold text-slate-800">🎓 Students</h1>
            <p className="text-sm text-slate-500">{students.length} registered</p>
          </div>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search students..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
        />

        {/* Edit Form Modal */}
        {showForm && (
          <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50 p-4 animate-scale-in">
            <h3 className="mb-3 font-semibold text-slate-700">{editId ? 'Edit Student' : 'Student Info'}</h3>
            <div className="space-y-3">
              <input
                placeholder="Full Name *"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <input
                placeholder="Department"
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <input
                placeholder="Phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleSave}
                className="flex-1 rounded-lg bg-primary-500 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                Save
              </button>
              <button
                onClick={() => { setShowForm(false); setEditId(null); }}
                className="flex-1 rounded-lg bg-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Student List */}
        {loadingData ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
            No students found
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {filtered.map((student) => (
              <div
                key={student.id}
                className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">
                        {student.full_name || 'Unnamed'}
                      </span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS.student}`}>
                        Student
                      </span>
                    </div>
                    {student.email && (
                      <p className="mt-0.5 text-xs text-slate-400">{student.email}</p>
                    )}
                    {student.department && (
                      <p className="mt-0.5 text-xs text-slate-500">🏢 {student.department}</p>
                    )}
                    {student.phone && (
                      <p className="text-xs text-slate-400">📞 {student.phone}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleEdit(student)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50"
                  >
                    Edit
                  </button>
                </div>

                {/* Mentor Assignment */}
                {role === 'admin' && (
                  <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-500">Mentor:</span>
                    <select
                      value={assignments[student.id] || ''}
                      onChange={(e) => handleAssignMentor(student.id, e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none focus:border-primary-400"
                    >
                      <option value="">— None —</option>
                      {mentors.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.full_name || 'Unnamed Mentor'}
                        </option>
                      ))}
                    </select>
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
