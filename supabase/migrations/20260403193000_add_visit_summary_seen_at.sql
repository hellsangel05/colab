alter table public.users
add column if not exists last_visit_summary_seen_at timestamptz not null default now();
