-- =============================================================================
-- MENTORSHIP PROGRAMS — REAL CLIENT CATALOGUE CONTENT
-- =============================================================================
--
-- Target table : public.courses  (created by supabase/migrations/001_create_courses.sql)
-- Purpose      : The four mentorship programs Drizzypips actually sells, as the four
--                rows the /mentorship page groups into Physical and Online, each with
--                a General and a One-on-One track.
--
-- THIS IS NOT DEV DATA, AND IT IS NOT A MIGRATION.
--   Unlike 001_dev_sample_courses.sql and 002_dev_payment_settings.sql beside it, every
--   value below is real, client-supplied product content and is meant to run against
--   production. It lives in supabase/seed/ rather than supabase/migrations/ for the same
--   reason those two do: it writes catalogue rows, it does not change the schema, so it
--   must never join the migration chain.
--
-- WHAT THIS FILE DOES NOT DO
--   * It does not create, drop or alter any table, column, index, trigger or constraint.
--   * It does not create, drop or alter any RLS policy.
--   * It does not delete anything. The pre-existing "ICT Mentorship Programme" row is
--     left exactly as it is: it is unpublished, so it does not appear on any public
--     page, and an approved enrollment references it under `on delete restrict`.
--   * It writes to exactly one table: public.courses.
--
-- CONTENT IS VERBATIM
--   Prices, durations and every benefit line are reproduced exactly as the client
--   supplied them, including their own capitalisation. Nothing was shortened, merged,
--   reworded or added. Two details worth naming, because they are easy to "tidy" into
--   a bug:
--     * Physical General includes THE HUT CAFE. Physical One-on-One does not. The two
--       benefit lists are not variants of each other and must not be merged.
--     * Online One-on-One has NO fixed session days or times. The client specified that
--       its days are selected based on schedules, and the last benefit line says so.
--       Do not invent a timetable for it. Only Online General has fixed days and hours
--       (Tuesdays, Thursdays, Saturdays, 2PM to 4PM).
--
--   `description` and `short_description` are not free copy either: each one restates
--   only facts drawn from the lines below it, because the client supplied benefits,
--   prices and durations but no prose, and the columns are NOT NULL.
--
-- TITLES CARRY THE SETTING
--   The client names these "Physical Mentorship / General Mentorship" and so on. The
--   title column holds the combined name because a card is not always read inside its
--   category: the homepage preview, the admin course table and, most importantly,
--   `enrollments.course_title_snapshot` all show the title alone. Two rows both called
--   "General Mentorship" would make a 150,000 enrollment indistinguishable from a
--   250,000 one on the review screen.
--
-- IDEMPOTENCY
--   Re-running this file is safe. public.courses.slug is UNIQUE and the statement ends
--   in `on conflict (slug) do update`, so a second run converges the four rows back to
--   the values here instead of inserting duplicates.
--
--   created_at is written explicitly and refreshed on conflict, because
--   fetchPublishedCourses orders by `created_at desc` and that ordering decides which
--   three of the four the homepage previews. The offsets below make the public order
--   Physical General, Physical One-on-One, Online General, Online One-on-One, matching
--   the order MENTORSHIP_DELIVERIES lists the two settings in. Values are relative to
--   now(), so absolute timestamps shift between runs while the ordering stays fixed.
--
--   updated_at is deliberately NOT written. The courses_set_updated_at trigger owns it.
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   Or, from the repository root:
--     npx supabase db query --linked < supabase/seed/003_mentorship_programs.sql
-- =============================================================================

begin;

