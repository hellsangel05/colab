create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_email text;
begin
  safe_email := new.email;

  if safe_email is not null and exists (
    select 1
    from public.users
    where lower(email) = lower(safe_email)
      and id <> new.id
  ) then
    safe_email := null;
  end if;

  insert into public.users (id, anon_session_id, email)
  values (new.id, gen_random_uuid(), safe_email)
  on conflict (id) do update
  set email = coalesce(excluded.email, public.users.email);

  return new;
end;
$$;

create or replace function public.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null then
    update public.users
    set email = null
    where id = new.id;

    return new;
  end if;

  if exists (
    select 1
    from public.users
    where lower(email) = lower(new.email)
      and id <> new.id
  ) then
    return new;
  end if;

  update public.users
  set email = new.email
  where id = new.id;

  return new;
end;
$$;
