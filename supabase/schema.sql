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

-- Trigger: create profile after auth.users insert
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
