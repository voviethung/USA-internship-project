-- ============================================================
-- Phase 4: Internship Management Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add role column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student'
CHECK (role IN ('admin', 'mentor', 'student'));

-- 2. Add extra profile fields
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS department TEXT,
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ============================================================
-- 3. Mentor ↔ Student assignment table
-- ============================================================
CREATE TABLE IF NOT EXISTS mentor_students (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  UNIQUE(mentor_id, student_id)
);

-- ============================================================
-- 4. Lectures table
-- ============================================================
CREATE TABLE IF NOT EXISTS lectures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  category TEXT DEFAULT 'general',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 5. Tasks table
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lecture_id UUID REFERENCES lectures(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 6. Notifications table
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info'
    CHECK (type IN ('info', 'task', 'lecture', 'mentor', 'system')),
  is_read BOOLEAN DEFAULT false,
  link TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 7. Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_mentor_students_mentor ON mentor_students(mentor_id);
CREATE INDEX IF NOT EXISTS idx_mentor_students_student ON mentor_students(student_id);
CREATE INDEX IF NOT EXISTS idx_lectures_created_by ON lectures(created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);

-- ============================================================
-- 8. RLS Policies
-- ============================================================

-- Enable RLS
ALTER TABLE mentor_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE lectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper function: get current user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ── mentor_students ──
CREATE POLICY "Admin full access to mentor_students"
  ON mentor_students FOR ALL
  USING (get_user_role() = 'admin');

CREATE POLICY "Mentors see own assignments"
  ON mentor_students FOR SELECT
  USING (mentor_id = auth.uid());

CREATE POLICY "Students see own mentor"
  ON mentor_students FOR SELECT
  USING (student_id = auth.uid());

-- ── lectures ──
CREATE POLICY "Admin full access to lectures"
  ON lectures FOR ALL
  USING (get_user_role() = 'admin');

CREATE POLICY "Mentors manage own lectures"
  ON lectures FOR ALL
  USING (created_by = auth.uid() AND get_user_role() = 'mentor');

CREATE POLICY "Students read published lectures"
  ON lectures FOR SELECT
  USING (is_published = true);

-- ── tasks ──
CREATE POLICY "Admin full access to tasks"
  ON tasks FOR ALL
  USING (get_user_role() = 'admin');

CREATE POLICY "Mentors manage tasks they assigned"
  ON tasks FOR ALL
  USING (assigned_by = auth.uid() AND get_user_role() = 'mentor');

CREATE POLICY "Students see and update own tasks"
  ON tasks FOR SELECT
  USING (assigned_to = auth.uid());

CREATE POLICY "Students update own task status"
  ON tasks FOR UPDATE
  USING (assigned_to = auth.uid())
  WITH CHECK (assigned_to = auth.uid());

-- ── notifications ──
CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Admin/Mentor insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'mentor'));

-- ── Update profiles policy for role visibility ──
-- (profiles already has RLS from Phase 2, add admin view)
CREATE POLICY "Admin can view all profiles"
  ON profiles FOR SELECT
  USING (get_user_role() = 'admin');

CREATE POLICY "Mentor can view assigned student profiles"
  ON profiles FOR SELECT
  USING (
    get_user_role() = 'mentor'
    AND (
      id = auth.uid()
      OR id IN (SELECT student_id FROM mentor_students WHERE mentor_id = auth.uid())
    )
  );

-- Allow admin to update any profile (for role assignment)
CREATE POLICY "Admin can update all profiles"
  ON profiles FOR UPDATE
  USING (get_user_role() = 'admin');

-- ============================================================
-- 9. Auto-update updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lectures_updated_at
  BEFORE UPDATE ON lectures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 10. Set first user as admin (run manually with your user_id)
-- UPDATE profiles SET role = 'admin' WHERE id = 'YOUR_USER_UUID';
-- ============================================================
