/**
 * Phase 5a course-management security probes.
 *
 * Phase 5a added three things anonymous visitors must never reach: the `course-thumbnails`
 * bucket (008), `public.admin_course_stats()` (009), and write access to `public.courses`.
 * This suite asks the same three questions the Phase 4 suite asks, about that surface:
 *
 *   A. Can `anon` reach it?                    (must be: no — except the public thumbnail URL)
 *   B. Can a signed-in NON-admin reach it?     (must be: no)
 *   C. Can a signed-in admin reach it?         (must be: yes, and the bucket limits still bite)
 *
 * WHY THE ASSERTIONS ARE NOT UNIFORM
 * `anon` holds INSERT, UPDATE, DELETE and SELECT *table grants* on public.courses — checked
 * directly against the live database, not assumed:
 *
 *   select grantee, privilege_type from information_schema.role_table_grants
 *   where table_schema='public' and table_name='courses' and grantee='anon';
 *
 * So RLS is the only thing standing between an anonymous visitor and the catalogue. That
 * changes what a refusal looks like, per statement type, and getting it wrong produces a
 * false pass:
 *
 *   INSERT — a WITH CHECK violation raises, so the answer is HTTP 4xx / 42501.
 *   UPDATE — a missing USING policy filters every row away instead of raising, so the
 *            answer is HTTP 2xx with ZERO ROWS AFFECTED. Asserting `status >= 400` here
 *            would fail against a correctly configured database.
 *   DELETE — same as UPDATE.
 *
 * And because "zero rows affected" is also what a filter that matches nothing returns, the
 * UPDATE and DELETE probes must run against a row that is known to exist. Setup creates one
 * disposable course for exactly that purpose; without it those probes SKIP rather than pass
 * vacuously.
 *
 * WHAT THE DISPOSABLE COURSE IS FOR
 * It does three jobs at once, which is why it exists at all rather than the probes borrowing
 * a seeded course:
 *   1. positive control that an admin can actually create a course (the whole point of 5a);
 *   2. a real, worthless row for the anon and non-admin UPDATE/DELETE attempts, so a
 *      hypothetical success destroys nothing;
 *   3. a course that is known to be UNPUBLISHED, which is what makes "anon sees no
 *      unpublished courses" a meaningful result instead of a statement about an empty set.
 * It is left unpublished throughout — publishing it, even briefly, would put a test row on
 * the live catalogue — and section C deletes it as its own last positive control.
 *
 * Credentials are read from `.env.local`, never from the command line and never printed.
 * The anon key is required. Sections needing a session use the same OPTIONAL keys as the
 * Phase 4 suite:
 *
 *   PROBE_ADMIN_EMAIL / PROBE_ADMIN_PASSWORD        — an account linked in public.admins
 *   PROBE_NONADMIN_EMAIL / PROBE_NONADMIN_PASSWORD  — an account NOT in public.admins
 *
 * Absent credentials produce SKIP, never PASS — and never FAIL either. A probe that reports
 * a verdict on evidence it does not have is worse than one that admits it did not run.
 *
 * Section D needs no database: it checks that the limits duplicated into
 * src/lib/constants/course-media.ts still match the bucket those limits claim to mirror.
 *
 * VERIFIED OUT OF BAND, 2026-08-17
 * A9 and A10 need a course row that exists and whose loss is free, which without an admin
 * session this suite cannot create. Both were proven separately against a throwaway row
 * inserted through the Supabase CLI, then removed. To repeat it:
 *
 *   1. insert into public.courses (title, slug, short_description, description, duration,
 *      price, currency, published) values ('…', 'probe-5a-oob-fixture', '…', '…', '1 hour',
 *      0, 'NGN', false) returning id;
 *   2. as anon over HTTP, with the returned id:
 *        DELETE /rest/v1/courses?id=eq.<id>   + Prefer: return=representation
 *          → HTTP 200 with [] — accepted, affected nothing
 *        GET    /rest/v1/courses?id=eq.<id>   → HTTP 200 with []
 *        GET    /rest/v1/courses?slug=eq.probe-5a-oob-fixture → HTTP 200 with []
 *   3. re-read the row in a SEPARATE statement to confirm the delete did nothing, then
 *      delete from public.courses where slug like 'probe-5a-%';
 *
 * Step 3 is not optional. Checking a delete in the same statement that attempted it reads
 * the pre-statement snapshot and has produced a false pass twice in this project.
 *
 * The catalogue held 8 courses at the time, 7 published and 1 already unpublished, so A12's
 * "every visible course is published" is a statement about real data rather than an empty set.
 */

const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..", "..");

const readEnv = () => {
  const raw = fs.readFileSync(path.join(projectRoot, ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return env;
};

const env = readEnv();
const URL_BASE = env.VITE_SUPABASE_URL;
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!URL_BASE || !ANON) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env.local");
  process.exit(2);
}

const BUCKET = "course-thumbnails";
const MIGRATION_008 = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "008_create_course_thumbnails_storage.sql",
);
const COURSE_MEDIA_TS = path.join(projectRoot, "src", "lib", "constants", "course-media.ts");

const results = [];

