-- 013_add_course_mentorship_taxonomy.sql
--
-- Phase 7: mentorship is sold in four shapes, and the catalogue could not say so.
--
-- /mentorship put every published course into one flat grid. A visitor arriving with no idea
-- what they wanted saw a wall of cards and no structure, when the product actually divides
-- cleanly twice over: where it happens (in person or online) and how it is taught (a group
-- program or one on one). Those two axes give four offerings, each priced and described
-- separately, and each needing its own place in the catalogue.
--
-- Two enum columns rather than one four-valued enum
-- ------------------------------------------------
-- `mentorship_delivery` and `mentorship_format` are separate because the page navigates them
-- separately: a visitor picks physical or online first, then picks a track inside it. A single
-- `physical_general | physical_one_on_one | online_general | online_one_on_one` enum would make
-- "all the physical programs" a query over two of four values, and would need editing every
-- time either axis gained a member. Two columns also let the admin form ask two plain
-- questions instead of one compound one.
--
-- Enums rather than text with a check constraint
-- ---------------------------------------------
-- The set is closed and small, and the generated TypeScript types turn a Postgres enum into a
-- string-literal union, so an invalid value fails the typecheck rather than a runtime query.
-- 002 makes the same choice for `enrollment_status`. A check constraint on text would give the
-- database half of that and the frontend none of it.
--
-- Both columns are nullable, and null means "not yet classified"
-- ------------------------------------------------------------
-- Not "use a default". There is no honest default for where a course is taught: guessing
-- "online" for the seeded sample rows would publish a claim about a real product that nobody
-- made. This is the same distinction 012 draws for `countdown_session_at`, where a fabricated
-- date would be worse than no countdown.
--
-- The consequence the frontend has to honour: an unclassified course is still a published
-- course and must stay reachable. groupCoursesByCategory() puts these rows in a final
-- "other programs" group rather than dropping them, so applying this migration changes what
-- the catalogue *looks* like without changing what it *contains*. The safe default is the
-- state the site is in today, which is the argument 012 makes for `countdown_enabled default
-- false`.
--
-- NOT NULL with a backfill was the alternative and was rejected for that reason: it would
-- have written a delivery mode onto four seeded rows and any course the client has already
-- created, silently, as a side effect of a schema change.
--
-- Two more website_settings columns, in this same migration
-- -------------------------------------------------------
-- The /mentorship heading and its intro paragraph move into `website_settings` alongside the
-- eighteen fields 011 put there, for exactly 011's reason: they are public copy, and changing
-- them should not need a deploy. They belong in this file rather than one of their own because
-- they exist only to describe the structure the columns above introduce, and applying half of
-- this change would leave a heading promising categories that no course can be put into.
--
-- Both are nullable and null means "use the compiled-in default" from homepage.ts, like every
-- other content column on that table. The default spells out what the client asked the page to
-- communicate: mentorship runs from beginner to advanced, wherever the student is.
--
-- No RLS, policy, grant or trigger changes
-- ---------------------------------------
-- 001's four course policies and 011's four settings policies are per-command, not per-column,
-- so all four new columns are already publicly readable and already admin-only writable. The
-- `set_updated_at()` triggers on both tables are already installed. Nothing here widens who
-- can read or write what.

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------

-- `create type` has no `if not exists`, so re-applying this file would fail on the second run
-- without these guards. 012 goes out of its way to stay re-appliable and this file keeps that
-- property. Catching `duplicate_object` rather than testing pg_type first, so two concurrent
-- runs cannot both pass the test and then both try to create it.
do $$
begin
  create type public.mentorship_delivery as enum ('physical', 'online');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.mentorship_format as enum ('general', 'one_on_one');
exception
  when duplicate_object then null;
end
$$;

comment on type public.mentorship_delivery is
  'Where a mentorship program is taught. Null on public.courses means the course has not been '
  'classified yet, not that it is online.';

comment on type public.mentorship_format is
  'How a mentorship program is taught: a group program, or one on one. Null on public.courses '
  'means the course has not been classified yet.';

-- ---------------------------------------------------------------------------
-- Course columns
-- ---------------------------------------------------------------------------

alter table public.courses
  add column if not exists mentorship_delivery public.mentorship_delivery,
  add column if not exists mentorship_format public.mentorship_format;

comment on column public.courses.mentorship_delivery is
  'Physical or online. Null means unclassified, and an unclassified course still appears in '
  'the catalogue under a general group rather than disappearing from it.';

comment on column public.courses.mentorship_format is
  'General group program or one on one. Null means unclassified. Independent of '
  'mentorship_delivery: either axis can be set without the other.';

-- An index on the pair, because the catalogue reads courses grouped by category. Partial, so
-- it only carries the rows a category query can actually match: unclassified rows are found by
-- the "everything else" pass in the frontend, not by an index lookup.
create index if not exists courses_mentorship_category_idx
  on public.courses (mentorship_delivery, mentorship_format)
  where mentorship_delivery is not null;

-- ---------------------------------------------------------------------------
-- Mentorship page copy
-- ---------------------------------------------------------------------------

alter table public.website_settings
  add column if not exists mentorship_heading text,
  add column if not exists mentorship_intro text;

comment on column public.website_settings.mentorship_heading is
  'Heading on /mentorship. Null means "use the compiled-in default", like every other nullable '
  'column on this table.';

comment on column public.website_settings.mentorship_intro is
  'Paragraph under the /mentorship heading, explaining that mentorship runs from beginner to '
  'advanced and is available physically or online. Null means "use the compiled-in default".';

-- No seed change. The single website_settings row 011 inserted takes null for both new columns,
-- which is the "use the default" state, and no course row is classified by this migration.

-- ---------------------------------------------------------------------------
-- VERIFICATION (run manually; not executed as part of the migration)
-- ---------------------------------------------------------------------------
--
-- select jsonb_pretty(jsonb_build_object(
--   'enums', (
--     select jsonb_object_agg(t.typname, e.labels)
--     from pg_type t
--     join lateral (
--       select jsonb_agg(enumlabel order by enumsortorder) as labels
--       from pg_enum where enumtypid = t.oid
--     ) e on true
--     where t.typname in ('mentorship_delivery', 'mentorship_format')
--   ),
--   'course_columns', (
--     select jsonb_agg(jsonb_build_object('name', column_name, 'type', udt_name,
--                                         'nullable', is_nullable)
--                      order by ordinal_position)
--     from information_schema.columns
--     where table_schema = 'public' and table_name = 'courses'
--       and column_name like 'mentorship%'
--   ),
--   'settings_columns', (
--     select jsonb_agg(jsonb_build_object('name', column_name, 'nullable', is_nullable)
--                      order by ordinal_position)
--     from information_schema.columns
--     where table_schema = 'public' and table_name = 'website_settings'
--       and column_name like 'mentorship%'
--   ),
--   'index', (
--     select indexdef from pg_indexes
--     where schemaname = 'public' and indexname = 'courses_mentorship_category_idx'
--   ),
--   'unclassified_courses', (
--     select count(*) from public.courses where mentorship_delivery is null
--   )
-- )) as post_state;
--
-- -- The enum refuses anything outside its labels. Must raise 22P02:
-- --   update public.courses set mentorship_delivery = 'hybrid' where true;
--
-- -- Both axes are independent. Must succeed:
-- --   update public.courses set mentorship_format = 'general'
-- --    where slug = 'sample-forex-foundations';
-- --   update public.courses set mentorship_format = null
-- --    where slug = 'sample-forex-foundations';
