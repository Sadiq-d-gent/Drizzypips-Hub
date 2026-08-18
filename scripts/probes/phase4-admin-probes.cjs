/**
 * Phase 4 admin-panel security probes.
 *
 * Three questions, asked against the live dev project:
 *
 *   A. Can `anon` reach anything the admin panel touches?            (must be: no)
 *   B. Can a signed-in NON-admin reach it?                           (must be: no)
 *   C. Can a signed-in admin reach it?                               (must be: yes)
 *
 * (C) matters as much as (A) and (B). A suite that only proves "everything is blocked"
 * would pass with equal enthusiasm against a database where the admin panel is broken,
 * so every negative section has a positive control alongside it.
 *
 * Credentials are read from `.env.local`, never from the command line and never printed.
 * The anon key is required. The two sign-in sections need account credentials, which are
 * OPTIONAL keys in `.env.local`:
 *
 *   PROBE_ADMIN_EMAIL / PROBE_ADMIN_PASSWORD        — an account linked in public.admins
 *   PROBE_NONADMIN_EMAIL / PROBE_NONADMIN_PASSWORD  — an account NOT in public.admins
 *
 * Absent credentials produce SKIP, never PASS: an unproven guarantee is reported as
 * unproven. This project has email confirmations enabled and rejects `@example.com`
 * signups, so both accounts must be created in the Supabase Dashboard with
 * "Auto Confirm User" — see the closing notes this script prints.
 *
 * Section D needs no database at all: it greps the working tree for the things scope
 * item 12 forbids (a service-role key under src/, access_token_hash in frontend code,
 * a secret in a VITE_* variable, a committable env file).
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
 * `token` is the anon key for anonymous calls and a user access token for signed-in
 * ones. `apikey` stays the anon key in both cases, which is exactly how supabase-js
 * behaves in the browser — so a signed-in probe exercises the same request shape the
 * admin panel produces, not a privileged side channel.
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
 * (`{code, message, …}`), so counting "any truthy body" as one row would read a 401
 * permission-denied — the strongest possible refusal — as a one-row leak.
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

// The exact column list the admin queue selects. Used verbatim so the probe measures the
// real query rather than a convenient approximation of it.
const QUEUE_COLUMNS =
  "id,order_id,student_name,student_email,student_phone,course_title_snapshot,price_amount,price_currency,status,created_at";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------------
// Section D helpers — a recursive walk of the working tree, skipping build output.
// ---------------------------------------------------------------------------------
const IGNORED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".vite", "coverage"]);

const walkFiles = (dir) => {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      found.push(...walkFiles(path.join(dir, entry.name)));
    } else {
      found.push(path.join(dir, entry.name));
    }
  }
  return found;
};

/**
 * Blank out comments while preserving line numbers.
 *
 * Section D asks what the *code* does, and this codebase documents its security
 * invariants in prose: `admin.service.ts` says "No service-role key is involved at any
 * point", `adminEnrollment.service.ts` says access_token_hash "must never reach the
 * browser". A naive text search flags those sentences as violations of the very rules
 * they assert. Comment bodies are replaced with spaces rather than removed so reported
 * line numbers still point at the real line.
 */
const blankComments = (content) =>
  content
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, prefix) => prefix + " ".repeat(match.length - prefix.length));

/**
 * Search a tree for a pattern in executable code.
 *
 * `skipFiles` names files whose matches are meaningful but harmless — currently only the
 * generated `database.types.ts`, which mirrors the Postgres schema and therefore has to
 * name every column that exists. Declaring a column in a type is not the same as
 * selecting it, and regenerating types must not be able to fail this suite.
 */
const grepCode = (dir, pattern, { skipFiles = [] } = {}) => {
  const hits = [];
  for (const file of walkFiles(dir)) {
    if (skipFiles.some((name) => file.endsWith(name))) continue;

    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }

    blankComments(content)
      .split(/\r?\n/)
      .forEach((line, index) => {
        if (pattern.test(line)) {
          hits.push(`${path.relative(projectRoot, file)}:${index + 1}`);
        }
      });
  }
  return hits;
};

