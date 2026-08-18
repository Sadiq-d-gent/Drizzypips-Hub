-- 003_create_payment_settings.sql
--
-- Phase 3: configuration for the manual payment step.
--
-- Split into two tables on purpose, because they have opposite audiences:
--
--   public.payment_settings — bank details the student must be shown in order to pay.
--                             Readable by anon. Contains nothing secret; publishing an
--                             account number is the entire point of a bank transfer.
--
--   public.admin_settings   — operational configuration (notification address, review
--                             SLA copy, feature switches). Admin-only, never sent to
--                             an anonymous client.
--
-- Keeping them apart means the public read policy can stay a flat `using (true)` on a
-- table that holds only publishable fields, rather than a column-filtered view over a
-- mixed table that a future column would silently widen.

create table if not exists public.payment_settings (
  id uuid primary key default gen_random_uuid(),

  bank_name text not null,
  account_name text not null,
  account_number text not null,
  -- Free-form: sort code, IBAN, routing number and branch all vary by country, and
  -- modelling each one would add columns nobody outside a single market would fill.
  additional_details text,

  -- Currency the displayed account actually accepts. Rendered next to the course
  -- price so a mismatch is visible to the student rather than discovered at the bank.
  currency text not null default 'NGN',

  payment_instructions text not null,
  -- Shown on the payment step: "we review within N hours". Copy, not a guarantee
  -- enforced anywhere in code.
  review_window_hours integer not null default 24
    check (review_window_hours > 0 and review_window_hours <= 336),

  -- Support contact for the WhatsApp handoff. Nullable: the frontend falls back to
  -- the compiled-in support number when this is unset, so the payment step never
  -- breaks because a row has not been filled in yet.
  support_whatsapp_number text,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Singleton by construction: at most one active configuration can exist, so the
-- frontend's "read the active row" query cannot become ambiguous. Inactive history
-- rows are allowed and unconstrained.
create unique index if not exists payment_settings_single_active_idx
  on public.payment_settings (is_active)
  where is_active = true;

drop trigger if exists payment_settings_set_updated_at on public.payment_settings;

create trigger payment_settings_set_updated_at
before update on public.payment_settings
for each row
execute function public.set_updated_at();

comment on table public.payment_settings is
  'Bank transfer details displayed on the enrollment payment step. Publicly readable '
  'by design — a student cannot pay without them. Exactly one row may be active.';

create table if not exists public.admin_settings (
  -- Fixed primary key rather than a generated uuid: this table holds exactly one row,
  -- and a constant key makes "upsert the settings" a plain `on conflict (id)` instead
  -- of an index over a constant expression.
  id boolean primary key default true check (id),

  -- Where new-enrollment notifications should go once notifications are built.
  -- Phase 3 stores the address; nothing sends mail yet.
  notification_email text,
  -- Kill switch for the enrollment form, so enrollments can be paused without a deploy.
  enrollment_enabled boolean not null default true,
  enrollment_paused_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The `id boolean primary key check (id)` above already makes this a singleton: the
-- only value the check permits is true, and the primary key permits it once.

drop trigger if exists admin_settings_set_updated_at on public.admin_settings;

create trigger admin_settings_set_updated_at
before update on public.admin_settings
for each row
execute function public.set_updated_at();

comment on table public.admin_settings is
  'Operational configuration for the future admin panel. Admin-only: never exposed to '
  'anonymous clients. Constrained to a single row by its boolean primary key.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.payment_settings enable row level security;
alter table public.admin_settings enable row level security;

-- Students may read the active payment configuration and nothing else. Inactive rows
-- stay hidden so superseded account numbers are not still being handed out.
drop policy if exists "Public can read active payment settings" on public.payment_settings;
create policy "Public can read active payment settings"
on public.payment_settings
for select
to anon, authenticated
using (is_active = true);

drop policy if exists "Admins can read payment settings" on public.payment_settings;
create policy "Admins can read payment settings"
on public.payment_settings
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert payment settings" on public.payment_settings;
create policy "Admins can insert payment settings"
on public.payment_settings
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update payment settings" on public.payment_settings;
create policy "Admins can update payment settings"
on public.payment_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete payment settings" on public.payment_settings;
create policy "Admins can delete payment settings"
on public.payment_settings
for delete
to authenticated
using (public.is_admin());

-- admin_settings has no anon policy at all, and privileges are revoked to match.
revoke all on public.admin_settings from anon;

drop policy if exists "Admins can read admin settings" on public.admin_settings;
create policy "Admins can read admin settings"
on public.admin_settings
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert admin settings" on public.admin_settings;
create policy "Admins can insert admin settings"
on public.admin_settings
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update admin settings" on public.admin_settings;
create policy "Admins can update admin settings"
on public.admin_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete admin settings" on public.admin_settings;
create policy "Admins can delete admin settings"
on public.admin_settings
for delete
to authenticated
using (public.is_admin());
