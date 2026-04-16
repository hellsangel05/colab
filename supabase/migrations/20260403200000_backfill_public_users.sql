insert into public.users (id, email)
select auth_users.id, auth_users.email
from auth.users as auth_users
left join public.users as public_users
  on public_users.id = auth_users.id
where public_users.id is null
on conflict (id) do nothing;