/** Every line of a tree matching a pattern, comments included. For credential shapes. */
const grepRaw = (dir, pattern) => {
  const hits = [];
  for (const file of walkFiles(dir)) {
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    content.split(/\r?\n/).forEach((line, index) => {
      if (pattern.test(line)) {
        hits.push(`${path.relative(projectRoot, file)}:${index + 1}`);
      }
    });
  }
  return hits;
};

const main = async () => {
  console.log("=== Phase 4 admin-panel probes ===\n");

  // -------------------------------------------------------------------------------
  // Pre-flight: are the migration 007 functions actually there? A missing function
  // returns 404 to everyone, which would make every negative probe below pass for
  // entirely the wrong reason.
  //
  // Each one must be called with its REAL argument names. PostgREST resolves an RPC by
  // name *and* signature, so calling review_enrollment with `{}` returns 404 PGRST202
  // ("no function without parameters") even though the function exists — which would
  // report a perfectly healthy database as un-migrated.
  // -------------------------------------------------------------------------------
  {
    const signatures = [
      ["admin_enrollment_stats", {}],
      ["get_enrollment_history", { p_enrollment_id: NIL_UUID }],
      ["review_enrollment", { p_enrollment_id: NIL_UUID, p_status: "approved", p_admin_note: null }],
    ];

    const present = [];
    for (const [fn, args] of signatures) {
      const r = await rpc(fn, args);
      // A 404 with PGRST202 is the only "does not exist" answer. Anything else — most
      // likely a privilege refusal, which is what anon should get — proves it is there.
      const missing = r.status === 404 && String(r.body?.code ?? "").startsWith("PGRST20");
      present.push({ fn, status: r.status, missing });
    }

    const missing = present.filter((entry) => entry.missing).map((entry) => entry.fn);
    if (missing.length > 0) {
      console.error(
        `\nMIGRATION 007 NOT APPLIED: ${missing.join(", ")} not found.\n` +
          "Apply supabase/migrations/007_admin_review_functions.sql first, then re-run.",
      );
      process.exitCode = 3;
      return;
    }
    console.log(
      `Pre-flight: all three migration 007 functions exist (${present
        .map((entry) => `${entry.fn}→HTTP ${entry.status}`)
        .join(", ")}).\n`,
    );
  }

  console.log("--- Section A: the anonymous visitor ---\n");

  // A1–A3. The enrollments table. anon holds no privilege on it at all, so read, write
  // and delete must every one fail. A "200 []" here would still be a pass for the read
  // (RLS filtered it) but a 401 is what this schema should produce.
  {
    const r = await call(`/rest/v1/enrollments?select=${QUEUE_COLUMNS}&limit=5`);
    record(
      "A1. anon SELECT on enrollments",
      rowsOf(r.body) === 0,
      `HTTP ${r.status} · ${rowsOf(r.body)} row(s) · ${summarise(r.body)}`,
    );
  }
  {
    const r = await call("/rest/v1/enrollments?status=eq.pending_review", {
      method: "PATCH",
      body: JSON.stringify({ status: "approved", admin_note: "forged by probe" }),
    });
    record(
      "A2. anon UPDATE on enrollments (forge an approval)",
      r.status >= 400,
      `HTTP ${r.status} · ${summarise(r.body)}`,
    );
  }
  {
    const r = await call("/rest/v1/enrollments?status=eq.pending_review", { method: "DELETE" });
    record(
      "A3. anon DELETE on enrollments",
      r.status >= 400,
      `HTTP ${r.status} · ${summarise(r.body)}`,
    );
  }

  // A4–A5. The audit trail and the admin roster. Migration 006 revoked everything on
  // `admins` from anon explicitly; this is the check that keeps that true.
  {
    const r = await call("/rest/v1/enrollment_status_history?select=*&limit=5");
    record(
      "A4. anon SELECT on enrollment_status_history",
      rowsOf(r.body) === 0,
      `HTTP ${r.status} · ${rowsOf(r.body)} row(s) · ${summarise(r.body)}`,
    );
  }
  {
    const r = await call("/rest/v1/admins?select=*&limit=5");
    record(
      "A5. anon SELECT on admins",
      rowsOf(r.body) === 0 && r.status >= 400,
      `HTTP ${r.status} (expect 4xx: migration 006 revoked all grants) · ${rowsOf(r.body)} row(s) · ${summarise(r.body)}`,
    );
  }
  {
    const r = await call("/rest/v1/admin_settings?select=*&limit=5");
    record(
      "A6. anon SELECT on admin_settings",
      rowsOf(r.body) === 0,
      `HTTP ${r.status} · ${rowsOf(r.body)} row(s) · ${summarise(r.body)}`,
    );
  }

  // A7–A9. The three migration 007 functions. EXECUTE was granted to `authenticated`
  // only, so anon must be refused before any function body runs.
  {
    const checks = [];
    const stats = await rpc("admin_enrollment_stats", {});
    checks.push(["admin_enrollment_stats", stats.status >= 400, `HTTP ${stats.status} ${summarise(stats.body)}`]);

    const history = await rpc("get_enrollment_history", { p_enrollment_id: NIL_UUID });
    checks.push(["get_enrollment_history", history.status >= 400, `HTTP ${history.status} ${summarise(history.body)}`]);

    const review = await rpc("review_enrollment", {
      p_enrollment_id: NIL_UUID,
      p_status: "approved",
      p_admin_note: "forged by probe",
    });
    checks.push(["review_enrollment", review.status >= 400, `HTTP ${review.status} ${summarise(review.body)}`]);

    record(
      "A7. anon EXECUTE on the three admin functions",
      checks.every(([, pass]) => pass),
      checks.map(([label, pass, detail]) => `${label}: ${detail}${pass ? "" : " ← ALLOWED"}`).join(" | "),
    );
  }

  // A8–A10. Receipts.
  //
  // A real object is uploaded first. Without one, "LIST returned nothing" is true of an
  // empty bucket regardless of policy, and asking Storage to sign a key that does not
  // exist answers NoSuchKey — a refusal for the wrong reason, which proves nothing about
  // who is allowed to read receipts. anon holds INSERT on this bucket and nothing else,
  // which is exactly what the student upload step needs, so creating the object is also
  // a check that Phase 3's upload path still works.
  let probeObjectKey = null;
  {
    const draftId = crypto.randomUUID();
    const key = `${draftId}/${crypto.randomUUID()}.png`;

    const signedUpload = await fetch(`${URL_BASE}/storage/v1/object/upload/sign/receipts/${key}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const signedUploadBody = await signedUpload.json().catch(() => null);

    if (signedUpload.status === 200 && signedUploadBody?.token) {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      const put = await fetch(
        `${URL_BASE}/storage/v1/object/upload/sign/receipts/${key}?token=${encodeURIComponent(signedUploadBody.token)}`,
        { method: "PUT", headers: { "Content-Type": "image/png" }, body: png },
      );
      if (put.status === 200) probeObjectKey = key;
      record(
        "A8. anon can still upload a receipt (Phase 3 precondition for A9/A10)",
        put.status === 200,
        `sign HTTP ${signedUpload.status} · PUT HTTP ${put.status}`,
      );
    } else {
      record(
        "A8. anon can still upload a receipt (Phase 3 precondition for A9/A10)",
        false,
        `sign HTTP ${signedUpload.status} · ${summarise(signedUploadBody)}`,
      );
    }
  }
  {
    const response = await fetch(`${URL_BASE}/storage/v1/object/list/receipts`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prefix: "", limit: 100 }),
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
    const leaked = Array.isArray(parsed) && parsed.length > 0;
    record(
      "A9. anon LIST on the receipts bucket",
      !leaked && Boolean(probeObjectKey),
      `HTTP ${response.status} · ${leaked ? `LEAKED ${parsed.length} OBJECT(S)` : "no objects listed"}` +
        (probeObjectKey
          ? " · bucket is known non-empty, so this is not a vacuous pass"
          : " · INCONCLUSIVE: nothing was uploaded"),
    );
  }
  {
    // Minting a signed URL is the admin panel's own receipt mechanism, so anon asking
    // for one is the attack this probe exists for. The key used really exists — section
    // A just uploaded it — so a refusal cannot be dismissed as "no such object".
    //
    // WHY THE ANSWER IS "NoSuchKey" AND WHY THAT IS THE RIGHT ANSWER
    // Storage resolves the object through RLS on storage.objects before signing. anon has
    // no SELECT policy on that bucket, so the row is invisible and the API reports
    // not-found rather than forbidden — it declines to confirm the object exists to a
    // caller who is not allowed to see it. That is a stronger outcome than a 403, which
    // would itself be an existence oracle. A9 shows the same mechanism: LIST returns
    // nothing from a bucket that is known to hold an object.
    //
    // What distinguishes "invisible to anon" from "genuinely absent" is C5, which signs
    // THIS SAME KEY as an admin and expects 200. The pair is the real evidence; A10 alone
    // cannot tell the two apart, which is why its detail says so when C5 is skipped.
    const key = probeObjectKey ?? `${NIL_UUID}/${NIL_UUID}.png`;
    const response = await fetch(`${URL_BASE}/storage/v1/object/sign/receipts/${key}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
    });
    const text = await response.text();
    const adminControlWillRun = Boolean(env.PROBE_ADMIN_EMAIL && env.PROBE_ADMIN_PASSWORD);
    record(
      "A10. anon createSignedUrl on a receipt object that exists",
      response.status !== 200 && Boolean(probeObjectKey),
      `HTTP ${response.status} · object ${probeObjectKey ? "EXISTS (uploaded in A8)" : "MISSING (inconclusive)"} · ` +
        (adminControlWillRun
          ? "C5 signs the same key as an admin — see that result for proof the policy discriminates"
          : "NOTE: C5 is skipped, so this run does not prove an admin CAN sign the same key") +
        ` · ${summarise(text)}`,
    );
  }

  // A11. Positive control for the whole anon section: the student-facing surface must
  // still work. Without this, a database with every grant dropped would score 100%.
  {
    const courses = await call("/rest/v1/courses?select=slug,title&limit=5");
    const payment = await call("/rest/v1/payment_settings?select=bank_name,is_active");
    const token = await rpc("get_enrollment_by_token", { p_access_token: "not-a-real-token" });

    const coursesOk = courses.status === 200 && rowsOf(courses.body) > 0;
    const paymentOk = payment.status === 200 && rowsOf(payment.body) === 1;
    const tokenOk = token.status !== 404; // the function still exists for students

    record(
      "A11. Phase 3 student surface still reachable by anon (positive control)",
      coursesOk && paymentOk && tokenOk,
      `courses HTTP ${courses.status} ${rowsOf(courses.body)} row(s) | payment_settings HTTP ${payment.status} ${rowsOf(payment.body)} row(s) | get_enrollment_by_token HTTP ${token.status}`,
    );
  }

  console.log("\n--- Section B: a signed-in NON-admin ---\n");

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
    // B1. Confirm the account really is a non-admin, otherwise every check below is
    // testing the wrong identity and would pass for the wrong reason.
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
      // B2. `authenticated` holds SELECT on enrollments, so this returns 200 — but the
      // admin policy filters every row away. "200 []" is the correct pass here; a row
      // would be a serious leak.
      {
        const r = await call(`/rest/v1/enrollments?select=${QUEUE_COLUMNS}&limit=5`, {
          token: nonAdminToken,
        });
        record(
          "B2. non-admin SELECT on enrollments",
          rowsOf(r.body) === 0,
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s) — RLS-filtered, not privilege-denied · ${summarise(r.body)}`,
        );
      }
      {
        const r = await call("/rest/v1/enrollment_status_history?select=*&limit=5", {
          token: nonAdminToken,
        });
        record(
          "B3. non-admin SELECT on enrollment_status_history",
          rowsOf(r.body) === 0,
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s)`,
        );
      }
      {
        // The `admins` SELECT policy is self-only. A non-admin has no row, so this is
        // also what makes AdminGuard deny them: the profile query returns nothing.
        const r = await call("/rest/v1/admins?select=id,name,email&limit=5", {
          token: nonAdminToken,
        });
        record(
          "B4. non-admin SELECT on admins (what AdminGuard relies on)",
          rowsOf(r.body) === 0,
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s)`,
        );
      }
      {
        const r = await call("/rest/v1/enrollments?status=eq.pending_review", {
          token: nonAdminToken,
          method: "PATCH",
          body: JSON.stringify({ status: "approved" }),
        });
        // The admin UPDATE policy has no matching row for a non-admin, so nothing is
        // updated. PostgREST reports that as 200 with an empty array, or 4xx.
        const changed = rowsOf(r.body) > 0;
        record(
          "B5. non-admin UPDATE on enrollments",
          !changed,
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s) affected · ${summarise(r.body)}`,
        );
      }
      {
        // The functions ARE executable by `authenticated` — the guard is the is_admin()
        // check inside each body, which must raise 42501. This is the check that proves
        // authorization lives in the database and not in the React guard.
        const checks = [];

        const stats = await rpc("admin_enrollment_stats", {}, nonAdminToken);
        checks.push([
          "admin_enrollment_stats",
          stats.status >= 400 && stats.body?.code === "42501",
          `HTTP ${stats.status} code=${stats.body?.code ?? "?"}`,
        ]);

        const history = await rpc("get_enrollment_history", { p_enrollment_id: NIL_UUID }, nonAdminToken);
        checks.push([
          "get_enrollment_history",
          history.status >= 400 && history.body?.code === "42501",
          `HTTP ${history.status} code=${history.body?.code ?? "?"}`,
        ]);

        const review = await rpc(
          "review_enrollment",
          { p_enrollment_id: NIL_UUID, p_status: "approved", p_admin_note: null },
          nonAdminToken,
        );
        checks.push([
          "review_enrollment",
          review.status >= 400 && review.body?.code === "42501",
          `HTTP ${review.status} code=${review.body?.code ?? "?"}`,
        ]);

        record(
          "B6. non-admin calling the admin functions gets 42501",
          checks.every(([, pass]) => pass),
          checks.map(([label, pass, detail]) => `${label}: ${detail}${pass ? "" : " ← NOT 42501"}`).join(" | "),
        );
      }
      {
        const response = await fetch(
          `${URL_BASE}/storage/v1/object/sign/receipts/${NIL_UUID}/${NIL_UUID}.png`,
          {
            method: "POST",
            headers: {
              apikey: ANON,
              Authorization: `Bearer ${nonAdminToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ expiresIn: 60 }),
          },
        );
        const text = await response.text();
        record(
          "B7. non-admin createSignedUrl on a receipt",
          response.status !== 200,
          `HTTP ${response.status} · "Admins can read receipts" requires is_admin() · ${summarise(text)}`,
        );
      }
    }
  }

  console.log("\n--- Section C: a signed-in admin (positive control) ---\n");

  let adminToken = null;
  if (!env.PROBE_ADMIN_EMAIL || !env.PROBE_ADMIN_PASSWORD) {
    skip(
      "C. admin positive-control probes",
      "PROBE_ADMIN_EMAIL / PROBE_ADMIN_PASSWORD not set in .env.local — the admin panel's happy path is NOT proven by this run.",
    );
  } else {
    const session = await signIn(env.PROBE_ADMIN_EMAIL, env.PROBE_ADMIN_PASSWORD);
    adminToken = session.token;
    record(
      "C0. admin can sign in (precondition)",
      Boolean(adminToken),
      `HTTP ${session.status} · ${adminToken ? "session obtained" : summarise(session.body)}`,
    );
  }

  if (adminToken) {
    const isAdmin = await rpc("is_admin", {}, adminToken);
    const confirmed = isAdmin.status === 200 && isAdmin.body === true;
    record(
      "C1. is_admin() is true for this account",
      confirmed,
      `HTTP ${isAdmin.status} · is_admin=${JSON.stringify(isAdmin.body)}`,
    );

    {
      const r = await call("/rest/v1/admins?select=id,name,email", { token: adminToken });
      record(
        "C2. admin reads own profile (what AdminGuard needs to allow entry)",
        r.status === 200 && rowsOf(r.body) === 1,
        `HTTP ${r.status} · ${rowsOf(r.body)} row(s)`,
      );
    }
    {
      const r = await rpc("admin_enrollment_stats", {}, adminToken);
      const row = Array.isArray(r.body) ? r.body[0] : r.body;
      const hasCounts =
        r.status === 200 && row && ["pending_review", "approved", "rejected", "cancelled", "total"].every((key) => key in row);
      record(
        "C3. admin_enrollment_stats() returns the dashboard counts",
        Boolean(hasCounts),
        `HTTP ${r.status} · ${summarise(row)}`,
      );
    }
    {
      const r = await call(`/rest/v1/enrollments?select=${QUEUE_COLUMNS}&limit=5`, { token: adminToken });
      const ok = r.status === 200;
      record(
        "C4. admin SELECT on enrollments (the queue query)",
        ok,
        `HTTP ${r.status} · ${rowsOf(r.body)} row(s)` +
          (rowsOf(r.body) === 0 ? " · NOTE: table is empty, so this proves access but not rendering" : ""),
      );
    }
    {
      // Receipt access, end to end: mint a signed URL for a real object and fetch it.
      // Prefers a genuine enrollment receipt; falls back to the object section A
      // uploaded, so the admin read path is proven even on an empty database. Both cases
      // exercise the same "Admins can read receipts" policy that A10 just showed refuses
      // anon — the pair is what demonstrates the policy discriminates rather than merely
      // blocking or merely allowing.
      const withReceipt = await call(
        "/rest/v1/enrollments?select=receipt_path&receipt_path=not.is.null&limit=1",
        { token: adminToken },
      );
      const enrollmentReceipt = Array.isArray(withReceipt.body) ? withReceipt.body[0]?.receipt_path : null;
      const target = enrollmentReceipt ?? probeObjectKey;
      const source = enrollmentReceipt ? "a real enrollment receipt" : "the object uploaded in section A";

      if (!target) {
        skip(
          "C5. admin signed URL resolves to a receipt",
          "No receipt object available — neither an enrollment receipt nor a probe upload.",
        );
      } else {
        const signed = await fetch(`${URL_BASE}/storage/v1/object/sign/receipts/${target}`, {
          method: "POST",
          headers: {
            apikey: ANON,
            Authorization: `Bearer ${adminToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expiresIn: 60 }),
        });
        const signedBody = await signed.json().catch(() => null);
        const signedPath = signedBody?.signedURL ?? signedBody?.signedUrl ?? null;

        // Fetched with NO credentials at all: a signed URL must carry its own authority,
        // which is the whole reason it can be handed to the browser.
        let fetched = null;
        if (signedPath) {
          const resolved = await fetch(`${URL_BASE}/storage/v1${signedPath}`);
          fetched = resolved.status;
        }

        record(
          "C5. admin signed URL resolves to a receipt",
          signed.status === 200 && fetched === 200,
          `sign HTTP ${signed.status} · unauthenticated fetch of the signed URL HTTP ${fetched ?? "not attempted"} · TTL 60s · target: ${source}`,
        );
      }
    }
  }

  console.log("\n--- Section D: the working tree ---\n");

  // D1. A service-role credential anywhere in the tree is the single most damaging
  // mistake this phase could make, so it is searched for by SHAPE rather than by name —
  // a key pasted under any variable name, or into any file, still matches.
  //
  //   InNlcnZpY2Vfcm9sZSI  — base64url of `"service_role"`, present in the payload of
  //                          every legacy service-role JWT
  //   sb_secret_           — prefix of the current-generation Supabase secret key
  //
  // `.env.local` is included deliberately: it is where a service-role key would most
  // plausibly end up. Only the file and line are ever reported, never the content.
  {
    const shape = /InNlcnZpY2Vfcm9sZSI|sb_secret_/;
    const hits = grepRaw(projectRoot, shape).filter((hit) => !hit.startsWith("scripts\\probes"));
    record(
      "D1. no service-role credential anywhere in the working tree",
      hits.length === 0,
      hits.length === 0
        ? "no service-role JWT payload or sb_secret_ key found (searched the tree including .env.local)"
        : `FOUND at: ${hits.join(", ")}`,
    );
  }

  // D2. And no frontend code that reaches for one. Prose is excluded, so the header
  // comments that promise "no service-role key is involved" are not read as breaking
  // that promise; what remains would be an actual identifier or env lookup.
  {
    const hits = grepCode(path.join(projectRoot, "src"), /service[_-]?role|serviceRole|SERVICE_ROLE/i);
    record(
      "D2. no service-role reference in code under src/",
      hits.length === 0,
      hits.length === 0 ? "clean (comments excluded — code only)" : `FOUND: ${hits.join(", ")}`,
    );
  }

  // D3. access_token_hash is the student's capability credential: possession of the
  // token it hashes is what authorises reading an enrollment. Admin queries use explicit
  // column lists so it cannot be selected; this proves no frontend code names it.
  // `database.types.ts` is excluded — it is generated from the schema and must describe
  // every column the table has, which is a declaration, not a read.
  {
    const hits = grepCode(path.join(projectRoot, "src"), /access_token_hash/, {
      skipFiles: ["database.types.ts"],
    });
    record(
      "D3. no access_token_hash in code under src/ (generated types excluded)",
      hits.length === 0,
      hits.length === 0 ? "clean — no query or type selects it" : `FOUND: ${hits.join(", ")}`,
    );
  }

  // D4. Anything VITE_-prefixed is compiled into the public bundle. A name suggesting a
  // secret in .env.example would be an invitation to put a real one there.
  {
    const examplePath = path.join(projectRoot, ".env.example");
    const content = fs.readFileSync(examplePath, "utf8");
    const declared = content
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
      .filter(Boolean);

    const dangerous = declared.filter(([, name]) => /SERVICE|SECRET|PRIVATE/.test(name) && name.startsWith("VITE_"));
    const populated = declared.filter(([, name, value]) => name.startsWith("VITE_") && value.trim().length > 0);

    record(
      "D4. .env.example declares no VITE_ secret and no real value",
      dangerous.length === 0 && populated.length === 0,
      dangerous.length === 0 && populated.length === 0
        ? `${declared.length} variable(s) declared, all empty`
        : `dangerous=${dangerous.map(([, n]) => n).join(",") || "none"} populated=${populated.map(([, n]) => n).join(",") || "none"}`,
    );
  }

  // D5. .env.local holds the anon key today and probe passwords from now on. It must be
  // impossible to commit either.
  {
    const gitignore = fs.readFileSync(path.join(projectRoot, ".gitignore"), "utf8");
    const patterns = gitignore.split(/\r?\n/).map((line) => line.trim());
    const covering = patterns.filter((line) =>
      [".env.local", ".env*", ".env.*", "*.local"].includes(line),
    );
    record(
      "D5. .gitignore prevents committing local env files",
      covering.length > 0,
      covering.length > 0
        ? `matched by: ${covering.join(", ")}`
        : "NO PATTERN COVERS .env.local",
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
      "\nTo run the skipped sections, create two accounts in the Supabase Dashboard\n" +
        "(Authentication → Users → Add user, with 'Auto Confirm User' ticked — this project\n" +
        "requires email confirmation and rejects @example.com addresses), then add to .env.local:\n" +
        "\n" +
        "  PROBE_ADMIN_EMAIL=      PROBE_ADMIN_PASSWORD=\n" +
        "  PROBE_NONADMIN_EMAIL=   PROBE_NONADMIN_PASSWORD=\n" +
        "\n" +
        "Link only the first one into public.admins with supabase/maintenance/grant_admin.sql.\n" +
        "Leave the second out of that table — being a non-admin is the whole point of it.",
    );
  }

  if (probeObjectKey) {
    console.log(
      "\nNOTE: this run uploaded ONE object to the private receipts bucket, so that A9, A10\n" +
        "and C5 test a real key rather than a missing one. Every run adds one more.\n" +
        `      receipts/${probeObjectKey}\n` +
        "\n" +
        "phase3-teardown.sql does NOT remove storage objects — deleting the row while leaving\n" +
        "the file is exactly what storage.protect_delete() guards against. Use its orphan-listing\n" +
        "query (see the RECEIPT OBJECTS section) and then delete through the Storage API or the\n" +
        "Dashboard under Storage → receipts.",
    );
  }

  process.exitCode = failed.length > 0 ? 1 : 0;
};

main().catch((error) => {
  console.error("Probe run failed:", error);
  process.exitCode = 2;
});