const record = (name, pass, detail) => {
  results.push({ name, pass, skipped: false, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  console.log(`      ${detail}`);
};

const skip = (name, detail) => {
  results.push({ name, pass: true, skipped: true, detail });
  console.log(`SKIP  ${name}`);
  console.log(`      ${detail}`);
};

const summarise = (body) => {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
};

/**
 * A REST/RPC call as a chosen identity.
 *
 * `token` is the anon key for anonymous calls and a user access token for signed-in ones.
 * `apikey` stays the anon key in both cases, which is how supabase-js behaves in the
 * browser — so a signed-in probe exercises the request shape the admin panel produces
 * rather than a privileged side channel.
 */
const call = async (pathname, { token = ANON, ...init } = {}) => {
  const response = await fetch(`${URL_BASE}${pathname}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
};

const rpc = (fn, args, token) =>
  call(`/rest/v1/rpc/${fn}`, { token, method: "POST", body: JSON.stringify(args) });

/**
 * Rows actually returned.
 *
 * Only an array body carries rows. A PostgREST error body is a bare object
 * (`{code, message, …}`), so counting "any truthy body" as one row would read a permission
 * denial — the strongest possible refusal — as a one-row leak.
 */
const rowsOf = (body) => (Array.isArray(body) ? body.length : 0);

const signIn = async (email, password) => {
  const response = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, token: body?.access_token ?? null, body };
};

// ---------------------------------------------------------------------------------
// Storage helpers, each matching the request supabase-js actually sends, so a probe
// measures the app's path rather than a convenient approximation of it.
// ---------------------------------------------------------------------------------

/** A real 1x1 PNG. Used so nothing but RLS can refuse an upload. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const storageFetch = async (pathname, { token = ANON, ...init } = {}) => {
  const response = await fetch(`${URL_BASE}/storage/v1${pathname}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, ...(init.headers || {}) },
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
};

/**
 * `.upload()` — POST with the bytes as the body.
 *
 * `cache-control: no-store` on purpose. The app asks for a year, which is safe there
 * because keys are never rewritten, but a cached public response would make the
 * post-delete read in C7 report bytes that no longer exist.
 */
const uploadObject = (key, { token = ANON, body = PNG_1PX, contentType = "image/png" } = {}) =>
  storageFetch(`/object/${BUCKET}/${key}`, {
    token,
    method: "POST",
    headers: { "Content-Type": contentType, "cache-control": "no-store" },
    body,
  });

/** `.update()` — PUT to an existing key. 008 grants no UPDATE policy to anyone. */
const updateObject = (key, { token = ANON } = {}) =>
  storageFetch(`/object/${BUCKET}/${key}`, {
    token,
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: PNG_1PX,
  });

/** `.remove()` — DELETE on the bucket with a `prefixes` array. */
const removeObjects = (keys, { token = ANON } = {}) =>
  storageFetch(`/object/${BUCKET}`, {
    token,
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefixes: keys }),
  });

/** `.list()` — POST with a prefix. */
const listObjects = (prefix, { token = ANON, limit = 100 } = {}) =>
  storageFetch(`/object/list/${BUCKET}`, {
    token,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit }),
  });

/** The public object endpoint. Deliberately unauthenticated — no apikey, no bearer. */
const publicGet = async (key) => {
  const response = await fetch(`${URL_BASE}/storage/v1/object/public/${BUCKET}/${key}`);
  const text = await response.text();
  return { status: response.status, text, bytes: Buffer.byteLength(text) };
};

/** A key of the shape the 008 INSERT policy requires: one uuid folder, one uuid file. */
const buildKey = (extension = "png") =>
  `${crypto.randomUUID()}/${crypto.randomUUID()}.${extension}`;

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

/** Objects this run created and could not clean up. Reported at the end. */
const strandedObjects = [];

