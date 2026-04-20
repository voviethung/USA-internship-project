-- ============================================================
-- Pharma Voice Assistant — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. Enable UUID extension (usually already enabled)
create extension if not exists "uuid-ossp";

-- ============================================================
-- 2. Conversations table — stores all voice interactions
-- ============================================================
create table if not exists public.conversations (
  id            uuid        default uuid_generate_v4() primary key,
  user_id       uuid        references auth.users(id) on delete cascade,
  transcript    text        not null,
  translated_vi text,
  reply_en      text,
  reply_vi      text,
  audio_duration float,
  ai_provider   text        default 'groq',
  file_url      text,
  file_name     text,
  file_type     text,
  created_at    timestamptz default now()
);

-- Index for faster queries by user + date
create index if not exists idx_conversations_user_date
  on public.conversations (user_id, created_at desc);

-- ============================================================
-- 3. Row Level Security — users can only see their own data
-- ============================================================
alter table public.conversations enable row level security;

-- SELECT: users see only their own conversations
create policy "Users can view own conversations"
  on public.conversations for select
  using (auth.uid() = user_id);

-- INSERT: users can only insert for themselves
create policy "Users can insert own conversations"
  on public.conversations for insert
  with check (auth.uid() = user_id);

-- DELETE: users can delete their own conversations
create policy "Users can delete own conversations"
  on public.conversations for delete
  using (auth.uid() = user_id);

-- ============================================================
-- 4. Profiles table (Phase 2 — user preferences)
-- ============================================================
create table if not exists public.profiles (
  id                 uuid references auth.users(id) on delete cascade primary key,
  full_name          text,
  preferred_provider text default 'groq',
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

alter table public.profiles enable row level security;

create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================
-- Conversation Segments Table: stores segments with speaker info
-- ============================================================
create table if not exists public.conversation_segments (
  id uuid default uuid_generate_v4() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade,
  speaker text not null, -- e.g., 'user', 'assistant', or speaker label
  start_time float,      -- segment start (seconds)
  end_time float,        -- segment end (seconds)
  transcript text not null,
  created_at timestamptz default now()
);

create index if not exists idx_segments_conversation
  on public.conversation_segments (conversation_id, start_time);

alter table public.conversation_segments enable row level security;

create policy "Users can view segments of own conversations"
  on public.conversation_segments for select
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  ));

create policy "Users can insert segments for own conversations"
  on public.conversation_segments for insert
  with check (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  ));

-- ============================================================
-- Translations table: final translated sessions
-- ============================================================
create table if not exists public.translations (
  id            uuid        default uuid_generate_v4() primary key,
  user_id       uuid        references auth.users(id) on delete set null,
  transcript    text        not null,
  source_lang   text,
  target_lang   text,
  translated_vi text,
  translated_en text,
  reply_en      text,
  reply_vi      text,
  ai_provider   text        default 'groq',
  created_at    timestamptz default now()
);

create index if not exists idx_translations_date
  on public.translations (created_at desc);

alter table public.translations enable row level security;

create policy "Users can view own translations"
  on public.translations for select
  using (auth.uid() = user_id);

create policy "Users can insert own translations"
  on public.translations for insert
  with check (auth.uid() = user_id or user_id is null);
