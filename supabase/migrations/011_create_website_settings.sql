-- 011_create_website_settings.sql
--
-- Phase 6: public site copy and outbound links, editable without a deploy.
--
-- Until now the hero headline, the hero stats, the Telegram invite, the broker affiliate
-- link, the social handles, the contact address and the footer text were compiled into
-- src/lib/constants/homepage.ts and src/components/Layout/Footer.tsx. Changing a Telegram
-- link meant a code change, a build and a redeploy.
--
-- A third settings table rather than columns on admin_settings
-- -----------------------------------------------------------
-- 003 states the rule this follows, in its own words: keeping publishable fields in their
-- own table means "the public read policy can stay a flat `using (true)` on a table that
-- holds only publishable fields, rather than a column-filtered view over a mixed table
-- that a future column would silently widen." admin_settings is the opposite audience —
-- it carries notification_email and has `revoke all ... from anon` — so adding public
-- copy to it would mean either exposing that table to anon or reading site copy through
-- an admin-only path. Neither is acceptable.
--
-- A plain SELECT policy rather than a SECURITY DEFINER RPC
-- -------------------------------------------------------
-- Every column here is content that is printed on a public page. There is no field to
-- withhold, so the narrowing-RPC pattern that get_enrollment_availability uses (to expose
-- enrollment_enabled without exposing notification_email) would be ceremony guarding
-- nothing. If a future column is ever NOT publishable, it does not belong in this table.
--
-- Every content column is nullable, and the seeded row is empty
-- ------------------------------------------------------------
-- Same reasoning 003 gives for payment_settings.support_whatsapp_number: "the frontend
-- falls back to the compiled-in support number when this is unset." Here that applies to
-- every field. The compiled-in copy in homepage.ts stays the single source of truth for
-- each default, the admin form shows it as a placeholder, and null means "use the site
-- default" rather than "render nothing". Three consequences worth stating: re-applying
-- this migration cannot clobber an admin's edits, a partially filled row is valid, and a
-- dropped table or a failed query degrades the site to today's copy instead of blanking
-- the hero.
--
-- The URL columns carry check constraints
-- ---------------------------------------
-- These five values flow straight into an <a href>. An admin-authored or mistyped
-- `javascript:` value is an XSS vector, and client-side validation alone does not close
-- it — anything holding a valid admin session can write to this table directly through
-- PostgREST. The constraint is the server-side half; the Zod schema is the courtesy half.
-- Text columns get no length check, matching admin_settings.enrollment_paused_message,
-- which has none either; length is capped in Zod.
--
-- contact_email is deliberately unconstrained here: the frontend builds `mailto:${value}`,
-- so the scheme is fixed by our code rather than by the stored value, and an email regex
-- in SQL is a rule the rest of this schema does not have.

