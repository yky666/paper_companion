create extension if not exists "uuid-ossp";
create extension if not exists vector;

create type app_role as enum ('normal_user', 'premium_user', 'ops_admin', 'super_admin');
create type paper_status as enum ('uploaded', 'processing', 'ready', 'failed');
create type task_status as enum ('pending', 'running', 'succeeded', 'failed', 'cancelled');
create type task_type as enum ('paper_parse', 'asset_extract', 'paper_analyze', 'report_export', 'video_generate');
create type asset_type as enum ('page_screenshot', 'figure', 'table', 'official_image');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  research_direction text,
  education_stage text,
  goal text,
  preferred_language text not null default 'zh',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table paper_fields (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique,
  name text not null,
  parent_id uuid references paper_fields(id),
  created_at timestamptz not null default now()
);

create table papers (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  authors text[],
  abstract text,
  publication_year integer,
  field_id uuid references paper_fields(id),
  status paper_status not null default 'uploaded',
  storage_path text not null,
  page_count integer,
  language text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table paper_assets (
  id uuid primary key default uuid_generate_v4(),
  paper_id uuid not null references papers(id) on delete cascade,
  asset_type asset_type not null,
  storage_path text not null,
  page_number integer,
  caption text,
  source_url text,
  width integer,
  height integer,
  relevance_score numeric,
  created_at timestamptz not null default now()
);

create table paper_chunks (
  id uuid primary key default uuid_generate_v4(),
  paper_id uuid not null references papers(id) on delete cascade,
  section_title text,
  page_start integer,
  page_end integer,
  content text not null,
  token_count integer,
  embedding vector(768),
  created_at timestamptz not null default now()
);

create table analysis_reports (
  id uuid primary key default uuid_generate_v4(),
  paper_id uuid not null references papers(id) on delete cascade,
  language text not null default 'zh',
  title text not null,
  markdown text not null,
  html text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table qa_sessions (
  id uuid primary key default uuid_generate_v4(),
  paper_id uuid not null references papers(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table qa_messages (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references qa_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table video_jobs (
  id uuid primary key default uuid_generate_v4(),
  paper_id uuid not null references papers(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  language text not null default 'zh',
  status task_status not null default 'pending',
  script_markdown text,
  subtitle_path text,
  audio_path text,
  video_path text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table task_jobs (
  id uuid primary key default uuid_generate_v4(),
  task_type task_type not null,
  status task_status not null default 'pending',
  paper_id uuid references papers(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  locked_by text,
  locked_at timestamptz,
  heartbeat_at timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table worker_heartbeats (
  worker_id text primary key,
  concurrency integer not null,
  current_task_ids uuid[] not null default '{}',
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table system_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into paper_fields (slug, name) values
  ('computer-science', '计算机科学'),
  ('artificial-intelligence', '人工智能'),
  ('machine-learning', '机器学习'),
  ('natural-language-processing', '自然语言处理'),
  ('computer-vision', '计算机视觉'),
  ('data-science', '数据科学'),
  ('software-engineering', '软件工程'),
  ('biomedicine', '医学与生命科学'),
  ('materials-science', '材料科学'),
  ('mechanical-control', '机械与控制'),
  ('electronic-information', '电子信息'),
  ('education-technology', '教育技术'),
  ('economics-management', '经济管理'),
  ('social-science', '社会科学'),
  ('other', '其他')
on conflict (slug) do nothing;

alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table papers enable row level security;
alter table paper_assets enable row level security;
alter table paper_chunks enable row level security;
alter table analysis_reports enable row level security;
alter table qa_sessions enable row level security;
alter table qa_messages enable row level security;
alter table video_jobs enable row level security;
alter table task_jobs enable row level security;

create policy "users read own profile" on profiles for select using (auth.uid() = id);
create policy "users update own profile" on profiles for update using (auth.uid() = id);
create policy "users insert own profile" on profiles for insert with check (auth.uid() = id);

create policy "users read own papers" on papers for select using (auth.uid() = owner_id);
create policy "users insert own papers" on papers for insert with check (auth.uid() = owner_id);
create policy "users update own papers" on papers for update using (auth.uid() = owner_id);

create policy "users read own assets" on paper_assets for select using (
  exists (select 1 from papers where papers.id = paper_assets.paper_id and papers.owner_id = auth.uid())
);

create policy "users read own chunks" on paper_chunks for select using (
  exists (select 1 from papers where papers.id = paper_chunks.paper_id and papers.owner_id = auth.uid())
);

create policy "users read own reports" on analysis_reports for select using (
  exists (select 1 from papers where papers.id = analysis_reports.paper_id and papers.owner_id = auth.uid())
);

create policy "users read own qa sessions" on qa_sessions for select using (auth.uid() = owner_id);
create policy "users insert own qa sessions" on qa_sessions for insert with check (auth.uid() = owner_id);

create policy "users read own qa messages" on qa_messages for select using (
  exists (select 1 from qa_sessions where qa_sessions.id = qa_messages.session_id and qa_sessions.owner_id = auth.uid())
);

create policy "users read own video jobs" on video_jobs for select using (auth.uid() = owner_id);
create policy "users insert own video jobs" on video_jobs for insert with check (auth.uid() = owner_id);
