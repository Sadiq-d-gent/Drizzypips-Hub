-- phase3-teardown.sql
--
-- Removes the enrollment rows created by the Phase 3 verification work, so a dev
-- database can be reset to a clean state. Run from the Supabase SQL Editor after
-- scripts/probes/phase3-security-probes.cjs.
--
-- THIS FILE DELETES ENROLLMENT ROWS ONLY. IT DOES NOT DELETE STORAGE OBJECTS.
--   Receipt objects are removed through the Storage API — see RECEIPT OBJECTS below.
--   An earlier version of this file ran `delete from storage.objects`, which was
--   wrong for the reasons documented in supabase/maintenance/cleanup_orphan_receipts.sql:
--   it removes the database row while leaving the actual file in the object store,
--   and Supabase's storage.protect_delete() guard exists to prevent exactly that.
--
-- Scope:
--   * probe enrollments — every enrollment whose student_email matches the probe
--     patterns. The suite uses probe+, probe-price+, probe-snapshot+ and probe-path+,
--     and the manual browser walk-through uses probe-ui@. All are at example.com
--     (reserved by RFC 2606), so a single 'probe%@example.com' pattern covers them
--     and can never match a real student address.
--     enrollment_status_history rows cascade with their enrollment (FK 005).
--
-- It does NOT touch real enrollment data, seeded courses, seeded payment settings,
-- or the schema itself.

-- Read this BEFORE deleting: it lists the receipt paths that are about to become
-- orphans, because deleting an enrollment removes the only reference to its object.
-- Copy the result — once the rows are gone, the paths are harder to recover.
select order_id, student_email, receipt_path
from public.enrollments
where student_email like 'probe%@example.com'
  and receipt_path is not null
order by created_at;

begin;

-- Probe enrollments (history rows cascade).
delete from public.enrollments
where student_email like 'probe%@example.com';

commit;

-- Verify: expect 0 rows.
--   select count(*) from public.enrollments where student_email like 'probe%@example.com';

-- =============================================================================
-- RECEIPT OBJECTS
-- =============================================================================
-- The probe suite uploads under a fixed folder; the browser walk-through uploads
-- under a random draft UUID. List everything currently in the bucket that no
-- enrollment references:
--
--   select o.name, o.created_at, round((o.metadata ->> 'size')::numeric / 1024, 1) as size_kb
--   from storage.objects o
--   where o.bucket_id = 'receipts'
--     and not exists (select 1 from public.enrollments e where e.receipt_path = o.name)
--   order by o.created_at;
--
-- Then remove those paths with the Storage API using the SERVICE ROLE key — never
-- from the browser, and never from a VITE_* variable:
--
--   const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY);
--   await admin.storage.from("receipts").remove(paths);
--
-- Note the 24-hour grace window in supabase/maintenance/cleanup_orphan_receipts.sql
-- does not apply here: these are known test objects, so they can be removed at once.
-- Re-run the query above afterwards; it should return zero rows.
-- =============================================================================
