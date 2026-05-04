-- ============================================================
-- Phase 5: Auth hardening + registration approval
-- Run this in Supabase SQL editor
-- ============================================================

-- 1) Add approval workflow fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_approval_status_check'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- Existing users remain usable immediately
UPDATE profiles
SET approval_status = 'approved'
WHERE approval_status IS NULL;

ALTER TABLE profiles
  ALTER COLUMN approval_status SET DEFAULT 'pending',
  ALTER COLUMN approval_status SET NOT NULL;

-- 2) Ensure newly created auth users get a profile row in pending state
CREATE OR REPLACE FUNCTION handle_new_user_profile()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, approval_status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.email,
    'student',
    'pending'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name),
    role = COALESCE(public.profiles.role, 'student'),
    approval_status = COALESCE(public.profiles.approval_status, 'pending');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created_profile'
  ) THEN
    CREATE TRIGGER on_auth_user_created_profile
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE PROCEDURE handle_new_user_profile();
  END IF;
END $$;

-- 3) Make sure admin can update approval fields (if policy missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'Admin can update all profiles'
  ) THEN
    CREATE POLICY "Admin can update all profiles"
      ON profiles FOR UPDATE
      USING (get_user_role() = 'admin');
  END IF;
END $$;