with program_data (
  title, slug, short_description, description,
  learnings, requirements,
  duration, price, currency,
  mentorship_delivery, mentorship_format,
  thumbnail_url, published, age
) as (
  values
    -- 1/4  PHYSICAL -> GENERAL.  250,000.  Note THE HUT CAFE, which the one-on-one
    --      program below does not include.
    (
      'Physical General Mentorship'::text,
      'physical-general-mentorship'::text,
      'Physical general mentorship with 30 days access. Learn along with your mentor, from beginners to advance level.'::text,
      'Physical general mentorship with 30 days access.'
        || E'\n\n'
        || 'You learn along with your mentor from beginners to advance level. Everything the program includes is listed in full below.'::text,
      array[
        'Learn along with your MENTOR from beginners to advance level.',
        'Unlimited access to THE TRADERS HUT LIBRARY.',
        'Unlimited Access to THE PLAY STATION ROOM.',
        'Unlimited Access to THE HUT CAFE.',
        'Unlimited access to THE SNOOKER ROOM.',
        'Content creation space.',
        'Access to competitions and winning prices too.',
        'Participate in JOINT FUNDING for JOINT TRADING (optional).',
        'WEEKEND CHART REVIEW after general workout.',
        'Access to bring one person along just for a day.'
      ]::text[],
      array[]::text[],
      '30 DAYS ACCESS'::text,
      250000.00::numeric,
      'NGN'::text,
      'physical'::public.mentorship_delivery,
      'general'::public.mentorship_format,
      null::text,
      true,
      interval '0 minutes'
    ),

    -- 2/4  PHYSICAL -> ONE-ON-ONE.  600,000.  Twelve benefit lines, and no HUT CAFE.
    --      600,000 is the physical price; do not swap it with the online 450,000.
    (
      'Physical One-on-One Mentorship'::text,
      'physical-one-on-one-mentorship'::text,
      'One on one private class with an assigned mentor at THE HUT, with 30 days access.'::text,
      'Physical one-on-one mentorship with 30 days access.'
        || E'\n\n'
        || 'You get a one on one private class with an assigned mentor at THE HUT, and you live trade along with your personal tutor. Everything the program includes is listed in full below.'::text,
      array[
        'One on one private class with an assigned mentor at THE HUT.',
        'Live trade along with your personal tutor.',
        'Unlimited access to THE TRADERS HUT LIBRARY.',
        'Unlimited access to THE PLAY STATION ROOM.',
        'Unlimited access to THE SNOOKER ROOM.',
        'Content creation space.',
        'Access to competitions and winning prices too.',
        'Participate in JOINT FUNDING for JOINT TRADING (optional).',
        'WEEKEND CHART REVIEW after general workout.',
        'Access to bring one person along just for a two days out of your plan.',
        'ACCESS to account review for risk allocation.',
        'Direct access to mentor even after your sessions.'
      ]::text[],
      array[]::text[],
      '30 DAYS ACCESS'::text,
      600000.00::numeric,
      'NGN'::text,
      'physical'::public.mentorship_delivery,
      'one_on_one'::public.mentorship_format,
      null::text,
      true,
      interval '5 minutes'
    ),

    -- 3/4  ONLINE -> GENERAL.  150,000.  The ONLY program with fixed days and times.
    (
      'Online General Mentorship'::text,
      'online-general-mentorship'::text,
      'Zoom live class along with others, with 30 days access. Tuesdays, Thursdays and Saturdays, 2PM to 4PM.'::text,
      'Online general mentorship with 30 days access.'
        || E'\n\n'
        || 'A Zoom live class along with others, where you learn from beginners to advance knowledge and get your risk management plan. Sessions run on Tuesdays, Thursdays and Saturdays, 2PM to 4PM.'::text,
      array[
        'Zoom live class along with others.',
        'Learn from beginners to advance knowledge.',
        'Get your risk management plan.',
        'DAYS: TUESDAYS, THURSDAYS, SATURDAYS.',
        'TIME: 2PM TO 4PM.'
      ]::text[],
      array[]::text[],
      '30 DAYS ACCESS'::text,
      150000.00::numeric,
      'NGN'::text,
      'online'::public.mentorship_delivery,
      'general'::public.mentorship_format,
      null::text,
      true,
      interval '10 minutes'
    ),

    -- 4/4  ONLINE -> ONE-ON-ONE.  450,000.  NO fixed days, NO fixed times. The session
    --      days are selected based on schedules, and the last benefit line is the
    --      client's own wording for that. Nothing here may be replaced by a timetable.
    (
      'Online One-on-One Mentorship'::text,
      'online-one-on-one-mentorship'::text,
      'One on one with a private mentor on Zoom live, with 30 days access. Session days are selected based on schedules.'::text,
      'Online one-on-one mentorship with 30 days access.'
        || E'\n\n'
        || 'One on one with a private mentor on Zoom live, where you learn from beginners to advance knowledge and live trade along with your tutor. The days of the sessions are selected based on schedules.'::text,
      array[
        'One on one with a private mentor on zoom live.',
        'Learn from beginners to advance knowledge.',
        'Live trade along with your tutor.',
        'Risk management plan table.',
        'ACCESS to mentor even after your sessions.',
        'WEEKEND ACCOUNT REVIEW for risk allocation.',
        'DAYS OF THE SESSIONS WILL BE SELECTED BASED ON SCHEDULES.'
      ]::text[],
      array[]::text[],
      '30 DAYS ACCESS'::text,
      450000.00::numeric,
      'NGN'::text,
      'online'::public.mentorship_delivery,
      'one_on_one'::public.mentorship_format,
      null::text,
      true,
      interval '15 minutes'
    )
)
insert into public.courses (
  title, slug, short_description, description,
  learnings, requirements,
  duration, price, currency,
  mentorship_delivery, mentorship_format,
  thumbnail_url, published, created_at
)
select
  title, slug, short_description, description,
  learnings, requirements,
  duration, price, currency,
  mentorship_delivery, mentorship_format,
  thumbnail_url, published, now() - age
from program_data
on conflict (slug) do update
set title               = excluded.title,
    short_description   = excluded.short_description,
    description         = excluded.description,
    learnings           = excluded.learnings,
    requirements        = excluded.requirements,
    duration            = excluded.duration,
    price               = excluded.price,
    currency            = excluded.currency,
    mentorship_delivery = excluded.mentorship_delivery,
    mentorship_format   = excluded.mentorship_format,
    thumbnail_url       = excluded.thumbnail_url,
    published           = excluded.published,
    created_at          = excluded.created_at;

commit;

-- =============================================================================
-- VERIFICATION (run separately; every row should read exactly as the client wrote it)
-- =============================================================================
--
--   select slug, mentorship_delivery, mentorship_format, price, currency, duration,
--          published, array_length(learnings, 1) as benefits
--   from public.courses
--   where slug like '%-mentorship'
--   order by created_at desc;
--
--   Expected: four published NGN rows, 30 DAYS ACCESS each,
--     physical/general     250000.00  10 benefits
--     physical/one_on_one  600000.00  12 benefits
--     online/general       150000.00   5 benefits
--     online/one_on_one    450000.00   7 benefits
--
--   And the two lists that must not be confused with each other:
--
--   select slug, unnest(learnings) from public.courses
--   where slug in ('physical-general-mentorship', 'physical-one-on-one-mentorship');
--
--   THE HUT CAFE must appear under physical-general-mentorship and nowhere else.
-- =============================================================================
