'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { createSupabaseBrowser } from '@/lib/supabase';
import { useToast } from '@/components/Toast';
import type { Task, Profile, TaskStatus, TaskPriority, TaskKind } from '@/lib/types';

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  overdue: 'bg-red-100 text-red-700',
};

const PRIORITY_ICONS: Record<TaskPriority, string> = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  urgent: '🔴',
};

type TaskWithJoins = Task & {
  assignee?: Profile | null;
  assigner?: Profile | null;
  grader?: Profile | null;
};

export default function TasksPage() {
  const { user, role, loading } = useAuth();
  const { showToast } = useToast();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [gradeTaskId, setGradeTaskId] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [form, setForm] = useState({
    title: '',
    description: '',
    kind: 'test' as TaskKind,
    assigned_to: '',
    priority: 'medium' as TaskPriority,
    max_score: '',
    due_date: '',
  });
  const [gradeForm, setGradeForm] = useState({ score: '', grading_note: '' });

  const canAssign = role === 'admin' || role === 'mentor';

  const fetchTasks = async () => {
    if (!user) return;
    const supabase = createSupabaseBrowser();
    let query = supabase
      .from('tasks')
      .select('*, assignee:profiles!tasks_assigned_to_fkey(id, full_name), assigner:profiles!tasks_assigned_by_fkey(id, full_name), grader:profiles!tasks_graded_by_fkey(id, full_name)')
      .order('created_at', { ascending: false });

    if (role === 'mentor') {
      const { data: relationRows } = await supabase
        .from('mentor_students')
        .select('student_id')
        .eq('mentor_id', user.id);

      const studentIds = (relationRows || []).map((row: { student_id: string }) => row.student_id);
      if (studentIds.length === 0) {
        setTasks([]);
        setLoadingData(false);
        return;
      }
      query = query.in('assigned_to', studentIds);
    }

    const { data } = await query;
    setTasks((data as TaskWithJoins[]) || []);
    setLoadingData(false);
  };

  const fetchStudents = async () => {
    if (!canAssign || !user) return;
    const supabase = createSupabaseBrowser();
    let query = supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'student')
      .order('full_name');

    if (role === 'mentor') {
      const { data: relationRows } = await supabase
        .from('mentor_students')
        .select('student_id')
        .eq('mentor_id', user.id);
      const studentIds = (relationRows || []).map((row: { student_id: string }) => row.student_id);
      if (studentIds.length === 0) {
        setStudents([]);
        return;
      }
      query = query.in('id', studentIds);
    }

    const { data } = await query;
    setStudents(data as Profile[] || []);
  };

  useEffect(() => {
    if (user) {
      setLoadingData(true);
      fetchTasks();
      fetchStudents();
      return;
    }

    setTasks([]);
    setStudents([]);
    setLoadingData(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  const handleSave = async () => {
    if (!form.title.trim()) { showToast('Title is required', 'error'); return; }
    if (!form.assigned_to && !editId) { showToast('Select a student', 'error'); return; }

    const supabase = createSupabaseBrowser();

    if (editId) {
      const { error } = await supabase
        .from('tasks')
        .update({
          title: form.title,
          description: form.description || null,
          kind: form.kind,
          priority: form.priority,
          max_score: form.max_score ? Number(form.max_score) : null,
          due_date: form.due_date || null,
        })
        .eq('id', editId);
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Task updated', 'success');
    } else {
      const { error } = await supabase.from('tasks').insert({
        title: form.title,
        description: form.description || null,
        kind: form.kind,
        assigned_to: form.assigned_to,
        assigned_by: user!.id,
        priority: form.priority,
        max_score: form.max_score ? Number(form.max_score) : null,
        due_date: form.due_date || null,
      });
      if (error) { showToast(error.message, 'error'); return; }
      showToast('Task assigned', 'success');
    }

    setShowForm(false);
    setEditId(null);
    setForm({ title: '', description: '', kind: 'test', assigned_to: '', priority: 'medium', max_score: '', due_date: '' });
    fetchTasks();
  };

  const handleGrade = async (taskId: string) => {
    const scoreValue = gradeForm.score.trim() ? Number(gradeForm.score) : null;
    if (scoreValue !== null && Number.isNaN(scoreValue)) {
      showToast('Score must be a number', 'error');
      return;
    }

    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from('tasks')
      .update({
        score: scoreValue,
        grading_note: gradeForm.grading_note || null,
        graded_at: scoreValue === null ? null : new Date().toISOString(),
        graded_by: scoreValue === null ? null : user!.id,
      })
      .eq('id', taskId);

    if (error) {
      showToast(error.message, 'error');
      return;
    }

    showToast('Result saved', 'success');
    setGradeTaskId(null);
    setGradeForm({ score: '', grading_note: '' });
    fetchTasks();
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    const supabase = createSupabaseBrowser();
    const updates: { status: TaskStatus; completed_at: string | null } = {
      status: newStatus,
      completed_at: null,
    };
    if (newStatus === 'completed') updates.completed_at = new Date().toISOString();

    const { error } = await supabase.from('tasks').update(updates).eq('id', taskId);
    if (error) { showToast(error.message, 'error'); return; }
    showToast(`Task marked as ${newStatus.replace('_', ' ')}`, 'success');
    fetchTasks();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) { showToast(error.message, 'error'); return; }
    showToast('Task deleted', 'success');
    fetchTasks();
  };

  const studentTests = tasks.filter((t) => t.kind === 'test');
  const sourceTasks = role === 'student' ? studentTests : tasks;
  const filteredTasks = sourceTasks.filter((t) => filter === 'all' || t.status === filter);

  if (loading) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><div className="text-primary-600">Loading...</div></div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center px-4 text-center">
        <span className="mb-3 text-5xl">🔒</span>
        <h2 className="text-lg font-semibold text-slate-600">Login Required</h2>
        <p className="mt-1 text-sm text-slate-400">Please log in to view tasks.</p>
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
            <h1 className="text-xl font-bold text-slate-800">✅ {role === 'student' ? 'My Tests' : 'Tasks & Tests'}</h1>
            <p className="text-sm text-slate-500">{filteredTasks.length} items</p>
          </div>
          {canAssign && (
            <button
              onClick={() => {
                setShowForm(!showForm);
                setEditId(null);
                setForm({ title: '', description: '', kind: 'test', assigned_to: '', priority: 'medium', max_score: '', due_date: '' });
              }}
              className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-medium text-white hover:bg-primary-600"
            >
              + Create
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1">
          {['all', 'pending', 'in_progress', 'completed', 'overdue'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f ? 'bg-white text-primary-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f === 'all' ? 'All' : f.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}
            </button>
          ))}
        </div>

        {/* Create Form */}
        {showForm && canAssign && (
          <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50 p-4 animate-scale-in">
            <h3 className="mb-3 font-semibold text-slate-700">{editId ? 'Edit Task' : 'New Task'}</h3>
            <div className="space-y-3">
              <input
                placeholder="Task title *"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as TaskKind })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
              >
                <option value="test">🧪 Test</option>
                <option value="task">📝 Task</option>
              </select>
              <textarea
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400 resize-none"
              />
              {!editId && (
                <select
                  value={form.assigned_to}
                  onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                >
                  <option value="">— Assign to student —</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.full_name || s.email || s.id.slice(0, 8)}</option>
                  ))}
                </select>
              )}
              <div className="flex gap-2">
                <select
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                >
                  <option value="low">🟢 Low</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="high">🟠 High</option>
                  <option value="urgent">🔴 Urgent</option>
                </select>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none"
                />
              </div>
              <input
                type="number"
                min="0"
                step="0.5"
                placeholder="Max score (optional)"
                value={form.max_score}
                onChange={(e) => setForm({ ...form, max_score: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-400"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={handleSave} className="flex-1 rounded-lg bg-primary-500 py-2 text-sm font-medium text-white hover:bg-primary-600">
                {editId ? 'Update' : 'Assign'}
              </button>
              <button onClick={() => { setShowForm(false); setEditId(null); }} className="flex-1 rounded-lg bg-slate-200 py-2 text-sm font-medium text-slate-600">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Task List */}
        {loadingData ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-100" />)}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
            No tasks found
          </div>
        ) : (
          <div className="space-y-3 stagger-children">
            {filteredTasks.map((task) => (
              <div key={task.id} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span>{PRIORITY_ICONS[task.priority]}</span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-500">
                        {task.kind}
                      </span>
                      <span className={`font-medium text-slate-800 ${task.status === 'completed' ? 'line-through text-slate-400' : ''}`}>
                        {task.title}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_COLORS[task.status]}`}>
                        {task.status.replace('_', ' ')}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        → {task.assignee?.full_name || 'Unassigned'}
                      </span>
                      {task.due_date && (
                        <span className={`text-[10px] ${
                          new Date(task.due_date) < new Date() && task.status !== 'completed'
                            ? 'text-red-500 font-medium'
                            : 'text-slate-400'
                        }`}>
                          📅 {new Date(task.due_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="mt-1 text-xs text-slate-400 line-clamp-2">{task.description}</p>
                    )}
                    {(task.score !== null || task.max_score !== null) && (
                      <div className="mt-2 rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                        🏁 Result: {task.score !== null ? task.score : '—'}{task.max_score !== null ? ` / ${task.max_score}` : ''}
                        {task.grading_note ? ` · ${task.grading_note}` : ''}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3">
                  {/* Student can change status */}
                  {(role === 'student' && task.assigned_to === user?.id) && (
                    <>
                      {task.status === 'pending' && (
                        <button onClick={() => handleStatusChange(task.id, 'in_progress')} className="rounded-lg bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-200">
                          Start
                        </button>
                      )}
                      {task.status === 'in_progress' && (
                        <button onClick={() => handleStatusChange(task.id, 'completed')} className="rounded-lg bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-200">
                          Complete
                        </button>
                      )}
                    </>
                  )}
                  {/* Admin/Mentor can change status and delete */}
                  {canAssign && (
                    <>
                      <select
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs outline-none"
                      >
                        <option value="pending">Pending</option>
                        <option value="in_progress">In Progress</option>
                        <option value="completed">Completed</option>
                        <option value="overdue">Overdue</option>
                      </select>
                      <button
                        onClick={() => {
                          setForm({
                            title: task.title,
                            description: task.description || '',
                            kind: task.kind,
                            assigned_to: task.assigned_to,
                            priority: task.priority,
                            max_score: task.max_score !== null ? String(task.max_score) : '',
                            due_date: task.due_date ? task.due_date.slice(0, 10) : '',
                          });
                          setEditId(task.id);
                          setShowForm(true);
                        }}
                        className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(task.id)}
                        className="rounded-lg bg-red-100 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-200"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => {
                          setGradeTaskId(gradeTaskId === task.id ? null : task.id);
                          setGradeForm({
                            score: task.score !== null ? String(task.score) : '',
                            grading_note: task.grading_note || '',
                          });
                        }}
                        className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-200"
                      >
                        Grade
                      </button>
                    </>
                  )}
                </div>

                {canAssign && gradeTaskId === task.id && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder={task.max_score !== null ? `Score / ${task.max_score}` : 'Score'}
                        value={gradeForm.score}
                        onChange={(e) => setGradeForm((prev) => ({ ...prev, score: e.target.value }))}
                        className="flex-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs outline-none"
                      />
                      <button
                        onClick={() => handleGrade(task.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                      >
                        Save
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Feedback"
                      value={gradeForm.grading_note}
                      onChange={(e) => setGradeForm((prev) => ({ ...prev, grading_note: e.target.value }))}
                      className="mt-2 w-full resize-none rounded-lg border border-emerald-200 px-2 py-1 text-xs outline-none"
                    />
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
