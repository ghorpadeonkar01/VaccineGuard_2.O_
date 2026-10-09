-- Keep private shipment contents private while allowing the assigned checkpoint
-- manager to see and act on the alert addressed to that checkpoint.
alter table public.alerts
  add column if not exists vaccine_name text,
  add column if not exists observed_temp_c numeric,
  add column if not exists location_lat numeric,
  add column if not exists location_lng numeric,
  add column if not exists checkpoint_distance_km numeric;

drop policy if exists "alerts_read_by_role" on public.alerts;
create policy "alerts_read_by_role" on public.alerts for select to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or exists (select 1 from public.shipments s where s.shipment_id = alerts.shipment_id
    and (s.sender_id = (select auth.uid()) or s.receiver_id = (select auth.uid())))
  or exists (select 1 from public.shipments s where s.shipment_id = alerts.shipment_id
    and not s.hardware_private and s.transporter_id = (select auth.uid()))
  or exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.role = 'checkpoint' and p.checkpoint_id = alerts.checkpoint_id)
);

drop policy if exists "alerts_update_by_checkpoint_or_admin" on public.alerts;
create policy "alerts_update_by_checkpoint_or_admin" on public.alerts for update to authenticated
using (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.role = 'checkpoint' and p.checkpoint_id = alerts.checkpoint_id)
)
with check (
  exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
  or exists (select 1 from public.profiles p where p.id = (select auth.uid())
    and p.role = 'checkpoint' and p.checkpoint_id = alerts.checkpoint_id)
);

