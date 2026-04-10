'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createSupabaseBrowser } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import { useRouter } from 'next/navigation';
import { ROLE_COLORS } from '@/lib/roles';
import type { Profile } from '@/lib/types';

interface MentorWithStudents extends Profile {
  studentCount: number;
  students: Profile[];
}

export default function MentorsPage() {
  const { user, role, loading } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();

  const [mentors, setMentors] = useState<MentorWithStudents[]>([]);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showPromote, setShowPromote] = useState(false);
  const [promoteUserId, setPromoteUserId] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!loading && (!user || role !== 'admin')) {
      router.push('/');
    }
  }, [user, role, loading, router]);

  const fetchData = async () => {
    const supabase = createSupabaseBrowser();

    const [mentorsRes, assignRes, allUsersRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'mentor').order('full_name'),
      supabase.from('mentor_students').select('mentor_id, student_id, profiles!mentor_students_student_id_fkey(id, full_name, email, department)'),
      supabase.from('profiles').select('id, full_name, email, role').eq('role', 'student'),
    ]);

    const mentorList = (mentorsRes.data || []) as Profile[];
    const assignData = assignRes.data || [];

    const enriched: MentorWithStudents[] = mentorList.map((m) => {
      const studentAssignments = assignData.filter((a: any) => a.mentor_id === m.id);
      return {
        ...m,
        studentCount: studentAssignments.length,
        students: studentAssignments.map((a: any) => a.profiles).filter(Boolean),
      };
    });

    setMentors(enriched);
    setAllUsers(allUsersRes.data as Profile[] || []);
    setLoadingData(false);
  };

  useEffect(() => {
    if (user && role === 'admin') fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  const handlePromote = async () => {
    if (!promoteUserId) {
      showToast('Select a user to promote', 'error');
      return;
    }
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'mentor' })
      .eq('id', promoteUserId);

    if (error) { showToast(error.message, 'error'); return; }
    showToast('User promoted to Mentor', 'success');
    setShowPromote(false);
    setPromoteUserId('');
    fetchData();
  };

  const handleDemote = async (mentorId: string) => {
    if (!confirm('Demote this mentor back to student?')) return;
    const supabase = createSupabaseBrowser();

    // Remove assignments first
    await supabase.from('mentor_students').delete().eq('mentor_id', mentorId);
    // Change role
    const { error } = await supabase
      .from('profiles')
      .update({ role: 'student' })
      .eq('id', mentorId);

    if (error) { showToast(error.message, 'error'); return; }
    showToast('Mentor demoted to Student', 'success');
    fetchData();
  };

  const filtered = mentors.filter(
    (m) =>
      !search ||
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading || !user || role !== 'admin') {
    return <div className="flex min-h-[100dvh] items-center justify-center"><div className="text-primary-600">Loading...</div></div>;
  }

  return (
    <div className="min-h-[100dvh] pb-20 pt-4 animate-fade-in">
      <div className="mx-auto max-w-lg px-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">👨‍🏫 Mentors</h1>
            <p className="text-sm text-slate-500">{mentors.length} mentors</p>
          </div>
          <button
            onClick={() => setShowPromote(!showPromote)}
            className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white hover:bg-primary-600"
          >
            + Promote
          </button>
        </div>

        {/* Promote Form */}
        {showPromote && (
          <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 animate-scale-in">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Promote Student to Mentor</h3>
            <select
              value={promoteUserId}
              onChange={(e) => setPromoteUserId(e.target.value)}
              className="mb-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
            >
              <option value="">— Select a student —</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name || u.email || u.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={handlePromote} className="flex-1 rounded-lg bg-blue-500 py-2 text-sm font-medium text-white hover:bg-blue-600">
                Confirm
              </button>
              <button onClick={() => setShowPromote(false)} className="flex-1 rounded-lg bg-slate-200 py-2 text-sm font-medium text-slate-600">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search mentors..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-4 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20"
        />

        {/* Mentor List */}
        {loadingData ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
            No mentors found
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {filtered.map((mentor) => (
              <div key={mentor.id} className="rounded-xl border border-slate-100 bg-white shadow-sm overflow-hidden">
                <div
                  className="flex items-start justify-between p-4 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === mentor.id ? null : mentor.id)}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{mentor.full_name || 'Unnamed'}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS.mentor}`}>
                        Mentor
                      </span>
                    </div>
                    {mentor.email && <p className="mt-0.5 text-xs text-slate-400">{mentor.email}</p>}
                    <p className="mt-1 text-xs text-slate-500">
                      🎓 {mentor.studentCount} student{mentor.studentCount !== 1 ? 's' : ''} assigned
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDemote(mentor.id); }}
                      className="rounded-lg px-2 py-1 text-xs text-red-500 hover:bg-red-50"
                    >
                      Demote
                    </button>
                    <span className="text-slate-300">{expandedId === mentor.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Expanded students */}
                {expandedId === mentor.id && (
                  <div className="border-t border-slate-100 bg-slate-50 p-4 animate-fade-in">
                    <p className="mb-2 text-xs font-semibold text-slate-500">Assigned Students:</p>
                    {mentor.students.length === 0 ? (
                      <p className="text-xs text-slate-400">No students assigned yet</p>
                    ) : (
                      <div className="space-y-1">
                        {mentor.students.map((s: any) => (
                          <div key={s.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs">
                            <span>🎓</span>
                            <span className="font-medium text-slate-700">{s.full_name || 'Unnamed'}</span>
                            {s.department && <span className="text-slate-400">({s.department})</span>}
                          </div>
                        ))}
                      </div>
                    )}
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
