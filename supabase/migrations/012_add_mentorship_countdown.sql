-- 012_add_mentorship_countdown.sql
--
-- A countdown to the next live mentorship session, in the homepage hero.
--
-- Three columns on website_settings rather than a table of its own
-- --------------------------------------------------------------
-- 011 states the rule that decides this: this table exists so "the public read policy can
-- stay a flat `using (true)` on a table that holds only publishable fields". A countdown
-- title and the moment a session starts are printed in the hero, so there is nothing here
-- to withhold — they belong in exactly this table, and a fourth settings table would mean a
-- second policy set, a second service, a second cache key and a second admin form for three
-- fields that are read by the same query as the eighteen already here.
--
-- One timestamptz rather than a `date` column and a `time` column
-- --------------------------------------------------------------
-- The admin edits a date and a time in two inputs, so storing two columns looks like the
-- closer match. It is the wrong model. A live session happens at one instant, and two
-- columns can only be interpreted in *the reader's* timezone — so a visitor in Lagos and one
-- in London would count down to different moments and the session would appear to start
-- twice. A timestamptz is one instant for everyone: whoever is watching, the countdown
-- reaches zero when the session actually begins.
--
-- The consequence to be honest about: the frontend builds this value from the date and time
-- as typed *in the administrator's own timezone*, and shows the stored moment back in that
-- timezone with its name, so the round trip is visible rather than assumed.
--
-- countdown_enabled is NOT NULL with a default of false
-- ----------------------------------------------------
-- Same shape as `admin_settings.enrollment_enabled` (003:78), and false rather than true for
-- the reason that column defaults to true: the safe default is the state the site is in
-- today. There is no session scheduled at the moment this migration runs, so a fresh or
-- re-applied database must render the hero exactly as it does now.
--
-- Note this is the one content column on this table that is not nullable, and therefore the
-- one where "unset" is `false` rather than NULL. That is not an inconsistency with 011's
-- "every content column is nullable, and null means use the site default" — a boolean switch
-- has no default to fall back to, it *is* the switch.
--
-- The two content columns are nullable, and null does NOT mean "use a default" for the date
-- ---------------------------------------------------------------------------------------
-- For `countdown_title` it does, exactly as for the eighteen columns in 011: the compiled-in
-- string in homepage.ts is the default, and the admin form shows it as the placeholder.
--
-- For `countdown_session_at` it deliberately does not. There is no sensible default for
-- "when is the next session" — a made-up date is worse than no countdown — so an unset
-- value means the hero renders nothing at all. resolveWebsiteSettings encodes that, which is
-- also what makes a dropped table or a failed query degrade to today's hero rather than to a
-- countdown to a fabricated moment.
--
-- One check constraint, and no format constraint
-- ---------------------------------------------
-- `check (not countdown_enabled or countdown_session_at is not null)` is a real invariant:
-- switched on with nothing to count to is a meaningless row. The Zod schema refuses it with
-- a sentence the administrator can act on, and this is the half that also holds for a write
-- that arrives straight through PostgREST. The frontend still fails safe if a row ever gets
-- into that state some other way — the resolver returns no countdown — so this constraint
-- prevents nonsense rather than preventing an XSS, which is why it is the only one here.
--
-- No range or format check on the timestamp itself, deliberately. The URL columns in 011 are
-- constrained because their values flow into an `<a href>` and a `javascript:` value is an
-- injection; this value flows into date arithmetic, and `timestamptz` already refuses
-- anything that is not a moment in time. A "must be in the future" check is also absent on
-- purpose: it would fire months after a session, blocking an administrator from saving an
-- unrelated footer edit, and a past moment already has a defined rendering — the hero shows
-- its "Session is starting" state. The form warns about it instead of refusing it.

alter table public.website_settings
  add column if not exists countdown_enabled boolean not null default false,
  add column if not exists countdown_title text,
  add column if not exists countdown_session_at timestamptz;

-- Separate statement, and guarded, because `add constraint` has no `if not exists`: without
-- the drop, re-applying this file would fail on the second run — which 011 goes out of its
-- way to make safe.
alter table public.website_settings
  drop constraint if exists website_settings_countdown_needs_session;

alter table public.website_settings
  add constraint website_settings_countdown_needs_session
  check (not countdown_enabled or countdown_session_at is not null);

comment on column public.website_settings.countdown_enabled is
  'Whether the homepage hero shows a countdown to the next live mentorship session. False '
  'means the hero renders exactly as it does with no countdown configured. Cannot be true '
  'while countdown_session_at is null.';

comment on column public.website_settings.countdown_title is
  'Heading above the countdown. Null means "use the compiled-in default", like every other '
  'nullable column on this table.';

comment on column public.website_settings.countdown_session_at is
  'The instant the next session starts. A timestamptz rather than a date and a time so that '
  'every visitor counts down to the same moment regardless of timezone. Null means there is '
  'no countdown to render — unlike the text columns, there is no default to fall back to.';

-- No trigger, policy, grant or seed change. 011 installed the set_updated_at() BEFORE UPDATE
-- trigger on this table and its four policies are per-command, not per-column, so all three
-- new columns are already publicly readable and already admin-only writable. The seeded row
-- also needs no update: countdown_enabled takes its column default of false and the other
-- two stay null, which is the "no countdown" state.

-- ---------------------------------------------------------------------------
-- VERIFICATION (run manually; not executed as part of the migration)
-- ---------------------------------------------------------------------------
--
-- select jsonb_pretty(jsonb_build_object(
--   'countdown_columns', (
--     select jsonb_agg(jsonb_build_object('name', column_name, 'type', data_type,
--                                         'nullable', is_nullable, 'default', column_default)
--                      order by ordinal_position)
--     from information_schema.columns
--     where table_schema = 'public' and table_name = 'website_settings'
--       and column_name like 'countdown%'
--   ),
--   'checks', (
--     select jsonb_agg(jsonb_build_object('name', conname, 'def', pg_get_constraintdef(oid))
--                      order by conname)
--     from pg_constraint
--     where conrelid = 'public.website_settings'::regclass and contype = 'c'
--   ),
--   'row', (select to_jsonb(w) from public.website_settings w)
-- )) as post_state;
--
-- -- The invariant, as an administrator would hit it. Both must raise 23514:
-- --   update public.website_settings set countdown_enabled = true, countdown_session_at = null;
-- -- and both of these must succeed:
-- --   update public.website_settings set countdown_enabled = false, countdown_session_at = null;
-- --   update public.website_settings
-- --      set countdown_enabled = true, countdown_session_at = now() + interval '7 days';
