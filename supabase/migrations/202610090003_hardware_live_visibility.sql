-- Bind a live hardware feed to one shipment and limit it to its two parties
-- and administrators. Other shipment visibility remains governed by 002.
alter table public.shipments
  add column if not exists hardware_private boolean not null default false,
  add column if not exists hardware_device_id text;

create index if not exists shipments_hardware_device_idx
  on public.shipments(hardware_device_id) where hardware_device_id is not null;

-- Avoid an older permissive policy being OR-combined with these policies.
do $$
declare policy_row record;
begin
  for policy_row in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('shipments', 'alerts')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end;
$$;

drop policy if exists "shipment_read_by_role" on public.shipments;
create policy "shipment_read_by_role" on public.shipments for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or sender_id = (select auth.uid())
  or receiver_id = (select auth.uid())
  or (not hardware_private and (
    transporter_id = (select auth.uid())
    or public.is_checkpoint_assigned_to_shipment(shipments.shipment_id)
  ))
);
create policy "shipment_delete_by_admin" on public.shipments for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

drop policy if exists "shipment_insert_by_role" on public.shipments;
create policy "shipment_insert_by_role" on public.shipments for insert to authenticated
with check (
  (sender_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'sender_receiver'
  ) and (not hardware_private or (
    receiver_id is not null and hardware_device_id is not null and length(trim(hardware_device_id)) > 0
  )))
  or exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
);

drop policy if exists "shipment_update_by_role" on public.shipments;
create policy "shipment_update_by_role" on public.shipments for update to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or (not hardware_private and transporter_id = (select auth.uid()))
)
with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or (not hardware_private and transporter_id = (select auth.uid()))
);

drop policy if exists "alerts_read_by_role" on public.alerts;
create policy "alerts_read_by_role" on public.alerts for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or exists (select 1 from public.shipments s where s.shipment_id = alerts.shipment_id
    and (s.sender_id = (select auth.uid()) or s.receiver_id = (select auth.uid())))
  or exists (select 1 from public.shipments s where s.shipment_id = alerts.shipment_id
    and not s.hardware_private and s.transporter_id = (select auth.uid()))
  or (exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.role = 'checkpoint' and p.checkpoint_id = alerts.checkpoint_id)
      and not exists (select 1 from public.shipments s where s.shipment_id = alerts.shipment_id and s.hardware_private))
);

drop policy if exists "alerts_update_by_checkpoint_or_admin" on public.alerts;
create policy "alerts_update_by_checkpoint_or_admin" on public.alerts for update to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or (exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.role = 'checkpoint' and p.checkpoint_id = alerts.checkpoint_id)
      and not exists (select 1 from public.shipments s where s.shipment_id = alerts.shipment_id and s.hardware_private))
)
with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or (exists (select 1 from public.profiles p where p.id = (select auth.uid())
      and p.role = 'checkpoint' and p.checkpoint_id = alerts.checkpoint_id)
      and not exists (select 1 from public.shipments s where s.shipment_id = alerts.shipment_id and s.hardware_private))
);

-- Remove any older permissive telemetry policies, then grant access only
-- when the parent shipment is visible under the same visibility rules.
alter table public.telemetry_readings enable row level security;
do $$
declare policy_row record;
begin
  for policy_row in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'telemetry_readings'
  loop
    execute format('drop policy %I on public.telemetry_readings', policy_row.policyname);
  end loop;
end;
$$;
create policy "telemetry_read_by_shipment_parties" on public.telemetry_readings
  for select to authenticated using (
    exists (select 1 from public.shipments s where s.shipment_id = telemetry_readings.shipment_id
      and (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
        or s.sender_id = (select auth.uid()) or s.receiver_id = (select auth.uid())
        or (not s.hardware_private and s.transporter_id = (select auth.uid()))
        or (not s.hardware_private and public.is_checkpoint_assigned_to_shipment(s.shipment_id))))
  );
grant select on public.telemetry_readings to authenticated;
revoke insert, update, delete on public.telemetry_readings from anon, authenticated;

