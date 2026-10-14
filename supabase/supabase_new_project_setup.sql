-- ==============================================================================
-- VaccineGuard - Complete Schema & Setup Script for New Supabase Project
-- ==============================================================================
-- INSTRUCTIONS FOR USER:
-- 1. Open your NEW Supabase Project dashboard (https://supabase.com/dashboard).
-- 2. Click on "SQL Editor" on the left navigation sidebar.
-- 3. Click "New Query" (or the "+" button).
-- 4. Paste this ENTIRE file into the editor.
-- 5. Click "Run" (green button in bottom right).
-- ==============================================================================

-- 1. CHECKPOINTS TABLE
create table if not exists public.checkpoints (
  id serial primary key,
  name text not null,
  address text,
  latitude double precision not null,
  longitude double precision not null,
  is_active boolean not null default true,
  cold_storage_available boolean not null default true,
  alert_trigger boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. PROFILES TABLE (Bound to Supabase auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'sender_receiver', 'transporter', 'checkpoint')),
  display_name text not null,
  checkpoint_id integer references public.checkpoints(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. SHIPMENTS TABLE
create table if not exists public.shipments (
  id bigserial,
  shipment_id text primary key,
  vaccine_name text not null,
  batch_number text,
  initial_quantity integer default 5000,
  min_safe_temp_c numeric default 2.0,
  max_safe_temp_c numeric default 8.0,
  status text not null default 'safe',
  source_mode text not null default 'hardware',
  origin_location text default 'Pune (Hadapsar Hub)',
  origin_lat numeric default 18.5018,
  origin_lng numeric default 73.9357,
  destination_location text default 'Nanded District Hospital Hub (CP-05)',
  destination_lat numeric default 19.1383,
  destination_lng numeric default 77.3210,
  latest_temp_c numeric,
  latest_humidity_pct numeric,
  latest_lat numeric,
  latest_lng numeric,
  hardware_device_id text,
  hardware_private boolean not null default false,
  sender_id uuid references public.profiles(id) on delete set null,
  receiver_id uuid references public.profiles(id) on delete set null,
  transporter_id uuid references public.profiles(id) on delete set null,
  checkpoint_id integer references public.checkpoints(id) on delete set null,
  delivered_at timestamptz,
  last_reading_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists shipments_hardware_device_idx
  on public.shipments(hardware_device_id) where hardware_device_id is not null;
create index if not exists shipments_sender_id_idx on public.shipments(sender_id);
create index if not exists shipments_receiver_id_idx on public.shipments(receiver_id);
create index if not exists shipments_transporter_id_idx on public.shipments(transporter_id);

-- 4. TELEMETRY READINGS TABLE
create table if not exists public.telemetry_readings (
  id bigserial primary key,
  shipment_id text references public.shipments(shipment_id) on delete cascade,
  device_id text,
  temperature_c numeric not null,
  humidity_pct numeric,
  latitude numeric,
  longitude numeric,
  source_mode text default 'hardware',
  sensor_type text default 'DS18B20',
  recorded_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create index if not exists telemetry_shipment_id_idx on public.telemetry_readings(shipment_id);
create index if not exists telemetry_recorded_at_idx on public.telemetry_readings(recorded_at desc);

-- 5. ALERTS TABLE
create table if not exists public.alerts (
  id bigserial primary key,
  shipment_id text references public.shipments(shipment_id) on delete cascade,
  checkpoint_id integer references public.checkpoints(id) on delete set null,
  checkpoint_name text,
  vaccine_name text,
  alert_type text default 'TEMPERATURE_EXCURSION',
  severity text default 'critical',
  message text not null,
  recommendation text,
  observed_temp_c numeric,
  location_lat numeric,
  location_lng numeric,
  checkpoint_distance_km numeric,
  status text not null default 'open',
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  actor_name text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists alerts_checkpoint_id_idx on public.alerts(checkpoint_id);
create index if not exists alerts_shipment_id_idx on public.alerts(shipment_id);

-- 6. AUDIT / EVENT LOG TABLES
create table if not exists public.shipment_events (
  id bigserial primary key,
  shipment_id text,
  event_type text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.excursions (
  id bigserial primary key,
  shipment_id text,
  start_time timestamptz,
  end_time timestamptz,
  peak_temp_c numeric,
  created_at timestamptz not null default now()
);

-- ==============================================================================
-- 7. STORED PROCEDURES & FUNCTIONS
-- ==============================================================================

create or replace function public.is_checkpoint_assigned_to_shipment(target_shipment_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.alerts a join public.profiles p on p.checkpoint_id = a.checkpoint_id
    where a.shipment_id = target_shipment_id and p.id = (select auth.uid()) and p.role = 'checkpoint'
  );
$$;

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

-- ==============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

alter table public.checkpoints enable row level security;
alter table public.profiles enable row level security;
alter table public.shipments enable row level security;
alter table public.telemetry_readings enable row level security;
alter table public.alerts enable row level security;

-- Grants
grant select on public.checkpoints to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, delete on public.shipments to authenticated;
grant update (status, latest_temp_c, latest_humidity_pct, latest_lat, latest_lng, source_mode, last_reading_at)
  on public.shipments to authenticated;
grant select on public.telemetry_readings to authenticated;
grant select on public.alerts to authenticated;
grant update (status, acknowledged_at, resolved_at, actor_name, note) on public.alerts to authenticated;

-- Policies for Checkpoints
drop policy if exists "Checkpoints visible to all" on public.checkpoints;
create policy "Checkpoints visible to all" on public.checkpoints for select using (true);

-- Policies for Profiles
drop policy if exists "Profiles are visible to signed-in users" on public.profiles;
create policy "Profiles are visible to signed-in users"
  on public.profiles for select to authenticated using (true);

-- Policies for Shipments
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

drop policy if exists "shipment_delete_by_admin" on public.shipments;
create policy "shipment_delete_by_admin" on public.shipments for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin'));

-- Policies for Telemetry Readings
drop policy if exists "telemetry_read_by_shipment_parties" on public.telemetry_readings;
create policy "telemetry_read_by_shipment_parties" on public.telemetry_readings
for select to authenticated using (
  exists (select 1 from public.shipments s where s.shipment_id = telemetry_readings.shipment_id
    and (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'admin')
      or s.sender_id = (select auth.uid()) or s.receiver_id = (select auth.uid())
      or (not s.hardware_private and s.transporter_id = (select auth.uid()))
      or (not s.hardware_private and public.is_checkpoint_assigned_to_shipment(s.shipment_id))))
);

-- Policies for Alerts
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

-- ==============================================================================
-- 9. REALTIME BROADCAST CONFIGURATION
-- ==============================================================================

do $$
begin
  begin
    alter publication supabase_realtime add table public.shipments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.telemetry_readings;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.alerts;
  exception when duplicate_object then null;
  end;
end;
$$;

-- ==============================================================================
-- 10. SEED DATA: PUNE -> NANDED CORRIDOR CHECKPOINTS
-- ==============================================================================

insert into public.checkpoints (id, name, address, latitude, longitude, is_active, cold_storage_available, alert_trigger)
values
  (1, 'Hadapsar Cold Store Hub', 'Hadapsar Mega Cold Chain Terminal, Pune, Maharashtra', 18.5018, 73.9357, true, true, true),
  (2, 'Pune Central Hospital Hub', 'Shivajinagar District Medical Center, Pune, Maharashtra', 18.5204, 73.8567, true, true, true),
  (3, 'SKNCOE Medical Centre Hub', 'Vadgaon Budruk Regional Centre, Pune, Maharashtra', 18.4529, 73.8674, true, true, true),
  (7, 'Ahmednagar Cold Depot (CP-02)', 'MIDC Industrial Area Phase II, Ahmednagar, Maharashtra', 19.0952, 74.7496, true, true, true),
  (8, 'Beed Regional Vaccine Hub (CP-03)', 'Civil Hospital Complex, Beed, Maharashtra', 18.9894, 75.7601, true, true, true),
  (9, 'Parbhani Transit Cold Hub (CP-04)', 'Station Road Medical Storage, Parbhani, Maharashtra', 19.2612, 76.7749, true, true, true),
  (10, 'Nanded District Hospital Hub (CP-05)', 'Vazirabad Central Medical Depot, Nanded, Maharashtra', 19.1383, 77.3210, true, true, true)
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  is_active = excluded.is_active,
  cold_storage_available = excluded.cold_storage_available,
  alert_trigger = excluded.alert_trigger;

-- Adjust sequence for checkpoints so future inserts work seamlessly
select setval('checkpoints_id_seq', (select max(id) from public.checkpoints));

-- ==============================================================================
-- 11. SEED DATA: PRIMARY DEMO SHIPMENTS
-- ==============================================================================

insert into public.shipments (
  shipment_id, vaccine_name, batch_number, initial_quantity,
  min_safe_temp_c, max_safe_temp_c, status, source_mode,
  origin_location, origin_lat, origin_lng,
  destination_location, destination_lat, destination_lng,
  latest_temp_c, latest_humidity_pct, latest_lat, latest_lng,
  hardware_device_id, hardware_private, checkpoint_id
) values
(
  'VAC-104', 'Covaccine (Batch VAC-104)', 'COV-2026-B89', 5000,
  2.0, 8.0, 'critical', 'hardware',
  'Hadapsar Cold Store Hub, Pune', 18.5018, 73.9357,
  'Nanded District Hospital Hub (CP-05)', 19.1383, 77.3210,
  28.8, 75.8, 18.9894, 75.7601,
  'ESP32-CC-001', false, 8
),
(
  'VAC-102', 'Polio OPV (Batch VAC-102)', 'OPV-2026-M41', 3500,
  2.0, 8.0, 'safe', 'hardware',
  'Hadapsar Cold Store Hub, Pune', 18.5018, 73.9357,
  'Ahmednagar Cold Depot (CP-02)', 19.0952, 74.7496,
  4.2, 62.0, 18.8256, 74.3789,
  'ESP32-CC-002', false, 7
)
on conflict (shipment_id) do update set
  vaccine_name = excluded.vaccine_name,
  status = excluded.status,
  latest_temp_c = excluded.latest_temp_c,
  latest_humidity_pct = excluded.latest_humidity_pct,
  latest_lat = excluded.latest_lat,
  latest_lng = excluded.latest_lng,
  hardware_device_id = excluded.hardware_device_id;

-- Seed an active demonstration alert for VAC-104
insert into public.alerts (
  shipment_id, checkpoint_id, checkpoint_name, vaccine_name,
  alert_type, severity, message, recommendation,
  observed_temp_c, location_lat, location_lng, checkpoint_distance_km, status
) values (
  'VAC-104', 8, 'Beed Regional Vaccine Hub (CP-03)', 'Covaccine (Batch VAC-104)',
  'CRITICAL_EXCURSION', 'critical',
  'CRITICAL: Covaccine shipment VAC-104 is at 28.8 °C; safe range is 2 to 8 °C. Autonomous rerouting dispatched to Beed Regional Vaccine Hub.',
  'Immediately divert fleet transport to Beed Regional Vaccine Hub for rapid cryo-stabilization and cold room transfer.',
  28.8, 18.9894, 75.7601, 12.4, 'open'
)
on conflict do nothing;

-- ==============================================================================
-- DONE!
-- After running this SQL, run the Python setup script to provision the 4 demo
-- accounts with password Password@123:
--   python3 scripts/setup_new_supabase.py
-- ==============================================================================
