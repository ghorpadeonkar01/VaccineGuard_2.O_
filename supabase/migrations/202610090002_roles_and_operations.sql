-- Role based cold-chain workflows. Apply after 202610090001_profiles.sql.
alter table public.profiles drop constraint if exists profiles_role_check;
update public.profiles set role = 'sender_receiver' where role = 'user';
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'sender_receiver', 'transporter', 'checkpoint'));
alter table public.profiles add column if not exists checkpoint_id integer
  references public.checkpoints(id) on delete set null;

alter table public.shipments add column if not exists sender_id uuid
  references public.profiles(id) on delete set null;
alter table public.shipments add column if not exists receiver_id uuid
  references public.profiles(id) on delete set null;
alter table public.shipments add column if not exists transporter_id uuid
  references public.profiles(id) on delete set null;
alter table public.shipments add column if not exists delivered_at timestamptz;
alter table public.shipments add column if not exists checkpoint_id integer
  references public.checkpoints(id) on delete set null;
create index if not exists shipments_sender_id_idx on public.shipments(sender_id);
create index if not exists shipments_receiver_id_idx on public.shipments(receiver_id);
create index if not exists shipments_transporter_id_idx on public.shipments(transporter_id);
create index if not exists alerts_checkpoint_id_idx on public.alerts(checkpoint_id);

alter table public.profiles enable row level security;
alter table public.shipments enable row level security;
alter table public.alerts enable row level security;

-- Replace the temporary all-authenticated shipment policies used for setup.
drop policy if exists "Signed-in users can read shipments" on public.shipments;
drop policy if exists "Signed-in users can add shipments" on public.shipments;
drop policy if exists "shipment_read_by_role" on public.shipments;
drop policy if exists "shipment_insert_by_role" on public.shipments;
drop policy if exists "shipment_update_by_role" on public.shipments;
drop policy if exists "shipment_delete_by_admin" on public.shipments;

create or replace function public.is_checkpoint_assigned_to_shipment(target_shipment_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.alerts a join public.profiles p on p.checkpoint_id = a.checkpoint_id
    where a.shipment_id = target_shipment_id and p.id = (select auth.uid()) and p.role = 'checkpoint'
  );
$$;
revoke all on function public.is_checkpoint_assigned_to_shipment(text) from public, anon;
grant execute on function public.is_checkpoint_assigned_to_shipment(text) to authenticated;

drop policy if exists "Profiles are visible to signed-in users" on public.profiles;
create policy "Profiles are visible to signed-in users"
  on public.profiles for select to authenticated using (true);

create policy "shipment_read_by_role" on public.shipments for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or sender_id = (select auth.uid())
  or receiver_id = (select auth.uid())
  or transporter_id = (select auth.uid())
  or public.is_checkpoint_assigned_to_shipment(shipments.shipment_id)
);
create policy "shipment_insert_by_role" on public.shipments for insert to authenticated
with check (
  (sender_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'sender_receiver'))
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);
create policy "shipment_update_by_role" on public.shipments for update to authenticated
using (
  transporter_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
)
with check (
  transporter_id = (select auth.uid())
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);
create policy "shipment_delete_by_admin" on public.shipments for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

create or replace function public.receive_shipment(target_shipment_id text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.shipments
    set status = 'delivered', delivered_at = now()
    where shipment_id = target_shipment_id and receiver_id = (select auth.uid())
      and delivered_at is null;
  if not found then raise exception 'Shipment not found or not assigned to this receiver'; end if;
end;
$$;
revoke all on function public.receive_shipment(text) from public, anon;
grant execute on function public.receive_shipment(text) to authenticated;

create or replace function public.admin_delete_shipment(target_shipment_id text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin') then
    raise exception 'Administrator access required';
  end if;
  delete from public.shipment_events where shipment_id = target_shipment_id;
  delete from public.alerts where shipment_id = target_shipment_id;
  delete from public.excursions where shipment_id = target_shipment_id;
  delete from public.telemetry_readings where shipment_id = target_shipment_id;
  delete from public.shipments where shipment_id = target_shipment_id;
end;
$$;
revoke all on function public.admin_delete_shipment(text) from public, anon;
grant execute on function public.admin_delete_shipment(text) to authenticated;

drop policy if exists "alerts_read_by_role" on public.alerts;
drop policy if exists "alerts_update_by_checkpoint_or_admin" on public.alerts;
create policy "alerts_read_by_role" on public.alerts for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or exists (select 1 from public.shipments s where s.shipment_id = alerts.shipment_id
             and (s.sender_id = (select auth.uid()) or s.receiver_id = (select auth.uid()) or s.transporter_id = (select auth.uid())))
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'checkpoint' and p.checkpoint_id = alerts.checkpoint_id)
);
create policy "alerts_update_by_checkpoint_or_admin" on public.alerts for update to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'checkpoint' and p.checkpoint_id = alerts.checkpoint_id)
)
with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'checkpoint' and p.checkpoint_id = alerts.checkpoint_id)
);

grant select on public.profiles to authenticated;
grant select on public.checkpoints to authenticated;
drop policy if exists "Signed-in users can view checkpoints" on public.checkpoints;
create policy "Signed-in users can view checkpoints" on public.checkpoints
  for select to authenticated using (true);
grant select, insert, delete on public.shipments to authenticated;
grant update (status, latest_temp_c, latest_humidity_pct, latest_lat, latest_lng, source_mode, last_reading_at)
  on public.shipments to authenticated;
grant select on public.alerts to authenticated;
grant update (status, acknowledged_at, resolved_at, actor_name, note) on public.alerts to authenticated;
