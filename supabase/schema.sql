-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.conversation_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_scope text NOT NULL DEFAULT 'admin'::text CHECK (recipient_scope = ANY (ARRAY['admin'::text, 'all'::text, 'user'::text])),
  recipient_user_id uuid,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT conversation_messages_pkey PRIMARY KEY (id),
  CONSTRAINT conversation_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id),
  CONSTRAINT conversation_messages_recipient_user_id_fkey FOREIGN KEY (recipient_user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.conversation_segments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  conversation_id uuid,
  speaker text NOT NULL,
  start_time double precision,
  end_time double precision,
  transcript text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT conversation_segments_pkey PRIMARY KEY (id),
  CONSTRAINT conversation_segments_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
);
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  transcript text NOT NULL,
  translated_vi text,
  reply_en text,
  reply_vi text,
  audio_duration double precision,
  ai_provider text DEFAULT 'groq'::text,
  file_url text,
  file_name text,
  file_type text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT conversations_pkey PRIMARY KEY (id),
  CONSTRAINT conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.lectures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  content text,
  file_url text,
  file_name text,
  file_type text,
  category text DEFAULT 'general'::text,
  created_by uuid NOT NULL,
  is_published boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT lectures_pkey PRIMARY KEY (id),
  CONSTRAINT lectures_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.mentor_students (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mentor_id uuid NOT NULL,
  student_id uuid NOT NULL,
  assigned_at timestamp with time zone DEFAULT now(),
  notes text,
  CONSTRAINT mentor_students_pkey PRIMARY KEY (id),
  CONSTRAINT mentor_students_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES public.profiles(id),
  CONSTRAINT mentor_students_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info'::text CHECK (type = ANY (ARRAY['info'::text, 'task'::text, 'lecture'::text, 'mentor'::text, 'system'::text])),
  is_read boolean DEFAULT false,
  link text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text,
  preferred_provider text DEFAULT 'groq'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  role text NOT NULL DEFAULT 'student'::text CHECK (role = ANY (ARRAY['admin'::text, 'mentor'::text, 'student'::text])),
  email text,
  phone text,
  department text,
  avatar_url text,
  approval_status text NOT NULL DEFAULT 'pending'::text CHECK (approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  approved_at timestamp with time zone,
  approved_by uuid,
  rejected_note text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id),
  CONSTRAINT profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.resources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  file_url text NOT NULL,
  file_name text,
  file_type text,
  resource_type text NOT NULL DEFAULT 'document'::text CHECK (resource_type = ANY (ARRAY['lecture'::text, 'document'::text, 'image'::text, 'other'::text])),
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT resources_pkey PRIMARY KEY (id),
  CONSTRAINT resources_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT resources_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_to uuid NOT NULL,
  assigned_by uuid NOT NULL,
  lecture_id uuid,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'overdue'::text])),
  priority text NOT NULL DEFAULT 'medium'::text CHECK (priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'urgent'::text])),
  due_date timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  kind text NOT NULL DEFAULT 'task'::text CHECK (kind = ANY (ARRAY['task'::text, 'test'::text])),
  max_score numeric,
  score numeric CHECK (score IS NULL OR score >= 0::numeric),
  grading_note text,
  graded_at timestamp with time zone,
  graded_by uuid,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.profiles(id),
  CONSTRAINT tasks_assigned_by_fkey FOREIGN KEY (assigned_by) REFERENCES public.profiles(id),
  CONSTRAINT tasks_lecture_id_fkey FOREIGN KEY (lecture_id) REFERENCES public.lectures(id),
  CONSTRAINT tasks_graded_by_fkey FOREIGN KEY (graded_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.template_lines (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  section_id uuid NOT NULL,
  line_no integer NOT NULL,
  role_label text,
  line_kind text NOT NULL CHECK (line_kind = ANY (ARRAY['text'::text, 'note'::text, 'practice'::text, 'instructor'::text, 'student'::text, 'bullet'::text])),
  language_code text NOT NULL CHECK (language_code = ANY (ARRAY['en'::text, 'vi'::text])),
  text_content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT template_lines_pkey PRIMARY KEY (id),
  CONSTRAINT template_lines_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.template_sections(id)
);
CREATE TABLE public.template_sections (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  template_id uuid NOT NULL,
  section_key text NOT NULL,
  week_no integer,
  track_no integer,
  title text NOT NULL,
  section_type text NOT NULL CHECK (section_type = ANY (ARRAY['overview'::text, 'usage'::text, 'track'::text, 'roleplay'::text, 'master_phrase'::text, 'practice'::text, 'scenario'::text])),
  sort_order integer NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT template_sections_pkey PRIMARY KEY (id),
  CONSTRAINT template_sections_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.training_templates(id)
);
CREATE TABLE public.training_templates (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  version text,
  target_audience text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT training_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.translations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid,
  transcript text NOT NULL,
  source_lang text,
  target_lang text,
  translated_vi text,
  translated_en text,
  reply_en text,
  reply_vi text,
  ai_provider text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT translations_pkey PRIMARY KEY (id),
  CONSTRAINT translations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);