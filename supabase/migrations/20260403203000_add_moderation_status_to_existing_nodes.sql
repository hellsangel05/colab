do $$
begin
  if not exists (select 1 from pg_type where typname = 'moderation_status') then
    create type public.moderation_status as enum ('visible', 'flagged', 'hidden');
  end if;
end $$;

alter table public.nodes
add column if not exists moderation_status public.moderation_status;

update public.nodes
set moderation_status = 'visible'
where moderation_status is null;

alter table public.nodes
alter column moderation_status set default 'visible';

alter table public.nodes
alter column moderation_status set not null;

create index if not exists nodes_moderation_status_idx
on public.nodes (moderation_status);

drop policy if exists "nodes_public_read" on public.nodes;
create policy "nodes_public_read"
on public.nodes
for select
to anon, authenticated
using (moderation_status = 'visible');
