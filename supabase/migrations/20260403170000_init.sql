create extension if not exists pgcrypto;
create extension if not exists vector;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lab_id') then
    create type public.lab_id as enum (
      'startup',
      'story',
      'problem',
      'music',
      'invention',
      'marketing',
      'popculture',
      'research',
      'chaos'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'node_origin') then
    create type public.node_origin as enum ('human', 'ai');
  end if;

  if not exists (select 1 from pg_type where typname = 'node_status') then
    create type public.node_status as enum ('active', 'dormant', 'taken_live', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'moderation_status') then
    create type public.moderation_status as enum ('visible', 'flagged', 'hidden');
  end if;

  if not exists (select 1 from pg_type where typname = 'relationship_type') then
    create type public.relationship_type as enum (
      'solves',
      'expands',
      'contradicts',
      'metaphor_for',
      'version_of',
      'completes',
      'combines'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'vote_target_type') then
    create type public.vote_target_type as enum ('node', 'edge', 'prompt');
  end if;

  if not exists (select 1 from pg_type where typname = 'prompt_status') then
    create type public.prompt_status as enum ('active', 'dormant', 'archived');
  end if;

  if not exists (select 1 from pg_type where typname = 'room_status') then
    create type public.room_status as enum ('open', 'building', 'taken_live', 'dormant');
  end if;

  if not exists (select 1 from pg_type where typname = 'report_status') then
    create type public.report_status as enum ('open', 'reviewed');
  end if;
end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  anon_session_id uuid not null default gen_random_uuid(),
  username text,
  email text,
  created_at timestamptz not null default now(),
  lab_preferences text[] not null default '{}',
  contribution_count integer not null default 0,
  is_flagged boolean not null default false
);

create unique index if not exists users_anon_session_id_key on public.users (anon_session_id);
create unique index if not exists users_email_key on public.users (lower(email)) where email is not null;
create unique index if not exists users_username_key on public.users (lower(username)) where username is not null;

create table if not exists public.prompts (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  lab public.lab_id not null,
  origin public.node_origin not null default 'ai',
  parent_prompt_id uuid references public.prompts(id) on delete set null,
  parent_node_id uuid,
  chain_depth integer not null default 0,
  status public.prompt_status not null default 'active',
  engagement_score double precision not null default 0,
  response_count integer not null default 0,
  open_text_ratio double precision not null default 1,
  options text[] not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  lab public.lab_id not null,
  origin public.node_origin not null default 'human',
  submitted_by uuid references public.users(id) on delete cascade,
  node_type text not null default 'concept',
  status public.node_status not null default 'active',
  moderation_status public.moderation_status not null default 'visible',
  vote_count integer not null default 0,
  embedding vector(1536),
  parent_node_id uuid references public.nodes(id) on delete cascade,
  prompt_id uuid references public.prompts(id) on delete set null,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  is_seed boolean not null default false
);

create index if not exists nodes_lab_status_idx on public.nodes (lab, status, created_at desc);
create index if not exists nodes_parent_node_id_idx on public.nodes (parent_node_id);
create index if not exists nodes_submitted_by_idx on public.nodes (submitted_by, created_at desc);
create index if not exists nodes_last_active_idx on public.nodes (last_active_at desc);
create index if not exists nodes_moderation_status_idx on public.nodes (moderation_status);

create table if not exists public.edges (
  id uuid primary key default gen_random_uuid(),
  source_node_id uuid not null references public.nodes(id) on delete cascade,
  target_node_id uuid not null references public.nodes(id) on delete cascade,
  relationship_type public.relationship_type not null,
  confidence_score double precision not null default 0,
  origin public.node_origin not null default 'ai',
  source_lab public.lab_id not null,
  target_lab public.lab_id not null,
  is_cross_lab boolean not null default false,
  created_at timestamptz not null default now(),
  vote_score integer not null default 0,
  constraint edges_unique_pair unique (source_node_id, target_node_id),
  constraint edges_no_self_reference check (source_node_id <> target_node_id)
);

create index if not exists edges_source_idx on public.edges (source_node_id, created_at desc);
create index if not exists edges_target_idx on public.edges (target_node_id, created_at desc);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null,
  target_type public.vote_target_type not null,
  voted_by uuid not null references public.users(id) on delete cascade,
  value integer not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  constraint votes_unique_target unique (target_id, voted_by, target_type)
);

create index if not exists votes_voted_by_idx on public.votes (voted_by, created_at desc);

