-- WiFi Pay production schema hardening
-- Safe to apply to an existing project: objects/columns are created only when missing.

create extension if not exists pgcrypto;

do $$
begin
  create type public.payment_status as enum ('pending', 'completed', 'failed', 'expired');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.session_status as enum ('pending', 'active', 'expired', 'terminated');
exception when duplicate_object then null;
end $$;

alter type public.session_status add value if not exists 'pending';

create table if not exists public.access_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes > 0),
  price numeric(10,2) not null check (price > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.user_sessions (
  id uuid primary key default gen_random_uuid(),
  mac_address text not null,
  phone_number text not null,
  status public.session_status not null default 'pending',
  network_status text not null default 'pending',
  expires_at timestamptz,
  ip_address inet,
  payment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.user_sessions(id) on delete cascade,
  package_id uuid references public.access_packages(id) on delete set null,
  phone_number text not null,
  amount numeric(10,2) not null check (amount > 0),
  status public.payment_status not null default 'pending',
  mpesa_checkout_request_id text,
  mpesa_receipt_number text,
  reconnection_code text,
  reconnection_code_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  package_id uuid not null references public.access_packages(id) on delete restrict,
  status text not null default 'unused',
  session_id uuid references public.user_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

alter table public.user_sessions add column if not exists network_status text not null default 'pending';
alter table public.user_sessions add column if not exists payment_id uuid;
alter table public.user_sessions add column if not exists updated_at timestamptz not null default now();
alter table public.payments add column if not exists package_id uuid;
alter table public.payments add column if not exists reconnection_code text;
alter table public.payments add column if not exists reconnection_code_used boolean not null default false;
alter table public.payments add column if not exists updated_at timestamptz not null default now();
alter table public.vouchers add column if not exists session_id uuid;
alter table public.vouchers add column if not exists used_at timestamptz;

-- Add missing foreign keys without duplicating existing constraints.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_package_id_fkey') then
    alter table public.payments add constraint payments_package_id_fkey foreign key (package_id) references public.access_packages(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'user_sessions_payment_id_fkey') then
    alter table public.user_sessions add constraint user_sessions_payment_id_fkey foreign key (payment_id) references public.payments(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vouchers_session_id_fkey') then
    alter table public.vouchers add constraint vouchers_session_id_fkey foreign key (session_id) references public.user_sessions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wifi_pay_network_status_check') then
    alter table public.user_sessions add constraint wifi_pay_network_status_check check (network_status in ('pending','active','failed','disconnected'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wifi_pay_voucher_status_check') then
    alter table public.vouchers add constraint wifi_pay_voucher_status_check check (status in ('unused','used','disabled'));
  end if;
end $$;

create unique index if not exists access_packages_name_unique on public.access_packages (lower(name));
create unique index if not exists vouchers_code_unique on public.vouchers (code);
create index if not exists user_sessions_mac_status_idx on public.user_sessions (mac_address, status, expires_at desc);
create index if not exists user_sessions_payment_id_idx on public.user_sessions (payment_id);
create index if not exists payments_session_status_idx on public.payments (session_id, status);
create index if not exists payments_checkout_request_idx on public.payments (mpesa_checkout_request_id);
create index if not exists payments_reconnection_code_idx on public.payments (reconnection_code) where reconnection_code is not null;
create index if not exists vouchers_session_status_idx on public.vouchers (session_id, status);

create or replace function public.set_wifi_pay_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_sessions_updated_at on public.user_sessions;
create trigger set_user_sessions_updated_at before update on public.user_sessions for each row execute function public.set_wifi_pay_updated_at();

drop trigger if exists set_payments_updated_at on public.payments;
create trigger set_payments_updated_at before update on public.payments for each row execute function public.set_wifi_pay_updated_at();

-- Existing active sessions predate network_status; preserve their current behavior.
update public.user_sessions set network_status = 'active' where status = 'active' and network_status = 'pending' and created_at < now() - interval '1 minute';

-- Sensitive records are accessed only through Edge Functions using the service role.
alter table public.access_packages enable row level security;
alter table public.user_sessions enable row level security;
alter table public.payments enable row level security;
alter table public.vouchers enable row level security;

do $$
declare p record;
begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('access_packages','user_sessions','payments','vouchers') loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

revoke all on public.user_sessions from anon, authenticated;
revoke all on public.payments from anon, authenticated;
revoke all on public.vouchers from anon, authenticated;
revoke all on public.access_packages from anon, authenticated;
grant select on public.access_packages to anon, authenticated;

create policy "public can read active wifi packages"
on public.access_packages
for select
to anon, authenticated
using (is_active = true);
