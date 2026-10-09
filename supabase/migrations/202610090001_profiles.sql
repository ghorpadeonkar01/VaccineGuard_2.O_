-- Trusted application roles. Only a trusted provisioning process may write rows.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'user', 'checkpoint')),
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

-- No authenticated INSERT/UPDATE/DELETE policies are intentionally defined.
-- Provision identities and roles from the trusted local seeder/Admin API.
