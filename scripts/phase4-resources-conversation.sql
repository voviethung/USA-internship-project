-- ============================================================
-- Phase 4.1: Resources + Team Conversation + Test Grading
-- Safe migration (idempotent): uses IF NOT EXISTS / guarded policy creation
-- ============================================================

-- Helper function (if not created yet)
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 1) Resources table
-- ============================================================
CREATE TABLE IF NOT EXISTS resources (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  resource_type TEXT NOT NULL DEFAULT 'document'
    CHECK (resource_type IN ('lecture', 'document', 'image', 'other')),
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_created_by ON resources(created_by);
CREATE INDEX IF NOT EXISTS idx_resources_type ON resources(resource_type);

ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'resources' AND policyname = 'Admin full access to resources'
  ) THEN
    CREATE POLICY "Admin full access to resources"
      ON resources FOR ALL
      USING (get_user_role() = 'admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'resources' AND policyname = 'Mentors manage own resources'
  ) THEN
    CREATE POLICY "Mentors manage own resources"
      ON resources FOR ALL
      USING (created_by = auth.uid() AND get_user_role() = 'mentor');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'resources' AND policyname = 'Students read resources'
  ) THEN
    CREATE POLICY "Students read resources"
      ON resources FOR SELECT
      USING (true);
  END IF;
END $$;

-- ============================================================
-- 2) Team conversation messages table
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_scope TEXT NOT NULL DEFAULT 'admin'
    CHECK (recipient_scope IN ('admin', 'all', 'user')),
  recipient_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT recipient_user_required
    CHECK (
      (recipient_scope = 'user' AND recipient_user_id IS NOT NULL)
      OR (recipient_scope IN ('admin', 'all') AND recipient_user_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_created ON conversation_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_messages_sender ON conversation_messages(sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_messages_recipient ON conversation_messages(recipient_scope, recipient_user_id, created_at DESC);

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversation_messages' AND policyname = 'Users can read visible conversation messages'
  ) THEN
    CREATE POLICY "Users can read visible conversation messages"
      ON conversation_messages FOR SELECT
      USING (
        sender_id = auth.uid()
        OR recipient_scope = 'all'
        OR (recipient_scope = 'admin' AND get_user_role() = 'admin')
        OR recipient_user_id = auth.uid()
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversation_messages' AND policyname = 'Users can send own conversation messages'
  ) THEN
    CREATE POLICY "Users can send own conversation messages"
      ON conversation_messages FOR INSERT
      WITH CHECK (sender_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversation_messages' AND policyname = 'Users can edit own conversation messages'
  ) THEN
    CREATE POLICY "Users can edit own conversation messages"
      ON conversation_messages FOR UPDATE
      USING (sender_id = auth.uid())
      WITH CHECK (sender_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'conversation_messages' AND policyname = 'Users can delete own conversation messages'
  ) THEN
    CREATE POLICY "Users can delete own conversation messages"
      ON conversation_messages FOR DELETE
      USING (sender_id = auth.uid());
  END IF;
END $$;

-- Optional: allow authenticated users to resolve @mentions from profile directory
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Authenticated users can view basic profiles'
  ) THEN
    CREATE POLICY "Authenticated users can view basic profiles"
      ON profiles FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================================
-- 3) Extend tasks for tests + grading
-- ============================================================
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'task'
    CHECK (kind IN ('task', 'test')),
  ADD COLUMN IF NOT EXISTS max_score NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS score NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS grading_note TEXT,
  ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS graded_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tasks_score_range_check'
  ) THEN
    ALTER TABLE tasks
      ADD CONSTRAINT tasks_score_range_check
      CHECK (score IS NULL OR score >= 0);
  END IF;
END $$;

-- ============================================================
-- 4) updated_at triggers
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'resources_updated_at'
  ) THEN
    CREATE TRIGGER resources_updated_at
      BEFORE UPDATE ON resources
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'conversation_messages_updated_at'
  ) THEN
    CREATE TRIGGER conversation_messages_updated_at
      BEFORE UPDATE ON conversation_messages
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;