create table if not exists public.project_rooms (
  id uuid primary key default gen_random_uuid(),
  origin_node_id uuid not null references public.nodes(id) on delete cascade,
  opened_by uuid not null references public.users(id) on delete cascade,
  title text not null,
  direction text,
  opening_question text,
  roles_needed text[] not null default '{}',
  status public.room_status not null default 'open',
  contributor_ids uuid[] not null default '{}',
  build_log jsonb not null default '[]'::jsonb,
  external_url text,
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now()
);

create index if not exists project_rooms_origin_idx on public.project_rooms (origin_node_id, created_at desc);

create table if not exists public.evolution_log (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  next_run_at timestamptz,
  nodes_seeded integer not null default 0,
  edges_created integer not null default 0,
  nodes_resurfaced integer not null default 0,
  prompts_generated integer not null default 0
);

create index if not exists evolution_log_ran_at_idx on public.evolution_log (ran_at desc);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes(id) on delete cascade,
  reported_by uuid not null references public.users(id) on delete cascade,
  reason text,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint reports_unique_reporter unique (node_id, reported_by)
);

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, anon_session_id, email)
  values (new.id, gen_random_uuid(), new.email)
  on conflict (id) do update
  set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

create or replace function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email on auth.users
  for each row execute procedure public.sync_auth_user_email();

create or replace function public.bump_contribution_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.submitted_by is not null and new.origin = 'human' then
    update public.users
    set contribution_count = contribution_count + 1
    where id = new.submitted_by;
  elsif tg_op = 'DELETE' and old.submitted_by is not null and old.origin = 'human' then
    update public.users
    set contribution_count = greatest(contribution_count - 1, 0)
    where id = old.submitted_by;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists on_node_contribution_change on public.nodes;
create trigger on_node_contribution_change
  after insert or delete on public.nodes
  for each row execute procedure public.bump_contribution_count();

create or replace function public.update_node_embedding(node_id uuid, embedding_vector vector(1536))
returns void
language sql
security definer
set search_path = public
as $$
  update public.nodes
  set embedding = embedding_vector
  where id = node_id;
$$;

create or replace function public.find_similar_nodes(
  query_embedding vector(1536),
  match_threshold double precision,
  match_count integer,
  exclude_id uuid
)
returns table (
  id uuid,
  content text,
  lab public.lab_id,
  similarity double precision
)
language sql
stable
set search_path = public
as $$
  select
    nodes.id,
    nodes.content,
    nodes.lab,
    1 - (nodes.embedding <=> query_embedding) as similarity
  from public.nodes
  where nodes.embedding is not null
    and nodes.id <> exclude_id
    and nodes.status = 'active'
    and nodes.moderation_status = 'visible'
    and 1 - (nodes.embedding <=> query_embedding) >= match_threshold
  order by nodes.embedding <=> query_embedding
  limit match_count;
$$;

create index if not exists nodes_embedding_idx
on public.nodes
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

alter table public.users enable row level security;
alter table public.nodes enable row level security;
alter table public.edges enable row level security;
alter table public.votes enable row level security;
alter table public.prompts enable row level security;
alter table public.project_rooms enable row level security;
alter table public.evolution_log enable row level security;
alter table public.reports enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own"
on public.users
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "nodes_public_read" on public.nodes;
create policy "nodes_public_read"
on public.nodes
for select
to anon, authenticated
using (moderation_status = 'visible');

drop policy if exists "edges_public_read" on public.edges;
create policy "edges_public_read"
on public.edges
for select
to anon, authenticated
using (true);

drop policy if exists "prompts_public_read" on public.prompts;
create policy "prompts_public_read"
on public.prompts
for select
to anon, authenticated
using (status <> 'archived');

drop policy if exists "project_rooms_public_read" on public.project_rooms;
create policy "project_rooms_public_read"
on public.project_rooms
for select
to anon, authenticated
using (true);

drop policy if exists "evolution_log_public_read" on public.evolution_log;
create policy "evolution_log_public_read"
on public.evolution_log
for select
to anon, authenticated
using (true);

drop policy if exists "votes_select_own" on public.votes;
create policy "votes_select_own"
on public.votes
for select
to authenticated
using (auth.uid() = voted_by);

drop policy if exists "reports_select_own" on public.reports;
create policy "reports_select_own"
on public.reports
for select
to authenticated
using (auth.uid() = reported_by);
