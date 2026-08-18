-- =============================================================================
-- DEVELOPMENT SEED DATA — SAMPLE COURSES
-- =============================================================================
--
-- Target table : public.courses  (created by supabase/migrations/001_create_courses.sql)
-- Purpose      : Give the course catalogue UI realistic data to render and filter
--                against during development.
--
-- THIS FILE IS NOT A MIGRATION.
-- It deliberately lives in supabase/seed/ rather than supabase/migrations/ so it is
-- never picked up by the migration chain and applied to production. Run it by hand
-- against a development project only.
--
-- WHAT THIS FILE DOES NOT DO
--   * It does not create, drop or alter any table, column, index, trigger or
--     constraint.
--   * It does not create, drop or alter any RLS policy, and never touches
--     `alter table ... enable row level security`.
--   * It writes to exactly one table: public.courses.
--
-- CONTENT DISCLAIMER
--   Every row below is FICTIONAL SAMPLE DATA invented for testing. These are not
--   real Drizzypips products. The titles, descriptions, prices, durations and
--   curricula do not describe any course that is actually offered, and nothing here
--   should be treated as a claim about a real product. Every title is prefixed
--   "[Sample]" and every slug is prefixed "sample-", so seeded rows are trivially
--   identifiable and removable (see the teardown snippet at the bottom of this file).
--   No real student, customer, payment, or personally identifiable information
--   appears anywhere in this file.
--
-- IDEMPOTENCY
--   Re-running this file is safe and will not create duplicates. public.courses.slug
--   carries a UNIQUE constraint and the single statement below ends in
--   `on conflict (slug) do update`, so a second run converges the existing rows back
--   to the values here instead of inserting new ones. All eight rows are covered by
--   that one conflict rule, so no row can drift out of the idempotency guarantee.
--
--   Two intentional details:
--     * created_at is set explicitly (staggered by row) and is refreshed on conflict,
--       so repeated runs produce a deterministic `order by created_at desc` sequence.
--       Values are relative to now(), so the absolute timestamps shift between runs
--       while the ordering stays fixed.
--     * updated_at is intentionally NOT written here. The courses_set_updated_at
--       trigger from the migration owns that column and stamps it on every update.
--       A re-run therefore does change updated_at — that is the trigger working
--       correctly, not a duplicated row.
--
-- COVERAGE — the eight rows exercise every case called for:
--   published courses ....... 7 rows (published = true)
--   an unpublished course ... 1 row  (published = false; must never reach anon)
--   different prices ........ 0.00, 89.50, 149.00, 199.00, 299.00, 499.99 and
--                             150000.00 (NGN), plus 349.00 on the unpublished row.
--                             Spans every bucket in CourseFilters["priceRange"]
--                             (under-150 / 150-300 / over-300) and includes free.
--   different durations ..... "3 days" through "12 weeks"
--   different descriptions .. every row has a distinct short_description and a
--                             description of differing length, so the CourseCard
--                             line-clamp has both short and overflowing text
--   learnings ............... populated on 7 rows; deliberately EMPTY on one row
--   requirements ............ populated on 7 rows; deliberately EMPTY on that row
--   thumbnail_url ........... set on 7 rows; deliberately NULL on one row, to
--                             exercise the CourseCard no-image fallback branch
--
--   Two further edge cases are covered on purpose:
--     * a non-USD row (NGN) exercising CourseCard's non-USD price branch
--     * a free (0.00) row, which the schema permits via `check (price >= 0)`
--
--   Placeholder images use picsum.photos with a per-course seed: deterministic,
--   obviously a placeholder rather than real course artwork, and a syntactically
--   valid absolute URL (the app's Zod schema validates thumbnail_url with `.url()`).
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> paste this file -> Run.
--   Or, with a direct database connection string:
--     psql "$DATABASE_URL" -f supabase/seed/001_dev_sample_courses.sql
-- =============================================================================

begin;

with seed_data (
  title, slug, short_description, description, learnings, requirements,
  duration, price, currency, thumbnail_url, published, age
) as (
  values
    -- 1/8  Free course, fully populated, newest. Bucket: under-150.
    (
      '[Sample] Forex Foundations'::text,
      'sample-forex-foundations'::text,
      'Sample data: a free starter track covering core currency-market vocabulary.'::text,
      'SAMPLE COURSE - development data only. This fictional starter track walks through how the currency market is structured, what moves a quote, and how orders are actually placed. It exists so the catalogue has a free course to render.'::text,
      array['Read a currency pair quote and understand pip values',
            'Distinguish market, limit and stop orders',
            'Describe the main forex trading sessions']::text[],
      array['No prior trading experience required',
            'A computer or smartphone with internet access']::text[],
      '4 weeks'::text,
      0.00::numeric(12,2),
      'USD'::text,
      'https://picsum.photos/seed/sample-forex-foundations/800/500'::text,
      true::boolean,
      interval '1 day'
    ),

    -- 2/8  EDGE CASE: thumbnail_url IS NULL -> exercises the card image fallback.
    (
      '[Sample] Trading Psychology Basics',
      'sample-trading-psychology-basics',
      'Sample data: a short module on discipline, written to test the no-image card.',
      'SAMPLE COURSE - development data only. A fictional short module about the habits that keep a trader consistent: pre-defining risk, journalling every entry, and stepping away after a loss. This row intentionally carries no thumbnail so the image fallback can be verified.',
      array['Build a repeatable pre-trade checklist',
            'Recognise revenge-trading triggers',
            'Keep a structured trade journal']::text[],
      array['Willingness to keep a written journal']::text[],
      '2 weeks',
      89.50,
      'USD',
      null,
      true,
      interval '2 days'
    ),

    -- 3/8  Upper edge of the under-150 bucket.
    (
      '[Sample] Technical Analysis Essentials',
      'sample-technical-analysis-essentials',
      'Sample data: chart-reading fundamentals, priced at the under-150 boundary.',
      'SAMPLE COURSE - development data only. A fictional walkthrough of support and resistance, trend structure, and the handful of indicators worth keeping on a chart. Priced at exactly 149.00 so the under-150 price filter boundary can be tested.',
      array['Mark support and resistance levels consistently',
            'Identify trend direction from structure alone',
            'Read momentum with a single oscillator',
            'Avoid indicator overload on a chart']::text[],
      array['Comfortable navigating a charting platform',
            'Completion of a beginner course or equivalent']::text[],
      '6 weeks',
      149.00,
      'USD',
      'https://picsum.photos/seed/sample-technical-analysis/800/500',
      true,
      interval '3 days'
    ),

    -- 4/8  EDGE CASE: learnings AND requirements are both EMPTY arrays.
    --      Bucket: 150-300.
    (
      '[Sample] Risk Management Masterclass',
      'sample-risk-management-masterclass',
      'Sample data: position sizing, seeded with empty curriculum arrays on purpose.',
      'SAMPLE COURSE - development data only. A fictional treatment of position sizing, stop placement and portfolio-level exposure. This row intentionally ships with empty learnings and requirements arrays so the UI can be checked against a course with no curriculum bullets.',
      array[]::text[],
      array[]::text[],
      '5 weeks',
      199.00,
      'USD',
      'https://picsum.photos/seed/sample-risk-management/800/500',
      true,
      interval '4 days'
    ),

    -- 5/8  Upper edge of the 150-300 bucket.
    (
      '[Sample] Swing Trading Playbook',
      'sample-swing-trading-playbook',
      'Sample data: multi-day setups, priced at the 150-300 boundary.',
      'SAMPLE COURSE - development data only. A fictional playbook for holding positions across several sessions, covering entry timing, trade management and when to stand aside. Priced at exactly 299.00 to test the upper edge of the mid price bucket.',
      array['Plan trades that span multiple sessions',
            'Scale out of a position methodically',
            'Set alerts instead of watching charts all day']::text[],
      array['Working knowledge of chart patterns',
            'A funded or demo account for practice']::text[],
      '8 weeks',
      299.00,
      'USD',
      'https://picsum.photos/seed/sample-swing-trading/800/500',
      true,
      interval '5 days'
    ),

    -- 6/8  Highest published price, and a non-round value. Bucket: over-300.
    (
      '[Sample] Advanced Price Action',
      'sample-advanced-price-action',
      'Sample data: the longest and most expensive published sample course.',
      'SAMPLE COURSE - development data only. A fictional advanced track on reading raw price without indicators, including order-flow context, liquidity sweeps and higher-timeframe confluence. Deliberately the longest description in the seed so the card line-clamp has text to truncate, and priced with cents to check currency formatting.',
      array['Read raw price without relying on indicators',
            'Locate liquidity above and below structure',
            'Combine two timeframes into one decision',
            'Build a written, testable trading plan',
            'Review past trades against that plan']::text[],
      array['Solid grasp of technical analysis basics',
            'At least six months of screen time',
            'A journalling habit already in place']::text[],
      '12 weeks',
      499.99,
      'USD',
      'https://picsum.photos/seed/sample-advanced-price-action/800/500',
      true,
      interval '6 days'
    ),

    -- 7/8  EDGE CASE: non-USD currency -> exercises CourseCard's non-USD branch.
    --      Also the shortest duration string in the seed.
    (
      '[Sample] Naira-Denominated Weekend Workshop',
      'sample-naira-weekend-workshop',
      'Sample data: a short NGN-priced workshop, used to test non-USD formatting.',
      'SAMPLE COURSE - development data only. A fictional weekend intensive priced in Nigerian naira rather than dollars. It exists so the catalogue can be checked against a course whose currency is not USD, which takes a different formatting branch in the course card.',
      array['Walk through a full trading week end to end',
            'Set up a charting workspace from scratch']::text[],
      array['Attendance for both workshop days']::text[],
      '3 days',
      150000.00,
      'NGN',
      'https://picsum.photos/seed/sample-naira-workshop/800/500',
      true,
      interval '7 days'
    ),

    -- 8/8  THE UNPUBLISHED ROW. Anonymous callers must never see this.
    (
      '[Sample] Algorithmic Strategies (Unpublished Draft)',
      'sample-algorithmic-strategies-draft',
      'Sample data: intentionally unpublished, used to prove the RLS read policy.',
      'SAMPLE COURSE - development data only. This fictional draft is deliberately left unpublished. It is the control row for the public read policy: an anonymous client must never receive this record, while an administrator must be able to see it. Do not publish this row.',
      array['Describe how a rules-based strategy is specified',
            'Backtest an idea before risking capital']::text[],
      array['Basic scripting or spreadsheet familiarity']::text[],
      '10 weeks',
      349.00,
      'USD',
      'https://picsum.photos/seed/sample-algorithmic-strategies/800/500',
      false,
      interval '8 days'
    )
)
insert into public.courses (
  title, slug, short_description, description, learnings, requirements,
  duration, price, currency, thumbnail_url, published, created_at
)
select
  title, slug, short_description, description, learnings, requirements,
  duration, price, currency, thumbnail_url, published, now() - age
from seed_data
on conflict (slug) do update set
  title             = excluded.title,
  short_description = excluded.short_description,
  description       = excluded.description,
  learnings         = excluded.learnings,
  requirements      = excluded.requirements,
  duration          = excluded.duration,
  price             = excluded.price,
  currency          = excluded.currency,
  thumbnail_url     = excluded.thumbnail_url,
  published         = excluded.published,
  created_at        = excluded.created_at;

commit;

-- =============================================================================
-- TEARDOWN (not executed by this file)
--
-- Every seeded row is identifiable by its slug prefix, so the sample data can be
-- removed without touching any real course:
--
--   delete from public.courses where slug like 'sample-%';
--
-- Run that in the SQL Editor when the development data is no longer wanted.
-- =============================================================================