const main = async () => {
  console.log("=== Phase 5a course-management probes ===\n");

  // -------------------------------------------------------------------------------
  // Pre-flight. A missing function returns an error to everybody, and a missing bucket
  // refuses every upload, so either one would make the whole of section A pass for
  // entirely the wrong reason.
  // -------------------------------------------------------------------------------
  {
    // admin_course_stats() takes no arguments, so `{}` resolves the real signature.
    // PostgREST answers 404 with a PGRST20x code only when the function is absent;
    // a privilege refusal — which is what anon should get — proves it is there.
    const stats = await rpc("admin_course_stats", {});
    const functionMissing = stats.status === 404 && String(stats.body?.code ?? "").startsWith("PGRST20");

    // The bucket is checked through the public endpoint because that is the one storage
    // route anon is allowed to use. Asking for a key that cannot exist distinguishes the
    // two failures by message: "Bucket not found" means 008 was never applied, while
    // "Object not found" means the bucket is there and behaving.
    const probe = await publicGet(`${NIL_UUID}/${NIL_UUID}.png`);
    const bucketMissing = /bucket not found/i.test(probe.text);

    if (functionMissing || bucketMissing) {
      console.error(
        "\nPHASE 5a MIGRATIONS NOT APPLIED:" +
          (functionMissing ? "\n  public.admin_course_stats() not found — apply 009_admin_course_functions.sql" : "") +
          (bucketMissing ? `\n  bucket '${BUCKET}' not found — apply 008_create_course_thumbnails_storage.sql` : "") +
          "\nThen re-run.",
      );
      process.exitCode = 3;
      return;
    }

    console.log(
      `Pre-flight: admin_course_stats() exists (HTTP ${stats.status}) and bucket '${BUCKET}' ` +
        `exists (public GET of a missing key → HTTP ${probe.status}, ${summarise(probe.text)}).\n`,
    );
  }

  // -------------------------------------------------------------------------------
  // Setup. Everything here is a recorded probe, not a silent fixture: an admin creating
  // a course and uploading a thumbnail IS the positive control for the 001 INSERT policy
  // and the 008 INSERT policy respectively.
  // -------------------------------------------------------------------------------
  console.log("--- Setup: a disposable course and a real thumbnail object (admin) ---\n");

  let adminToken = null;
  let probeCourseId = null;
  let probeCourseSlug = null;
  let probeObjectKey = null;

  if (!env.PROBE_ADMIN_EMAIL || !env.PROBE_ADMIN_PASSWORD) {
    skip(
      "S1. admin can sign in",
      "PROBE_ADMIN_EMAIL / PROBE_ADMIN_PASSWORD not set in .env.local — no admin session, so the " +
        "positive controls and every probe needing a real row or a real object will skip.",
    );
  } else {
    const session = await signIn(env.PROBE_ADMIN_EMAIL, env.PROBE_ADMIN_PASSWORD);
    adminToken = session.token;
    record(
      "S1. admin can sign in",
      Boolean(adminToken),
      `HTTP ${session.status} · ${adminToken ? "session obtained" : summarise(session.body)}`,
    );
  }

  if (adminToken) {
    const isAdmin = await rpc("is_admin", {}, adminToken);
    const confirmed = isAdmin.status === 200 && isAdmin.body === true;
    record(
      "S2. is_admin() is true for this account (precondition)",
      confirmed,
      `HTTP ${isAdmin.status} · is_admin=${JSON.stringify(isAdmin.body)}`,
    );

    if (!confirmed) {
      adminToken = null;
    }
  }

  if (adminToken) {
    // S3. Create the disposable course. Slug prefix `probe-5a-` mirrors the
    // `probe%@example.com` convention the Phase 3 teardown uses, so anything left behind
    // by an interrupted run is findable with one LIKE.
    probeCourseSlug = `probe-5a-${crypto.randomUUID().slice(0, 8)}`;
    const created = await call("/rest/v1/courses?select=id,slug,published", {
      token: adminToken,
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title: "Probe 5a disposable course",
        slug: probeCourseSlug,
        short_description: "Created by phase5a-course-probes.cjs. Safe to delete.",
        description: "Temporary row used to prove the course write policies. Deleted by section C.",
        duration: "1 hour",
        price: 0,
        currency: "NGN",
        published: false,
      }),
    });

    const row = Array.isArray(created.body) ? created.body[0] : null;
    probeCourseId = row?.id ?? null;

    record(
      "S3. admin can create a course (positive control for the 001 INSERT policy)",
      created.status === 201 && Boolean(probeCourseId) && row?.published === false,
      `HTTP ${created.status} · ${probeCourseId ? `id obtained, published=${row?.published}` : summarise(created.body)}`,
    );

    // S4. Upload one thumbnail. This is the object every anon storage probe below is
    // aimed at, which is what stops "nothing was deleted" and "nothing was listed" from
    // being statements about an empty bucket.
    const key = buildKey();
    const uploaded = await uploadObject(key, { token: adminToken });
    if (uploaded.status === 200) {
      probeObjectKey = key;
    }
    record(
      "S4. admin can upload a thumbnail (positive control for the 008 INSERT policy)",
      uploaded.status === 200,
      `HTTP ${uploaded.status} · key shape <uuid>/<uuid>.png · ${summarise(uploaded.body)}`,
    );
  } else {
    skip(
      "S2-S4. admin preconditions",
      "No usable admin session — no disposable course and no thumbnail object were created.",
    );
  }

  // -------------------------------------------------------------------------------
  // A target for the UPDATE probes.
  //
  // Prefers the disposable course from S3. Falls back to any course anon can already see,
  // because the write is a NO-OP — it stores the value the row already holds — so even in
  // the catastrophic case where RLS permits it, no data changes and only `updated_at`
  // moves. That fallback is what lets A8 and B4 run without admin credentials, which
  // matters: "an UPDATE refusal is zero rows, not an error" is the subtlest assertion in
  // this suite and the worst one to leave unproven.
  //
  // DELETE gets no such fallback. There is no no-op delete, so A9 and B5 need a row whose
  // loss is free or they do not run at all.
  // -------------------------------------------------------------------------------
  let updateTarget = null;
  if (probeCourseId) {
    updateTarget = { id: probeCourseId, published: false, source: "the disposable course from S3" };
  } else {
    const any = await call("/rest/v1/courses?select=id,published&limit=1");
    const row = Array.isArray(any.body) ? any.body[0] : null;
    if (row) {
      updateTarget = {
        id: row.id,
        published: row.published,
        source: "a live published course (no-op write, so nothing but updated_at could move)",
      };
    }
  }

  /**
   * A no-op PATCH against a row that exists.
   *
   * Passes only on HTTP 200 with zero rows — "accepted, and affected nothing". A 4xx would
   * also report zero rows, so accepting any status would let a malformed request stand in
   * for a working policy.
   */
  const attemptNoOpUpdate = async (token) => {
    const filter = updateTarget.published ? "published=eq.true" : "published=eq.false";
    return call(`/rest/v1/courses?id=eq.${updateTarget.id}&${filter}&select=id,published`, {
      token,
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ published: updateTarget.published }),
    });
  };

  // -------------------------------------------------------------------------------
  console.log("\n--- Section A: the anonymous visitor ---\n");
  // -------------------------------------------------------------------------------

  // A1. Upload. A valid PNG body, a valid content type from the bucket's allowlist, and a
  // key matching the policy's uuid-folder regex — so the only thing left that can refuse
  // this is is_admin(). A probe that sent text/plain would be refused by the MIME
  // allowlist and would pass identically against a wide-open INSERT policy.
  {
    const r = await uploadObject(buildKey(), { token: ANON });
    const leaked = r.status === 200;
    if (leaked) strandedObjects.push("an object anon uploaded in A1 — see the FAIL detail");
    record(
      "A1. anon upload to course-thumbnails",
      !leaked,
      `HTTP ${r.status} · valid PNG, allowed MIME, policy-shaped key — only is_admin() can refuse it · ${summarise(r.body)}`,
    );
  }

  // A2. Update. 008 grants no UPDATE policy to any role, deliberately: replacing a
  // thumbnail writes a new key so a published URL can never start serving different
  // bytes. Aimed at the real object, so this is a genuine overwrite attempt.
  {
    if (!probeObjectKey) {
      skip("A2. anon update (PUT) an existing thumbnail", "No object exists to attempt an overwrite on.");
    } else {
      const r = await updateObject(probeObjectKey, { token: ANON });
      record(
        "A2. anon update (PUT) an existing thumbnail",
        r.status !== 200,
        `HTTP ${r.status} · target exists (uploaded in S4) · 008 grants no UPDATE policy at all · ${summarise(r.body)}`,
      );
    }
  }

  // A3. Delete. `.remove()` answers 200 with an empty array when it deleted nothing, so
  // status alone is not the signal — a non-empty array means the object really went.
  {
    if (!probeObjectKey) {
      skip("A3. anon delete in course-thumbnails", "No object exists, so 'deleted nothing' would be vacuous.");
    } else {
      const r = await removeObjects([probeObjectKey], { token: ANON });
      const deleted = Array.isArray(r.body) && r.body.length > 0;
      if (deleted) probeObjectKey = null;
      record(
        "A3. anon delete in course-thumbnails",
        !deleted,
        `HTTP ${r.status} · ${deleted ? "DELETED THE OBJECT" : "removed nothing"} · target existed (S4) · ${summarise(r.body)}`,
      );
    }
  }

  // A4. List. An empty listing is only evidence if the bucket is known to be non-empty,
  // so without S4's object this SKIPS rather than passing on an absence of data. A verdict
  // whose own detail line reads "inconclusive" is the exact false confidence this suite
  // exists to avoid, in either direction.
  {
    if (!probeObjectKey) {
      skip(
        "A4. anon LIST the course-thumbnails bucket",
        "No object is known to exist, so an empty listing would be a statement about the bucket rather than the SELECT policy.",
      );
    } else {
      const r = await listObjects("", { token: ANON });
      const leaked = Array.isArray(r.body) && r.body.length > 0;
      record(
        "A4. anon LIST the course-thumbnails bucket",
        !leaked,
        `HTTP ${r.status} · ${leaked ? `LEAKED ${r.body.length} OBJECT(S)` : "no objects listed"} · bucket is known non-empty (S4), so this is not a vacuous pass`,
      );
    }
  }

  // A5. Signed upload URL. Worth its own probe because this exact endpoint IS open to anon
  // on the receipts bucket — that is how a student uploads a payment receipt — so "anon
  // cannot POST directly" does not by itself imply "anon cannot get a token to PUT with".
  {
    const r = await storageFetch(`/object/upload/sign/${BUCKET}/${buildKey()}`, {
      token: ANON,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const gotToken = r.status === 200 && Boolean(r.body?.token);
    record(
      "A5. anon mint a signed UPLOAD url for course-thumbnails",
      !gotToken,
      `HTTP ${r.status} · ${gotToken ? "TOKEN ISSUED" : "no token"} · anon holds this on receipts by design, and must not here · ${summarise(r.body)}`,
    );
  }

  // A6. The 009 function. EXECUTE was revoked from public and anon and granted to
  // `authenticated` only, so anon must be refused before the body runs.
  {
    const r = await rpc("admin_course_stats", {});
    record(
      "A6. anon EXECUTE admin_course_stats()",
      r.status >= 400 && rowsOf(r.body) === 0,
      `HTTP ${r.status} code=${r.body?.code ?? "?"} · ${rowsOf(r.body)} row(s) · ${summarise(r.body)}`,
    );
  }

  // A7. INSERT into courses. anon HAS the insert grant, so this reaches RLS, and a
  // WITH CHECK violation raises rather than filtering — 4xx is the correct answer.
  {
    const forgedSlug = `probe-5a-forged-${crypto.randomUUID().slice(0, 8)}`;
    const r = await call("/rest/v1/courses?select=id,slug", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        title: "Forged by probe",
        slug: forgedSlug,
        short_description: "forged",
        description: "forged",
        duration: "0",
        price: 0,
      }),
    });

    const inserted = r.status === 201 || rowsOf(r.body) > 0;

    // A forged row must not be left behind. Cleaned up here rather than in teardown so
    // the removal happens even if a later probe throws.
    let cleaned = "n/a";
    if (inserted && adminToken) {
      const undo = await call(`/rest/v1/courses?slug=eq.${forgedSlug}`, {
        token: adminToken,
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      });
      cleaned = rowsOf(undo.body) > 0 ? "forged row deleted" : `COULD NOT DELETE (HTTP ${undo.status})`;
    } else if (inserted) {
      cleaned = `NOT CLEANED — no admin session. Remove courses.slug = '${forgedSlug}' by hand`;
    }

    record(
      "A7. anon INSERT into courses",
      !inserted,
      `HTTP ${r.status} · ${inserted ? `ROW CREATED · cleanup: ${cleaned}` : "refused"} · anon holds the INSERT grant, so RLS is the only barrier · ${summarise(r.body)}`,
    );
  }

  // A8. UPDATE on courses.
  //
  // TWO THINGS MAKE THIS PROBE HONEST.
  // First, the target row exists, so "0 rows affected" cannot be a filter that matched
  // nothing — which is the trap here, because anon HOLDS the UPDATE grant and a missing
  // USING policy filters rows away rather than raising.
  // Second, the pass requires HTTP 200 as well as zero rows. A malformed request would
  // also affect nothing, and a probe that cannot tell a refusal from a typo is not a probe.
  {
    if (!updateTarget) {
      skip("A8. anon UPDATE on courses", "No course row is visible to aim a no-op update at.");
    } else {
      const r = await attemptNoOpUpdate(ANON);
      const affected = rowsOf(r.body);
      record(
        "A8. anon UPDATE on courses",
        r.status === 200 && affected === 0,
        `HTTP ${r.status} · ${affected} row(s) affected · target: ${updateTarget.source} · anon holds the UPDATE grant, so RLS is the only barrier · ${summarise(r.body)}`,
      );
    }
  }

  // A9. DELETE on courses. Same reasoning: a row that exists, and one whose loss is free.
  {
    if (!probeCourseId) {
      skip(
        "A9. anon DELETE on courses",
        "No disposable row exists. Deleting a live catalogue course to prove a policy is not acceptable.",
      );
    } else {
      const r = await call(`/rest/v1/courses?id=eq.${probeCourseId}&select=id`, {
        method: "DELETE",
        headers: { Prefer: "return=representation" },
      });
      const affected = rowsOf(r.body);
      if (affected > 0) {
        // Catastrophic, and every later probe that targets this row must know it is gone.
        probeCourseId = null;
        updateTarget = null;
      }
      record(
        "A9. anon DELETE on courses",
        r.status === 200 && affected === 0,
        `HTTP ${r.status} · ${affected} row(s) deleted · target existed (S3) · anon holds the DELETE grant, so RLS is the only barrier · ${summarise(r.body)}`,
      );
    }
  }

  // A10. The publish toggle, from the outside. 5a is the first phase where `published` is
  // something a human flips in a UI, which makes "a draft is invisible" a live guarantee
  // rather than a property of seed data.
  //
  // This is the targeted form of the check and needs a draft that is known to exist, so it
  // SKIPS without one. A12 carries the untargeted form — every row anon can see is
  // published — and runs either way.
  {
    if (!probeCourseId) {
      skip(
        "A10. anon cannot see a course known to be unpublished",
        "No course is known to be unpublished, so 0 rows would be a statement about the catalogue rather than the policy. A12 still checks that every visible course is published.",
      );
    } else {
      const r = await call(
        `/rest/v1/courses?id=eq.${probeCourseId}&select=id,slug,title`,
      );
      record(
        "A10. anon cannot see a course known to be unpublished",
        rowsOf(r.body) === 0,
        `HTTP ${r.status} · ${rowsOf(r.body)} row(s) · asked for the unpublished course from S3 by id, which section C confirms an admin can see`,
      );
    }
  }

  // A11. The one thing anon SHOULD be able to do with this bucket. 008 makes it public on
  // purpose: thumbnail_url is rendered as <img src> on pages anonymous visitors read, and
  // a signed URL would expire and blank the image. If this fails, the catalogue is broken.
  {
    if (!probeObjectKey) {
      skip("A11. anon GET a public thumbnail URL", "No object exists to fetch.");
    } else {
      const r = await publicGet(probeObjectKey);
      record(
        "A11. anon GET a public thumbnail URL (this one MUST work)",
        r.status === 200 && r.bytes > 0,
        `HTTP ${r.status} · ${r.bytes} byte(s) · unauthenticated: no apikey, no bearer · the bucket is public by design`,
      );
    }
  }

  // A12. Two jobs.
  //
  // As a positive control it proves the catalogue still reads at all — without it, a
  // database with every anon grant dropped would score full marks on section A.
  //
  // As a security check it is the untargeted form of A10: no `limit`, so it walks every
  // row anon can see and asserts each one is published. That holds whether or not a draft
  // happens to exist, which is why A10 can skip without leaving a gap.
  {
    const r = await call("/rest/v1/courses?select=slug,published");
    const rows = Array.isArray(r.body) ? r.body : [];
    const drafts = rows.filter((course) => course.published !== true);
    record(
      "A12. anon can read the catalogue, and every course in it is published",
      r.status === 200 && rows.length > 0 && drafts.length === 0,
      `HTTP ${r.status} · ${rows.length} visible course(s), ${drafts.length} of them unpublished` +
        (drafts.length > 0 ? ` ← LEAKED: ${drafts.map((c) => c.slug).join(", ")}` : ""),
    );
  }

  // -------------------------------------------------------------------------------
  console.log("\n--- Section B: a signed-in NON-admin ---\n");
  // -------------------------------------------------------------------------------

  let nonAdminToken = null;
  if (!env.PROBE_NONADMIN_EMAIL || !env.PROBE_NONADMIN_PASSWORD) {
    skip(
      "B. authenticated non-admin probes",
      "PROBE_NONADMIN_EMAIL / PROBE_NONADMIN_PASSWORD not set in .env.local — not run, not proven.",
    );
  } else {
    const session = await signIn(env.PROBE_NONADMIN_EMAIL, env.PROBE_NONADMIN_PASSWORD);
    nonAdminToken = session.token;
    record(
      "B0. non-admin can sign in (precondition)",
      Boolean(nonAdminToken),
      `HTTP ${session.status} · ${nonAdminToken ? "session obtained" : summarise(session.body)}`,
    );
  }

  if (nonAdminToken) {
    const isAdmin = await rpc("is_admin", {}, nonAdminToken);
    const notAdmin = isAdmin.status === 200 && isAdmin.body === false;
    record(
      "B1. is_admin() is false for this account (precondition)",
      notAdmin,
      `HTTP ${isAdmin.status} · is_admin=${JSON.stringify(isAdmin.body)}`,
    );

    if (!notAdmin) {
      skip(
        "B2-B7. non-admin authorization probes",
        "PROBE_NONADMIN_* names an account that IS an admin — use a different account.",
      );
    } else {
      // B2. The function IS executable by `authenticated` — the guard is the is_admin()
      // check in its body, which must raise 42501. This is the probe that proves
      // authorization lives in the database rather than in AdminGuard.
      {
        const r = await rpc("admin_course_stats", {}, nonAdminToken);
        record(
          "B2. non-admin EXECUTE admin_course_stats() gets 42501",
          r.status >= 400 && r.body?.code === "42501",
          `HTTP ${r.status} code=${r.body?.code ?? "?"} · EXECUTE is granted, so the refusal must come from the function body · ${summarise(r.body)}`,
        );
      }

      // B3. INSERT — WITH CHECK is_admin() raises.
      {
        const forgedSlug = `probe-5a-nonadmin-${crypto.randomUUID().slice(0, 8)}`;
        const r = await call("/rest/v1/courses?select=id,slug", {
          token: nonAdminToken,
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            title: "Forged by non-admin probe",
            slug: forgedSlug,
            short_description: "forged",
            description: "forged",
            duration: "0",
            price: 0,
          }),
        });

        const inserted = r.status === 201 || rowsOf(r.body) > 0;
        let cleaned = "n/a";
        if (inserted && adminToken) {
          const undo = await call(`/rest/v1/courses?slug=eq.${forgedSlug}`, {
            token: adminToken,
            method: "DELETE",
            headers: { Prefer: "return=representation" },
          });
          cleaned = rowsOf(undo.body) > 0 ? "forged row deleted" : `COULD NOT DELETE (HTTP ${undo.status})`;
        } else if (inserted) {
          cleaned = `NOT CLEANED — remove courses.slug = '${forgedSlug}' by hand`;
        }

        record(
          "B3. non-admin INSERT into courses",
          !inserted,
          `HTTP ${r.status} · ${inserted ? `ROW CREATED · cleanup: ${cleaned}` : "refused"} · ${summarise(r.body)}`,
        );
      }

      // B4. UPDATE. `authenticated` holds the grant, so a missing USING match filters
      // rather than raises — zero rows is the pass, same as A8, and for the same reason.
      if (!updateTarget) {
        skip("B4. non-admin UPDATE on courses", "No course row is visible to aim a no-op update at.");
      } else {
        const r = await attemptNoOpUpdate(nonAdminToken);
        record(
          "B4. non-admin UPDATE on courses",
          r.status === 200 && rowsOf(r.body) === 0,
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s) affected · target: ${updateTarget.source} · ${summarise(r.body)}`,
        );
      }

      // B5. DELETE. Needs the disposable row: there is no harmless delete to substitute.
      if (!probeCourseId) {
        skip(
          "B5. non-admin DELETE on courses",
          "No disposable row exists, and deleting a live catalogue course to prove a policy is not an acceptable trade.",
        );
      } else {
        const r = await call(`/rest/v1/courses?id=eq.${probeCourseId}&select=id`, {
          token: nonAdminToken,
          method: "DELETE",
          headers: { Prefer: "return=representation" },
        });
        if (rowsOf(r.body) > 0) {
          probeCourseId = null;
          updateTarget = null;
        }
        record(
          "B5. non-admin DELETE on courses",
          r.status === 200 && rowsOf(r.body) === 0,
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s) deleted · target existed (S3) · ${summarise(r.body)}`,
        );
      }

      // B6. The bucket. Every 008 policy is `to authenticated ... and public.is_admin()`,
      // so being signed in is not the qualification — being an admin is.
      {
        const r = await uploadObject(buildKey(), { token: nonAdminToken });
        const leaked = r.status === 200;
        if (leaked) strandedObjects.push("an object the non-admin uploaded in B6 — see the FAIL detail");
        record(
          "B6. non-admin upload to course-thumbnails",
          !leaked,
          `HTTP ${r.status} · valid PNG, allowed MIME, policy-shaped key · every 008 policy requires is_admin() · ${summarise(r.body)}`,
        );
      }

      // B7. The publish toggle for the other role. "Public can read published courses" is
      // `to anon, authenticated`, so holding a session must not reveal drafts. Written as
      // the untargeted form so it is meaningful with or without the S3 fixture, and
      // tightened into the targeted form when that fixture exists.
      {
        const r = await call("/rest/v1/courses?select=id,slug,published", {
          token: nonAdminToken,
        });
        const rows = Array.isArray(r.body) ? r.body : [];
        const drafts = rows.filter((course) => course.published !== true);
        const fixtureHidden = !probeCourseId || !rows.some((course) => course.id === probeCourseId);

        record(
          "B7. non-admin cannot see unpublished courses",
          r.status === 200 && rows.length > 0 && drafts.length === 0 && fixtureHidden,
          `HTTP ${r.status} · ${rows.length} visible course(s), ${drafts.length} unpublished` +
            (probeCourseId
              ? ` · the known draft from S3 was ${fixtureHidden ? "not returned" : "RETURNED"}`
              : " · no known draft to target, so this is the untargeted form only"),
        );
      }
    }
  }

  // -------------------------------------------------------------------------------
  console.log("\n--- Section C: the admin (positive control, and the bucket's own limits) ---\n");
  // -------------------------------------------------------------------------------

  if (!adminToken) {
    skip(
      "C. admin positive-control probes",
      "No usable admin session — the course admin screens' happy path is NOT proven by this run.",
    );
  } else {
    // C1. The counts the course list needs, and the claim that they carry no student data.
    // Checked by key name rather than by eyeballing the output: a future edit that adds
    // student_email to the RETURNS TABLE would fail here.
    {
      const r = await rpc("admin_course_stats", {}, adminToken);
      const rows = Array.isArray(r.body) ? r.body : [];

      // The comparison count comes from a plain `select=id` rather than a HEAD with
      // `Prefer: count=exact`, because the count in that case arrives in Content-Range
      // and only the body is read here. Ids only, so nothing sensitive is fetched.
      const idsOnly = await call("/rest/v1/courses?select=id", { token: adminToken });
      const courseCount = rowsOf(idsOnly.body);

      const keys = rows.length > 0 ? Object.keys(rows[0]).sort() : [];
      const expectedKeys = ["course_id", "pending", "total"];
      const keysMatch = JSON.stringify(keys) === JSON.stringify(expectedKeys);

      record(
        "C1. admin_course_stats() returns one row per course and no student data",
        r.status === 200 && rows.length === courseCount && courseCount > 0 && keysMatch,
        `HTTP ${r.status} · ${rows.length} stat row(s) vs ${courseCount} course row(s) · columns [${keys.join(", ")}]` +
          (keysMatch ? "" : ` ← EXPECTED [${expectedKeys.join(", ")}]`),
      );
    }

    // C2. The counterpart to A10 and B7. Without this, "nobody can see drafts" is
    // indistinguishable from "there are no drafts" — or from a broken admin panel.
    {
      if (!probeCourseId) {
        skip("C2. admin CAN see the unpublished course", "The disposable row no longer exists.");
      } else {
        const r = await call(`/rest/v1/courses?id=eq.${probeCourseId}&select=id,slug,published`, {
          token: adminToken,
        });
        const row = Array.isArray(r.body) ? r.body[0] : null;
        record(
          "C2. admin CAN see the unpublished course (the discriminator for A10/B7)",
          r.status === 200 && row?.id === probeCourseId && row?.published === false,
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s) · published=${row?.published} · same row anon and the non-admin could not see`,
        );
      }
    }

    // C3. The key-shape half of the INSERT policy, isolated from the is_admin() half by
    // running as an admin. Two rejections, because the policy asserts two things: exactly
    // one folder segment, and that segment a uuid. Without the regex the bucket's
    // namespace is whatever the client sends.
    {
      const flat = await uploadObject(`no-folder-${crypto.randomUUID()}.png`, { token: adminToken });
      const notUuid = await uploadObject(`not-a-uuid/${crypto.randomUUID()}.png`, { token: adminToken });
      const nested = await uploadObject(`${crypto.randomUUID()}/${crypto.randomUUID()}/x.png`, {
        token: adminToken,
      });

      for (const [label, response, key] of [
        ["flat", flat, "no-folder-<uuid>.png"],
        ["non-uuid folder", notUuid, "not-a-uuid/<uuid>.png"],
        ["nested", nested, "<uuid>/<uuid>/x.png"],
      ]) {
        if (response.status === 200) strandedObjects.push(`${BUCKET}/${key} (accepted in C3: ${label})`);
      }

      record(
        "C3. the bucket refuses a key that is not <uuid>/<file>",
        flat.status !== 200 && notUuid.status !== 200 && nested.status !== 200,
        `flat HTTP ${flat.status} · non-uuid folder HTTP ${notUuid.status} · nested HTTP ${nested.status} · as an ADMIN, so only the key regex can refuse these`,
      );
    }

    // C4. SVG. The client-side allowlist in courseThumbnail.service.ts is a courtesy —
    // anyone can call the Storage API directly — so the bucket's allowed_mime_types is the
    // real defence, and this is the one MIME type that matters. This bucket is PUBLIC, so
    // an accepted SVG would be a scriptable document served from our own origin to every
    // visitor, which is the reason 008 excludes it.
    {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        "utf8",
      );
      const key = buildKey("svg");
      const r = await uploadObject(key, {
        token: adminToken,
        body: svg,
        contentType: "image/svg+xml",
      });
      if (r.status === 200) strandedObjects.push(`${BUCKET}/${key} (an SVG the bucket accepted in C4)`);
      record(
        "C4. the bucket refuses image/svg+xml even from an admin",
        r.status !== 200,
        `HTTP ${r.status} · public bucket + scriptable document = stored XSS from our own origin · ${summarise(r.body)}`,
      );
    }

    // C5. The 2 MB ceiling, enforced server-side rather than only in the form.
    {
      const key = buildKey();
      const oversize = Buffer.alloc(2 * 1024 * 1024 + 1, 0);
      const r = await uploadObject(key, { token: adminToken, body: oversize });
      if (r.status === 200) strandedObjects.push(`${BUCKET}/${key} (an oversize object accepted in C5)`);
      record(
        "C5. the bucket refuses a file over 2 MB",
        r.status !== 200,
        `HTTP ${r.status} · sent ${oversize.length} bytes against a 2097152 limit · ${summarise(r.body)}`,
      );
    }

    // C6. The SELECT policy. It grants nothing that is not already world-readable by URL;
    // it exists because the Storage API resolves an object before deleting it, so C7
    // cannot work without it.
    {
      if (!probeObjectKey) {
        skip("C6. admin can LIST the bucket", "No object exists, so an empty listing would prove nothing.");
      } else {
        const folder = probeObjectKey.split("/")[0];
        const r = await listObjects(folder, { token: adminToken });
        const found = Array.isArray(r.body) && r.body.length > 0;
        record(
          "C6. admin can LIST the bucket (what makes .remove() resolvable)",
          r.status === 200 && found,
          `HTTP ${r.status} · ${Array.isArray(r.body) ? r.body.length : 0} object(s) under the probe folder · anon got nothing from the same bucket in A4`,
        );
      }
    }

    // C7. Delete, and then prove it in a SEPARATE read.
    //
    // The re-read is a LIST, not a public GET. A GET goes through the public object
    // endpoint and can be answered from cache, which would report bytes for an object
    // whose row is gone; a LIST reads storage.objects. This is the same lesson as the
    // .remove() verification in task 37, where checking in the same statement as the
    // delete read a pre-statement snapshot and produced a false pass twice.
    {
      if (!probeObjectKey) {
        skip("C7. admin delete removes the object", "No object exists to delete.");
      } else {
        const folder = probeObjectKey.split("/")[0];
        const removed = await removeObjects([probeObjectKey], { token: adminToken });
        const reportedDeleted = Array.isArray(removed.body) && removed.body.length > 0;

        const after = await listObjects(folder, { token: adminToken });
        const stillThere = Array.isArray(after.body) && after.body.length > 0;

        if (reportedDeleted && !stillThere) {
          probeObjectKey = null;
        } else {
          strandedObjects.push(`${BUCKET}/${probeObjectKey} (delete did not confirm in C7)`);
        }

        record(
          "C7. admin delete removes the object, confirmed by a separate LIST",
          removed.status === 200 && reportedDeleted && !stillThere,
          `DELETE HTTP ${removed.status} · reported ${Array.isArray(removed.body) ? removed.body.length : 0} removed · follow-up LIST found ${Array.isArray(after.body) ? after.body.length : "?"} · storage.protect_delete() does not block the Storage API`,
        );
      }
    }

    // C8. The duplicate slug. `courses.slug` is unique, and 23505 is what the admin form
    // maps to "That URL slug is already used by another course." — so this proves the
    // SQLSTATE the UI branches on is the one Postgres actually raises.
    {
      if (!probeCourseSlug || !probeCourseId) {
        skip("C8. a duplicate slug raises 23505", "The disposable row no longer exists to collide with.");
      } else {
        const r = await call("/rest/v1/courses?select=id", {
          token: adminToken,
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            title: "Duplicate slug probe",
            slug: probeCourseSlug,
            short_description: "duplicate",
            description: "duplicate",
            duration: "0",
            price: 0,
          }),
        });

        const inserted = r.status === 201 || rowsOf(r.body) > 0;
        if (inserted) strandedObjects.push(`a second course row with slug '${probeCourseSlug}'`);

        record(
          "C8. a duplicate slug raises 23505 (the code the form maps to friendly copy)",
          !inserted && r.body?.code === "23505",
          `HTTP ${r.status} code=${r.body?.code ?? "?"} · ${inserted ? "ROW CREATED — the unique constraint is gone" : "refused"}`,
        );
      }
    }

    // C9. Delete the disposable course. Teardown and positive control in one: a course
    // with no enrollments must be deletable, which is the other half of the `on delete
    // restrict` story the course list's enrollment count exists to explain.
    {
      if (!probeCourseId) {
        skip("C9. admin can delete a course with no enrollments", "The disposable row is already gone.");
      } else {
        const r = await call(`/rest/v1/courses?id=eq.${probeCourseId}&select=id`, {
          token: adminToken,
          method: "DELETE",
          headers: { Prefer: "return=representation" },
        });
        const deleted = rowsOf(r.body) > 0;
        if (deleted) {
          probeCourseId = null;
        }
        record(
          "C9. admin can delete a course with no enrollments (also this run's teardown)",
          deleted,
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s) deleted · anon and the non-admin both failed on this same row`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------------
  console.log("\n--- Section D: the working tree ---\n");
  // -------------------------------------------------------------------------------

  // src/lib/constants/course-media.ts duplicates the bucket's limits so the form can
  // reject a 12 MB photo without spending an upload, and says in its own header that "any
  // change must be made in both places". Nothing enforces that. These three probes do.
  //
  // The consequence of drift is not cosmetic: a client-side limit looser than the bucket's
  // means the admin waits for an upload that is refused at the end, and one tighter means
  // a legitimate image is rejected without ever reaching the authority on the question.
  const migration008 = fs.readFileSync(MIGRATION_008, "utf8");
  const courseMedia = fs.readFileSync(COURSE_MEDIA_TS, "utf8");

  // D1. The bucket id. A typo here would send uploads to a bucket with no policies at all.
  {
    const declaredInSql = /insert into storage\.buckets[\s\S]*?values\s*\(\s*'([^']+)'/i.exec(migration008);
    const declaredInCode = /COURSE_THUMBNAILS_BUCKET\s*=\s*"([^"]+)"/.exec(courseMedia);
    const sqlBucket = declaredInSql?.[1] ?? null;
    const codeBucket = declaredInCode?.[1] ?? null;

    record(
      "D1. the bucket id in code matches the one 008 creates",
      Boolean(sqlBucket) && sqlBucket === codeBucket && codeBucket === BUCKET,
      `008: ${sqlBucket ?? "not found"} · course-media.ts: ${codeBucket ?? "not found"}`,
    );
  }

  // D2. The MIME allowlist, and specifically that SVG is in neither list.
  {
    const sqlArray = /array\[([^\]]+)\]/i.exec(migration008);
    const sqlTypes = sqlArray ? [...sqlArray[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort() : [];

    const codeArray = /ACCEPTED_THUMBNAIL_MIME_TYPES\s*=\s*\[([^\]]+)\]/.exec(courseMedia);
    const codeTypes = codeArray ? [...codeArray[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort() : [];

    const match = sqlTypes.length > 0 && JSON.stringify(sqlTypes) === JSON.stringify(codeTypes);
    const svgAbsent = !sqlTypes.includes("image/svg+xml") && !codeTypes.includes("image/svg+xml");

    record(
      "D2. the MIME allowlist matches 008 and excludes SVG",
      match && svgAbsent,
      `008: [${sqlTypes.join(", ")}] · course-media.ts: [${codeTypes.join(", ")}]` +
        (svgAbsent ? "" : " ← SVG PRESENT"),
    );
  }

  // D3. The size limit. The SQL side is a literal; the TS side is the arithmetic
  // `2 * 1024 * 1024`, so the factors are multiplied out rather than string-matched. Parsed
  // as a product specifically, not evaluated — a probe suite has no business running
  // whatever a source file happens to say. Anything that is not a plain product reports
  // "not parsed" and fails, which is the right prompt to come and look.
  {
    const sqlLimit = /^\s*(\d{5,})\s*,\s*--/m.exec(migration008);
    const codeExpr = /MAX_THUMBNAIL_SIZE_BYTES\s*=\s*([^;]+);/.exec(courseMedia);

    const sqlValue = sqlLimit ? Number(sqlLimit[1]) : null;
    let codeValue = null;
    if (codeExpr) {
      const factors = codeExpr[1].split("*").map((part) => Number(part.trim()));
      if (factors.length > 0 && factors.every((factor) => Number.isFinite(factor))) {
        codeValue = factors.reduce((product, factor) => product * factor, 1);
      }
    }

    record(
      "D3. the client-side size limit matches the bucket's file_size_limit",
      sqlValue !== null && codeValue !== null && sqlValue === codeValue,
      `008: ${sqlValue ?? "not found"} · course-media.ts: ${codeValue ?? "not parsed"}${
        codeExpr ? ` (from "${codeExpr[1].trim()}")` : ""
      }`,
    );
  }

  // ---------------------------------------------------------------------------------
  console.log("\n=== Summary ===");
  const failed = results.filter((entry) => !entry.pass);
  const skipped = results.filter((entry) => entry.skipped);
  const ran = results.length - skipped.length;
  console.log(`${ran - failed.length}/${ran} probes passed, ${skipped.length} skipped.`);

  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail}`);
  }
  if (skipped.length > 0) {
    console.log("\nSKIPPED (not proven):");
    for (const entry of skipped) console.log(`  - ${entry.name}`);
    console.log(
      "\nTo run the skipped sections, add the same probe accounts the Phase 4 suite uses to\n" +
        ".env.local (create them in the Supabase Dashboard with 'Auto Confirm User' ticked):\n" +
        "\n" +
        "  PROBE_ADMIN_EMAIL=      PROBE_ADMIN_PASSWORD=\n" +
        "  PROBE_NONADMIN_EMAIL=   PROBE_NONADMIN_PASSWORD=\n" +
        "\n" +
        "Link only the first into public.admins with supabase/maintenance/grant_admin.sql.",
    );
  }

  // Teardown report. This suite is designed to clean up after itself — C7 deletes the
  // object and C9 deletes the course — so anything listed here is something a probe
  // created and could not remove, which is a finding in its own right.
  const leftovers = [...strandedObjects];
  if (probeObjectKey) leftovers.push(`${BUCKET}/${probeObjectKey} (uploaded in S4, never deleted)`);
  if (probeCourseId) {
    leftovers.push(`courses row id ${probeCourseId} / slug '${probeCourseSlug}' (created in S3, never deleted)`);
  }

  if (leftovers.length > 0) {
    console.log("\nLEFT BEHIND BY THIS RUN — remove these by hand:");
    for (const item of leftovers) console.log(`  - ${item}`);
    console.log(
      "\nCourses: delete by slug (they all begin 'probe-5a-'). Objects: Dashboard →\n" +
        `Storage → ${BUCKET}, or the Storage API. Direct SQL deletes on storage.objects are\n` +
        "blocked by storage.protect_delete(), which exists to stop exactly that.",
    );
  } else {
    console.log("\nNothing left behind: the disposable course and the probe object were both removed.");
  }

  process.exitCode = failed.length > 0 ? 1 : 0;
};

main().catch((error) => {
  console.error("Probe run failed:", error);
  process.exitCode = 2;
});