create table if not exists public.website_settings (
  -- Same idiom as admin_settings (003:69-72): this table holds exactly one row, and a
  -- constant key makes "upsert the settings" a plain `on conflict (id)` instead of an
  -- index over a constant expression.
  id boolean primary key default true check (id),

  hero_title text,
  hero_subtitle text,

  -- Three fixed stat slots rather than a jsonb array. The hero renders exactly three
  -- figures, the admin form needs a labelled input per field, and flat columns keep both
  -- the Zod schema and the generated types honest about that.
  hero_stat_1_value text,
  hero_stat_1_label text,
  hero_stat_2_value text,
  hero_stat_2_label text,
  hero_stat_3_value text,
  hero_stat_3_label text,

  telegram_url text
    check (telegram_url is null or telegram_url ~* '^https?://'),
  -- Its own column, not a reuse of telegram_url. The signals page currently links to the
  -- general Telegram community only because no distinct signal-group link exists; this
  -- lets the two diverge without a deploy, and the frontend falls back to telegram_url
  -- while it is unset.
  signal_group_url text
    check (signal_group_url is null or signal_group_url ~* '^https?://'),

  broker_name text,
  broker_description text,
  broker_url text
    check (broker_url is null or broker_url ~* '^https?://'),

  -- Instagram and TikTok only: those are the two link-based socials the footer renders.
  -- WhatsApp comes from payment_settings.support_whatsapp_number, which is already
  -- editable and must not gain a second source of truth. Telegram is telegram_url above.
  instagram_url text
    check (instagram_url is null or instagram_url ~* '^https?://'),
  tiktok_url text
    check (tiktok_url is null or tiktok_url ~* '^https?://'),
  contact_email text,

  footer_tagline text,
  footer_copyright text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists website_settings_set_updated_at on public.website_settings;

create trigger website_settings_set_updated_at
before update on public.website_settings
for each row
execute function public.set_updated_at();

comment on table public.website_settings is
  'Public marketing copy and outbound links for the landing page, the community pages and '
  'the footer. Publicly readable by design — every column is printed on a public page. '
  'Constrained to a single row by its boolean primary key. Every content column is '
  'nullable and null means "use the compiled-in default".';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.website_settings enable row level security;

drop policy if exists "Public can read website settings" on public.website_settings;
create policy "Public can read website settings"
on public.website_settings
for select
to anon, authenticated
using (true);

-- No separate admin SELECT policy, and that is deliberate rather than an omission.
-- payment_settings needs one because its public read is `using (is_active = true)`, so an
-- admin editing an inactive row would otherwise not be able to see it. Here the public
-- read is `using (true)` and is granted to authenticated as well as anon; policies are
-- OR'd, so an admin already reads the row through the policy above. A fourth policy would
-- be dead weight that a future reader would have to reason about.

drop policy if exists "Admins can insert website settings" on public.website_settings;
create policy "Admins can insert website settings"
on public.website_settings
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update website settings" on public.website_settings;
create policy "Admins can update website settings"
on public.website_settings
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete website settings" on public.website_settings;
create policy "Admins can delete website settings"
on public.website_settings
for delete
to authenticated
using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------

-- One empty row, so the admin form has something to update and the public read has
-- something to return. Every content column stays null, which the frontend resolves to
-- the compiled-in copy. `on conflict do nothing` is what makes re-applying this file
-- safe: it can never overwrite an edit.
insert into public.website_settings (id)
values (true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- VERIFICATION (run manually; not executed as part of the migration)
-- ---------------------------------------------------------------------------
--
-- select jsonb_pretty(jsonb_build_object(
--   'rls_enabled', (
--     select relrowsecurity from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     where n.nspname = 'public' and c.relname = 'website_settings'
--   ),
--   'columns', (
--     select jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type,
--                                         'nullable', is_nullable)
--                      order by ordinal_position)
--     from information_schema.columns
--     where table_schema = 'public' and table_name = 'website_settings'
--   ),
--   'checks', (
--     select jsonb_agg(jsonb_build_object('name', conname,
--                                         'def', pg_get_constraintdef(oid))
--                      order by conname)
--     from pg_constraint
--     where conrelid = 'public.website_settings'::regclass and contype = 'c'
--   ),
--   'policies', (
--     select jsonb_agg(jsonb_build_object('name', policyname, 'cmd', cmd,
--                                         'roles', roles, 'qual', qual,
--                                         'with_check', with_check)
--                      order by policyname)
--     from pg_policies
--     where schemaname = 'public' and tablename = 'website_settings'
--   ),
--   'triggers', (
--     select jsonb_agg(tgname order by tgname)
--     from pg_trigger
--     where tgrelid = 'public.website_settings'::regclass and not tgisinternal
--   ),
--   'grants', (
--     select jsonb_agg(distinct jsonb_build_object('grantee', grantee,
--                                                  'privilege', privilege_type))
--     from information_schema.role_table_grants
--     where table_schema = 'public' and table_name = 'website_settings'
--   ),
--   'row_count', (select count(*) from public.website_settings),
--   'row', (select to_jsonb(w) from public.website_settings w)
-- )) as post_state;
