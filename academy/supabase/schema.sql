-- ============================================================
-- EduNexus — Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- Enable UUID extension (already enabled on Supabase)
create extension if not exists "uuid-ossp";

-- ============================================================
-- USERS
-- ============================================================
create table if not exists public.users (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  email           text not null unique,
  password_hash   text not null,
  role            text not null default 'student'
                    check (role in ('student','teacher','admin','parent')),
  class_name      text default ''
                    check (class_name in ('','SS1','SS2','SS3','WAEC','JAMB')),
  approval_status text not null default 'pending'
                    check (approval_status in ('pending','approved','rejected')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Admin accounts are auto-approved (handled in API)
create index if not exists users_role_idx    on public.users (role);
create index if not exists users_status_idx  on public.users (approval_status);
create index if not exists users_email_idx   on public.users (email);

-- ============================================================
-- DOCUMENTS
-- ============================================================
create table if not exists public.documents (
  id                   uuid primary key default uuid_generate_v4(),
  user_id              uuid not null references public.users(id) on delete cascade,
  uploader_role        text not null default 'student',
  uploader_name        text not null default '',

  title                text not null,
  description          text not null default '',
  file_name            text not null,

  -- Cloudinary
  file_path            text not null,
  cloud_public_id      text not null default '',
  cloud_resource_type  text not null default 'image',
  file_url             text not null default '',
  file_size            bigint not null default 0,

  file_type            text not null default 'pdf'
                         check (file_type in ('pdf','ppt','pptx','doc','docx')),
  pages                int not null default 0,

  -- Classification
  class_name           text not null default '',
  term                 text not null default '',
  subject              text not null default '',

  -- Approval workflow
  approval_status      text not null default 'pending'
                         check (approval_status in ('pending','approved','rejected')),
  is_public            boolean not null default false,
  approved_by          uuid references public.users(id) on delete set null,
  approved_at          timestamptz,
  rejection_reason     text not null default '',

  -- Content
  extracted_text       text not null default '',
  chunks               jsonb not null default '[]'::jsonb,
  status               text not null default 'processing'
                         check (status in ('processing','ready','failed')),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists documents_user_id_idx         on public.documents (user_id);
create index if not exists documents_is_public_idx       on public.documents (is_public, approval_status);
create index if not exists documents_class_term_subj_idx on public.documents (class_name, term, subject);
create index if not exists documents_created_at_idx      on public.documents (user_id, created_at desc);

-- ============================================================
-- CHAT HISTORY
-- ============================================================
create table if not exists public.chat_history (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.users(id) on delete cascade,
  document_id  uuid not null references public.documents(id) on delete cascade,
  messages     jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(user_id, document_id)
);

create index if not exists chat_history_user_doc_idx on public.chat_history (user_id, document_id);

-- ============================================================
-- FLASHCARDS
-- ============================================================
create table if not exists public.flashcards (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.users(id) on delete cascade,
  document_id  uuid not null references public.documents(id) on delete cascade,
  question     text not null,
  answer       text not null,
  reviewed     boolean not null default false,
  starred      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists flashcards_user_doc_idx on public.flashcards (user_id, document_id);

-- ============================================================
-- QUIZZES
-- ============================================================
create table if not exists public.quizzes (
  id               uuid primary key default uuid_generate_v4(),
  user_id          uuid not null references public.users(id) on delete cascade,
  document_id      uuid not null references public.documents(id) on delete cascade,
  title            text not null,
  questions        jsonb not null default '[]'::jsonb,
  total_questions  int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists quizzes_user_doc_idx on public.quizzes (user_id, document_id);

-- ============================================================
-- Row Level Security (RLS) — disable for service_role key
-- The API uses the service_role key so RLS is bypassed.
-- Enable RLS only if you plan to use anon/user keys from client.
-- ============================================================
-- alter table public.users enable row level security;
-- alter table public.documents enable row level security;
-- alter table public.chat_history enable row level security;
-- alter table public.flashcards enable row level security;
-- alter table public.quizzes enable row level security;
