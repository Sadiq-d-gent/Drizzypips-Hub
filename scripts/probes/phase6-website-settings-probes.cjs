/**
 * Phase 6 website settings probes.
 *
 * Phase 6 added public.website_settings — the third settings table, and the first one whose
 * every column is deliberately world-readable. This suite asks the same three questions the
 * Phase 4, 5a and 5b suites ask, about that surface:
 *
 *   A. Can `anon` reach it?                 (must be: READ yes, WRITE no)
 *   B. Can a signed-in NON-admin reach it?  (must be: READ yes, WRITE no)
 *   C. Can a signed-in admin reach it?      (must be: yes — and the URL constraints must
 *                                            still refuse a `javascript:` value from them)
 *
 * WHY A PUBLIC READ IS THE EXPECTED ANSWER HERE, UNLIKE THE OTHER TWO SETTINGS TABLES
 * admin_settings is revoked from anon outright (003:145) because it carries
 * notification_email. payment_settings is filtered to `is_active = true` because a superseded
 * account number must not reach a student. website_settings is neither: every column is copy
 * printed on a public page, so 011 gives it a flat `using (true)` SELECT policy for anon and
 * authenticated. A probe asserting "anon cannot read this" would be asserting the opposite of
 * the design. What IS worth proving is that the read is the ONLY thing anon can do, and that
 * the column set is exactly the documented one — because the whole justification for a plain
 * policy instead of a narrowing RPC is that there is no field here to withhold. A column that
 * appeared without being noticed would silently invalidate that.
 *
 * WHY THE ASSERTIONS ARE NOT UNIFORM — the same trap Phase 5a and 5b document
 * Refusal shape depends on the grants, and asserting the wrong one produces a false pass.
 * Verified from the live grants: website_settings follows the payment_settings shape, NOT the
 * admin_settings shape — `anon` holds ordinary SELECT/INSERT/UPDATE/DELETE table grants, so
 * RLS is the only barrier. Therefore:
 *
 *   INSERT          — hits the WITH CHECK on "Admins can insert website settings" and raises.
 *                     Expect HTTP 4xx / 42501.
 *   UPDATE, DELETE  — have no USING policy applicable to anon, so PostgREST simply filters
 *                     every row away and returns HTTP 2xx with ZERO ROWS. Asserting
 *                     `status >= 400` there would FAIL against a correctly configured
 *                     database, which is exactly the false negative this comment exists to
 *                     prevent.
 *
 * HOW A REFUSED WRITE IS PROVEN, GIVEN "ZERO ROWS" IS ALSO WHAT A NON-MATCHING FILTER SAYS
 * Every write probe sends `Prefer: return=representation` and then re-reads the row in a
 * SEPARATE request. Checking a write inside the statement that attempted it reads the
 * pre-statement snapshot and has produced a false pass twice in this project. The UPDATE
 * probes compare `updated_at` against the value captured at pre-flight, because 011's
 * BEFORE UPDATE trigger would have moved it had the statement touched the row.
 *
 * THE `javascript:` PROBE IS THE POINT OF SECTION C
 * 011 puts `check (col is null or col ~* '^https?://')` on all five URL columns, and the
 * migration says why: these values flow straight into an `<a href>`, and anything holding a
 * valid admin session can write to this table directly through PostgREST, bypassing the Zod
 * schema entirely. That claim is only true if the constraint is actually present and actually
 * bites. It cannot be tested as anon — anon cannot write at all, so the RLS refusal would
 * arrive first and mask the constraint. It needs an admin session, which is why C3 is the
 * probe that skips without PROBE_ADMIN_PASSWORD.
 *
 * WHAT THIS SUITE CHANGES ON THE TARGET DATABASE
 * Section A's UPDATE writes the row's own value back to itself, so even a hypothetical
 * success changes no meaning. Section C genuinely writes: C1 sets `footer_tagline` to a
 * marker and reads it back in a separate request, C3 does the same with a real https:// value
 * on telegram_url, and C5 schedules a session in the three `countdown_*` columns. All five
 * columns are restored in a `finally`, reported as C6, so a crash mid-probe cannot leave probe
 * text on the live footer or a fictional session in the live hero. Every restore goes back to
 * whatever was there before, which may be NULL — NULL is the normal state of this table and
 * means "use the compiled-in default". `updated_at` does move as a result, which is harmless
 * and unavoidable.
 *
 * The DELETE probes cannot be made harmless. The full row is captured at pre-flight and
 * printed as recovery data if a delete ever succeeds; for this table recovery is also just
 * `insert into public.website_settings (id) values (true);`, because a row of all-NULLs is
 * the seeded state and the site reads identically with the row absent.
 *
 * Credentials are read from `.env.local`, never from the command line and never printed. The
 * anon key is required. Sections B and C use the same OPTIONAL keys as the Phase 4, 5a and 5b
 * suites:
 *
 *   PROBE_ADMIN_EMAIL / PROBE_ADMIN_PASSWORD        — an account linked in public.admins
 *   PROBE_NONADMIN_EMAIL / PROBE_NONADMIN_PASSWORD  — an account NOT in public.admins
 *
 * Absent credentials produce SKIP, never PASS — and never FAIL either. A probe that reports a
 * verdict on evidence it does not have is worse than one that admits it did not run.
 *
 * Section D needs no database. It checks the claims Phase 6 and the countdown added after it
 * make in prose and could break silently: that the service's column list still matches the
 * migrations, that every SQL-constrained URL column also has a Zod rule, that the upsert never
 * sends `updated_at`, that no public page imports the admin service module the split exists to
 * keep out, and that the countdown's three columns are declared in SQL and validated in Zod.
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

const MIGRATION_011 = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "011_create_website_settings.sql",
);
const MIGRATION_012 = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "012_add_mentorship_countdown.sql",
);
const WEBSITE_SERVICE_TS = path.join(projectRoot, "src", "services", "websiteSettings.service.ts");
const ADMIN_SERVICE_TS = path.join(projectRoot, "src", "services", "adminSettings.service.ts");
const SETTINGS_SCHEMA_TS = path.join(projectRoot, "src", "lib", "validation", "settings.schema.ts");

/**
 * The twenty-one content columns, in the order 011 and 012 declare them.
 *
 * `id` and `created_at` are deliberately absent: the first is a constant `true` and the
 * second is never displayed, which is why WEBSITE_SETTINGS_COLUMNS omits both. `updated_at`
 * is tracked separately below because it is read but never written.
 *
 * The three `countdown_*` columns were added by 012 and belong on this list for the reason
 * every other column does — they are printed in the homepage hero. That they are here is what
 * makes A3 a real assertion: a column added to a world-readable table without anyone noticing
 * is the thing that probe exists to catch, and it can only notice by comparing against a list
 * someone had to edit deliberately.
 */
const CONTENT_COLUMNS = [
  "hero_title",
  "hero_subtitle",
  "hero_stat_1_value",
  "hero_stat_1_label",
  "hero_stat_2_value",
  "hero_stat_2_label",
  "hero_stat_3_value",
  "hero_stat_3_label",
  "countdown_enabled",
  "countdown_title",
  "countdown_session_at",
  "telegram_url",
  "signal_group_url",
  "broker_name",
  "broker_description",
  "broker_url",
  "instagram_url",
  "tiktok_url",
  "contact_email",
  "footer_tagline",
  "footer_copyright",
];

/**
 * Whether a content column has actually been configured.
 *
 * Every column on this table is nullable and defaults to NULL — except `countdown_enabled`,
 * which 012 declares `not null default false`, because "show a countdown" is a decision with a
 * safe answer where "what is the headline" is not. So the plain `!== null` test the pre-flight
 * summary uses would report it as set on a completely untouched table, and the summary would
 * read as though someone had configured the site. `false` is its unset state.
 *
 * The `undefined` half of the text test is not defensive padding: the pre-flight reads with
 * `select=*`, so a column this file knows about but the target database has not got yet — 012
 * not applied — comes back absent rather than null. A bare `!== null` reported those columns as
 * *configured*, which is the opposite of the truth and buries the real problem under a summary
 * that reads fine. A3 is the probe that names a missing column; this one must not contradict it.
 */
const isConfigured = (row, column) =>
  column === "countdown_enabled"
    ? row[column] === true
    : row[column] !== null && row[column] !== undefined;

/** What the public read layer asks for: the content columns plus updated_at. */
const READ_COLUMNS = [...CONTENT_COLUMNS, "updated_at"];

/** Every column of the table, `select=*` included. */
const ALL_COLUMNS = ["id", ...CONTENT_COLUMNS, "created_at", "updated_at"];

/** The five columns 011 constrains to an http(s) scheme. */
const URL_COLUMNS = [
  "telegram_url",
  "signal_group_url",
  "broker_url",
  "instagram_url",
  "tiktok_url",
];

/** The three columns 012 adds for the hero countdown. */
const COUNTDOWN_COLUMNS = ["countdown_enabled", "countdown_title", "countdown_session_at"];

/**
 * The two form fields the session moment arrives as.
 *
 * Not columns, and that is the point of naming them here: `countdown_session_at` is one
 * `timestamptz` so every visitor reaches zero at the same instant, while the administrator
 * types a wall-clock date and time. D5 checks both halves of that split are validated, because
 * a date with no time is a value the row cannot hold.
 */
const COUNTDOWN_FORM_FIELDS = ["countdown_session_date", "countdown_session_time"];

/** Values that must never be storable in a column whose value becomes an href. */
const HOSTILE_URLS = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "data:text/html,<script>alert(1)</script>",
];

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
 * `apikey` stays the anon key in both cases, which is how supabase-js behaves in the browser
 * — so a signed-in probe exercises the request shape the admin panel produces rather than a
 * privileged side channel.
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

/** A write that asks for the affected rows back, which is what makes "zero rows" legible. */
const write = (pathname, method, payload, token) =>
  call(pathname, {
    token,
    method,
    headers: { Prefer: "return=representation" },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });

/**
 * Rows actually returned.
 *
 * Only an array body carries rows. A PostgREST error body is a bare object
 * (`{code, message, …}`), so counting "any truthy body" as one row would read a permission
 * denial — the strongest possible refusal — as a one-row leak.
 */
const rowsOf = (body) => (Array.isArray(body) ? body.length : 0);

/** SQLSTATE from a PostgREST error body, when there is one. */
const codeOf = (body) =>
  body && typeof body === "object" && !Array.isArray(body) ? body.code : null;

const signIn = async (email, password) => {
  const response = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, token: body?.access_token ?? null, body };
};

/** The single row, read the way any caller reads it. A separate request every time. */
const readRow = async (token, select = "*") => {
  const r = await call(`/rest/v1/website_settings?select=${encodeURIComponent(select)}`, { token });
  const row = Array.isArray(r.body) ? (r.body[0] ?? null) : null;
  return { status: r.status, body: r.body, row, rows: rowsOf(r.body) };
};

/**
 * The three write attempts every unprivileged identity must lose, asserted in the shape that
 * identity's grants actually produce.
 *
 * Shared between Section A (anon) and Section B (signed-in non-admin) because the expected
 * outcome is identical — `is_admin()` is false for both, and neither has any policy that
 * applies. Writing it once means the two sections cannot drift into asserting different
 * things about the same guarantee.
 */
const probeUnprivilegedWrites = async ({ label, token, baseline }) => {
  // INSERT: refused at the WITH CHECK, so this one DOES raise. A second row would also
  // collide with the boolean primary key, so `id` is left to its default and the 42501 is
  // what proves RLS answered first — a 23505 here would mean the policy let it through and
  // only the key stopped it.
  {
    const attempt = await write(
      "/rest/v1/website_settings",
      "POST",
      { hero_title: `[probe-6] ${label} INSERT must be refused` },
      token,
    );
    const after = await readRow(token, "hero_title");

    record(
      `${label} INSERT on website_settings is refused`,
      attempt.status >= 400 &&
        rowsOf(attempt.body) === 0 &&
        after.row?.hero_title !== `[probe-6] ${label} INSERT must be refused`,
      `HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
        `separate re-read: hero_title ${after.row?.hero_title === null ? "still NULL" : summarise(after.row?.hero_title)}`,
    );
  }

  // UPDATE: no USING policy applies, so the row is filtered away and this returns 2xx with
  // zero rows. The value written is the row's OWN current value, so a hypothetical success
  // would change no meaning — `updated_at` is the evidence, read separately.
  {
    const attempt = await write(
      "/rest/v1/website_settings?id=eq.true",
      "PATCH",
      { footer_tagline: baseline.footer_tagline },
      token,
    );
    const after = await readRow(token, "updated_at");
    const untouched = after.row?.updated_at === baseline.updated_at;

    record(
      `${label} UPDATE on website_settings changes nothing`,
      (attempt.status >= 400 || rowsOf(attempt.body) === 0) && untouched,
      `PATCH HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
        `separate re-read: updated_at ${untouched ? "unchanged" : `MOVED to ${after.row?.updated_at}`}`,
    );
  }

  // DELETE: same shape as the UPDATE, and the one attempt here that cannot be made harmless.
  {
    const attempt = await write("/rest/v1/website_settings?id=eq.true", "DELETE", undefined, token);
    const after = await readRow(token, "id");
    const survived = after.rows === 1;

    record(
      `${label} DELETE on website_settings removes nothing`,
      (attempt.status >= 400 || rowsOf(attempt.body) === 0) && survived,
      `DELETE HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
        `separate re-read: row ${survived ? "still present" : "GONE"}`,
    );

    if (!survived) {
      console.log(
        "\n!! The website_settings row was deleted by an unprivileged caller. The public site\n" +
          "!! still renders — resolveWebsiteSettings falls back to the compiled-in copy — but\n" +
          "!! the admin form has nothing to update until the row is restored:\n" +
          "!!   insert into public.website_settings (id) values (true);\n" +
          "!! Values captured before the attempt:\n" +
          `!! ${JSON.stringify(baseline)}\n`,
      );
      return false;
    }
  }

  return true;
};

const main = async () => {
  console.log("=== Phase 6 website settings probes ===\n");

  // -------------------------------------------------------------------------------
  console.log("--- Pre-flight: what state is the target database in? ---\n");
  // -------------------------------------------------------------------------------
  //
  // The whole suite compares against the row as it stands right now, not against NULL. If an
  // administrator has already set the headline, "unchanged" is the invariant; "NULL" is not.

  let baseline = null;
  {
    const current = await readRow(undefined, "*");
    baseline = current.row;

    record(
      "P1. the seeded website_settings row exists and is readable",
      current.status === 200 && current.rows === 1 && baseline !== null,
      `HTTP ${current.status} · ${current.rows} row(s)`,
    );

    if (!baseline) {
      console.log(
        "\nThere is no website_settings row to probe, so every 'the write changed nothing'\n" +
          "assertion below would be a statement about an empty table rather than about RLS.\n" +
          "Restore it with:  insert into public.website_settings (id) values (true);\n",
      );
      process.exitCode = 2;
      return;
    }

    const set = CONTENT_COLUMNS.filter((column) => isConfigured(baseline, column));
    console.log(
      `      baseline: ${set.length}/${CONTENT_COLUMNS.length} content columns set` +
        (set.length === 0
          ? " ← nothing configured, the seeded state; the site is rendering compiled-in copy"
          : ` ← ${set.join(", ")}`),
    );
    console.log(`      baseline updated_at: ${baseline.updated_at}\n`);
  }

  // -------------------------------------------------------------------------------
  console.log("--- Section A: as anon ---\n");
  // -------------------------------------------------------------------------------

  // A1/A2/A3 are the positive half of this suite, and the reason 011 uses a policy rather
  // than a narrowing RPC. The claim is that there is nothing here to withhold; A3 is what
  // would notice if that stopped being true.
  {
    const named = await readRow(undefined, READ_COLUMNS.join(","));
    const keys = named.row ? Object.keys(named.row).sort() : [];

    record(
      "A1. anon SELECT on website_settings returns exactly one row",
      named.status === 200 && named.rows === 1,
      `HTTP ${named.status} · ${named.rows} row(s)`,
    );

    // Counts interpolated rather than spelled out. These two names carried the numbers as
    // words until 012 added three columns and made both of them wrong while the assertions
    // themselves stayed correct — a probe whose name lies is worse than one that is terse.
    record(
      `A2. the ${READ_COLUMNS.length} columns the read layer names all resolve`,
      JSON.stringify(keys) === JSON.stringify(READ_COLUMNS.slice().sort()),
      `${keys.length}/${READ_COLUMNS.length} keys` +
        (JSON.stringify(keys) === JSON.stringify(READ_COLUMNS.slice().sort())
          ? " · exactly the documented set"
          : ` · missing: [${READ_COLUMNS.filter((c) => !keys.includes(c)).join(", ")}] · extra: [${keys.filter((c) => !READ_COLUMNS.includes(c)).join(", ")}]`),
    );

    // `select=*` rather than the named list: a column added to this table without being
    // added to the read layer would be invisible to A2 and visible here. Every column of
    // this table is published to the world, so a new one is a decision that must be
    // deliberate — this probe is what makes it stop being silent.
    const star = await readRow(undefined, "*");
    const starKeys = star.row ? Object.keys(star.row).sort() : [];
    const unexpected = starKeys.filter((column) => !ALL_COLUMNS.includes(column));

    record(
      `A3. \`select=*\` exposes exactly the ${ALL_COLUMNS.length} documented columns and no others`,
      JSON.stringify(starKeys) === JSON.stringify(ALL_COLUMNS.slice().sort()),
      unexpected.length > 0
        ? `UNDOCUMENTED COLUMN PUBLISHED TO ANON: [${unexpected.join(", ")}] — every column of ` +
          "this table is world-readable, so confirm this one is meant to be"
        : `${starKeys.length}/${ALL_COLUMNS.length} columns · ${
            ALL_COLUMNS.filter((c) => !starKeys.includes(c)).length === 0
              ? "matches 011"
              : `missing: [${ALL_COLUMNS.filter((c) => !starKeys.includes(c)).join(", ")}]`
          }`,
    );
  }

  // A4/A5/A6. Read is public; write is not. See probeUnprivilegedWrites for why the three
  // assertions have three different shapes.
  const rowSurvivedAnon = await probeUnprivilegedWrites({
    label: "A4-A6. anon",
    token: undefined,
    baseline,
  });

  if (!rowSurvivedAnon) {
    console.log(
      "Stopping: the row is gone, so Sections B and C would be probing a table with nothing\n" +
        "in it and every result would be meaningless.\n",
    );
    process.exitCode = 1;
    return;
  }

  // -------------------------------------------------------------------------------
  console.log("\n--- Section B: as a signed-in non-admin ---\n");
  // -------------------------------------------------------------------------------
  //
  // A signed-in visitor is not a privileged one. 011 grants the three write policies to
  // `authenticated` but gates each on `public.is_admin()`, so holding a session must change
  // nothing here — and the READ must still work, because the policy names `authenticated`
  // alongside `anon` on purpose (an admin reads the row through it too, which is why there
  // is no fourth policy).

  if (!env.PROBE_NONADMIN_EMAIL || !env.PROBE_NONADMIN_PASSWORD) {
    skip(
      "B1. a signed-in non-admin can still read website_settings",
      "PROBE_NONADMIN_EMAIL / PROBE_NONADMIN_PASSWORD are not set in .env.local.",
    );
    skip("B2-B4. a signed-in non-admin cannot write to website_settings", "Same reason as B1.");
  } else {
    const session = await signIn(env.PROBE_NONADMIN_EMAIL, env.PROBE_NONADMIN_PASSWORD);

    if (!session.token) {
      skip(
        "B1. a signed-in non-admin can still read website_settings",
        `Sign-in failed with HTTP ${session.status}; no verdict is possible without a session.`,
      );
      skip("B2-B4. a signed-in non-admin cannot write to website_settings", "Same reason as B1.");
    } else {
      {
        const read = await readRow(session.token, READ_COLUMNS.join(","));
        record(
          "B1. a signed-in non-admin can still read website_settings",
          read.status === 200 && read.rows === 1,
          `HTTP ${read.status} · ${read.rows} row(s) · the SELECT policy names authenticated on purpose`,
        );
      }

      const rowSurvivedNonAdmin = await probeUnprivilegedWrites({
        label: "B2-B4. non-admin",
        token: session.token,
        baseline,
      });

      if (!rowSurvivedNonAdmin) {
        console.log("Stopping: the row is gone, so Section C would be probing nothing.\n");
        process.exitCode = 1;
        return;
      }
    }
  }

  // -------------------------------------------------------------------------------
  console.log("\n--- Section C: as a signed-in admin ---\n");
  // -------------------------------------------------------------------------------
  //
  // Three things need an admin session and cannot be reached without one:
  //
  //   1. that an admin CAN save — the negative probes above prove a locked table equally
  //      well whether the lock is correct or total, and a settings form nobody can use is a
  //      failure mode this suite would otherwise report as a clean pass;
  //   2. that the five URL check constraints refuse a `javascript:` value even from the one
  //      identity RLS lets through. That is the probe 011's own comment is a claim about;
  //   3. that 012's countdown constraint refuses a switched-on countdown with no session
  //      moment. The Zod schema refuses the same combination, but the schema is the courtesy
  //      half — an admin session can PATCH this table directly and never reach it.

  if (!env.PROBE_ADMIN_EMAIL || !env.PROBE_ADMIN_PASSWORD) {
    skip(
      "C1. an admin can update website_settings",
      "PROBE_ADMIN_EMAIL / PROBE_ADMIN_PASSWORD are not set in .env.local.",
    );
    skip(
      "C2. a javascript: URL is refused by the check constraint (23514)",
      "Needs an admin session: anon and non-admin writes are refused by RLS first, so the " +
        "constraint never gets a chance to answer and its absence would look identical.",
    );
    skip("C3. a valid https:// URL is accepted", "Same reason as C1.");
    skip("C4. the table cannot be made to hold a second row", "Same reason as C1.");
    skip(
      "C5. an admin can schedule a session, and a countdown with nothing to count to is refused (23514)",
      "Same reason as C2 — RLS answers before 012's check constraint for every other identity.",
    );
  } else {
    const session = await signIn(env.PROBE_ADMIN_EMAIL, env.PROBE_ADMIN_PASSWORD);
    let adminToken = session.token;

    // Is this account actually linked in public.admins? admin_settings is revoked from anon
    // and readable only by an admin, so a row back from it is the cheapest proof available.
    // Without this gate a non-admin password in PROBE_ADMIN_PASSWORD would report C1 as a
    // FAIL — a real-looking finding about a configuration mistake.
    if (adminToken) {
      const gate = await call("/rest/v1/admin_settings?select=id&limit=1", { token: adminToken });
      if (gate.status !== 200 || rowsOf(gate.body) !== 1) {
        console.log(
          `      PROBE_ADMIN account signed in but cannot read admin_settings ` +
            `(HTTP ${gate.status}, ${rowsOf(gate.body)} row(s)) — it is not linked in public.admins.\n`,
        );
        adminToken = null;
      }
    }

    if (!adminToken) {
      const reason =
        session.token === null
          ? `Sign-in failed with HTTP ${session.status}.`
          : "The account signed in but is not an admin; link it with " +
            "supabase/maintenance/grant_admin.sql.";
      skip("C1. an admin can update website_settings", reason);
      skip("C2. a javascript: URL is refused by the check constraint (23514)", reason);
      skip("C3. a valid https:// URL is accepted", reason);
      skip("C4. the table cannot be made to hold a second row", reason);
      skip(
        "C5. an admin can schedule a session, and a countdown with nothing to count to is refused (23514)",
        reason,
      );
    } else {
      // Everything below writes for real. The finally restores the five columns it touches to
      // whatever they were at pre-flight — which may be NULL, the normal state of this table.
      try {
        // C1. The positive control. A marker in footer_tagline, read back separately.
        {
          const marker = `[probe-6] admin write ${Date.now()}`;
          const attempt = await write(
            "/rest/v1/website_settings?id=eq.true",
            "PATCH",
            { footer_tagline: marker },
            adminToken,
          );
          const after = await readRow(adminToken, "footer_tagline,updated_at");
          const landed = after.row?.footer_tagline === marker;

          record(
            "C1. an admin can update website_settings",
            attempt.status < 400 && rowsOf(attempt.body) === 1 && landed,
            `PATCH HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
              `separate re-read: marker ${landed ? "present" : "ABSENT"} · updated_at ` +
              `${after.row?.updated_at === baseline.updated_at ? "did NOT move" : "moved as expected"}`,
          );
        }

        // C2. The probe this suite exists for. Five constrained columns × three hostile
        // values, each attempted individually so the failure detail names the column that
        // let one through rather than reporting "one of fifteen".
        {
          const accepted = [];
          const wrongCode = [];

          for (const column of URL_COLUMNS) {
            for (const value of HOSTILE_URLS) {
              const attempt = await write(
                "/rest/v1/website_settings?id=eq.true",
                "PATCH",
                { [column]: value },
                adminToken,
              );

              if (attempt.status < 400) {
                accepted.push(`${column} ← ${value}`);
                // Undo immediately rather than at the end: leaving a javascript: URL in a
                // column the public site reads, for the remainder of the run, would put a
                // live XSS vector on the site this probe is meant to protect.
                await write(
                  "/rest/v1/website_settings?id=eq.true",
                  "PATCH",
                  { [column]: baseline[column] },
                  adminToken,
                );
              } else if (codeOf(attempt.body) !== "23514") {
                wrongCode.push(`${column}: ${codeOf(attempt.body) ?? "no code"}`);
              }
            }
          }

          const after = await readRow(undefined, URL_COLUMNS.join(","));
          const hostileStored = URL_COLUMNS.filter((column) => {
            const value = after.row?.[column];
            return typeof value === "string" && !/^https?:\/\//i.test(value);
          });

          record(
            "C2. a javascript: URL is refused by the check constraint (23514)",
            accepted.length === 0 && wrongCode.length === 0 && hostileStored.length === 0,
            accepted.length > 0
              ? `STORED BY AN ADMIN SESSION: ${accepted.join("; ")} — 011's check constraint is ` +
                "missing or wrong on those columns, and the Zod schema is the only thing left"
              : wrongCode.length > 0
                ? `refused, but not by the check constraint: ${wrongCode.join("; ")}`
                : `all ${URL_COLUMNS.length * HOSTILE_URLS.length} attempts refused with 23514 ` +
                  `(${URL_COLUMNS.length} columns × ${HOSTILE_URLS.length} payloads) · ` +
                  "separate re-read: every stored URL still starts with http(s)://",
          );
        }

        // C3. The positive control for C2. A constraint that refuses everything would pass
        // C2 while making the field unusable, and that is not the same guarantee.
        {
          const valid = "https://t.me/probe6-valid-url";
          const attempt = await write(
            "/rest/v1/website_settings?id=eq.true",
            "PATCH",
            { telegram_url: valid },
            adminToken,
          );
          const after = await readRow(undefined, "telegram_url");
          const landed = after.row?.telegram_url === valid;

          record(
            "C3. a valid https:// URL is accepted",
            attempt.status < 400 && landed,
            `PATCH HTTP ${attempt.status} · code=${codeOf(attempt.body) ?? "—"} · ` +
              `separate re-read: ${landed ? "stored" : `NOT stored (${summarise(after.row?.telegram_url)})`}`,
          );
        }

        // C4. The singleton claim. `id boolean primary key default true check (id)` is what
        // makes "upsert the settings" a plain on-conflict, and both halves matter: the
        // default-true insert must collide (23505) and an explicit `false` must fail the
        // check (23514). Either one passing would mean a second row could exist and the
        // frontend's maybeSingle() would start throwing.
        {
          const duplicate = await write(
            "/rest/v1/website_settings",
            "POST",
            { id: true, hero_title: "[probe-6] second row must not exist" },
            adminToken,
          );
          const falseKey = await write(
            "/rest/v1/website_settings",
            "POST",
            { id: false, hero_title: "[probe-6] id=false must not exist" },
            adminToken,
          );
          const after = await readRow(undefined, "id");

          record(
            "C4. the table cannot be made to hold a second row",
            duplicate.status >= 400 &&
              codeOf(duplicate.body) === "23505" &&
              falseKey.status >= 400 &&
              codeOf(falseKey.body) === "23514" &&
              after.rows === 1,
            `id=true: HTTP ${duplicate.status} code=${codeOf(duplicate.body) ?? "—"} (want 23505) · ` +
              `id=false: HTTP ${falseKey.status} code=${codeOf(falseKey.body) ?? "—"} (want 23514) · ` +
              `separate re-read: ${after.rows} row(s)`,
          );
        }

        // C5. The countdown's own invariant — the one thing 012 adds that no typecheck can
        // reach. Two halves of a single claim, in one probe because neither is meaningful
        // without the other:
        //
        //   an admin can store a session moment WITHOUT publishing it, which is what lets a
        //   date be scheduled in advance and switched on later — the constraint has to permit
        //   a moment with the switch off, and a check written the other way round would not;
        //
        //   and the switch on with nothing to count to is refused by the database, not only by
        //   Zod. `check (not countdown_enabled or countdown_session_at is not null)` is the
        //   half that survives a direct PostgREST call from an admin session, which is exactly
        //   the caller the Zod schema cannot reach.
        {
          // A fixed instant far in the future rather than one derived from the clock: a
          // `now + n days` value would differ on every run for no benefit, and this one only
          // has to outlast any plausible run of this suite.
          const scheduled = "2099-12-31T20:00:00.000Z";
          const marker = "[probe-6] scheduled session";

          const stored = await write(
            "/rest/v1/website_settings?id=eq.true",
            "PATCH",
            {
              countdown_enabled: false,
              countdown_title: marker,
              countdown_session_at: scheduled,
            },
            adminToken,
          );
          const afterStore = await readRow(
            adminToken,
            "countdown_enabled,countdown_title,countdown_session_at",
          );

          // Compared as an instant, not as a string. The column is `timestamptz` and PostgREST
          // returns it in the connection's timezone, so `+00:00` and `Z` are the same moment
          // written two ways and a string comparison would report a spurious failure.
          const storedAt = afterStore.row?.countdown_session_at
            ? new Date(afterStore.row.countdown_session_at)
            : null;
          const landed =
            afterStore.row?.countdown_title === marker &&
            afterStore.row?.countdown_enabled === false &&
            storedAt !== null &&
            !Number.isNaN(storedAt.getTime()) &&
            storedAt.toISOString() === scheduled;

          // Both changes in ONE statement. Turning the switch on and clearing the moment are
          // each legal on their own — the constraint is about the row, not about either
          // column — so two PATCHes would prove nothing about it.
          const invalid = await write(
            "/rest/v1/website_settings?id=eq.true",
            "PATCH",
            { countdown_enabled: true, countdown_session_at: null },
            adminToken,
          );
          const afterInvalid = await readRow(
            adminToken,
            "countdown_enabled,countdown_session_at",
          );
          const stillOff = afterInvalid.row?.countdown_enabled === false;

          record(
            "C5. an admin can schedule a session, and a countdown with nothing to count to is refused (23514)",
            stored.status < 400 &&
              landed &&
              invalid.status >= 400 &&
              codeOf(invalid.body) === "23514" &&
              stillOff,
            `schedule HTTP ${stored.status} · separate re-read: ` +
              `${landed ? "moment stored with the switch still off" : "NOT stored as sent"} · ` +
              `switch-on-with-no-moment: HTTP ${invalid.status} code=${codeOf(invalid.body) ?? "—"} ` +
              `(want 23514) · separate re-read: countdown ${
                stillOff ? "still off" : "WENT LIVE WITH NO SESSION TO COUNT TO"
              }`,
          );
        }
      } finally {
        // Restore the five columns Section C wrote. Unconditional, and outside the assertions,
        // so a thrown error or a failed probe cannot leave probe text on the live site.
        //
        // The three countdown columns go back in ONE statement with each other, because 012's
        // constraint is about the row: restoring a live countdown's switch before its moment
        // would be refused, and the restore would fail while trying to undo a change.
        const restoreColumns = {
          footer_tagline: baseline.footer_tagline,
          telegram_url: baseline.telegram_url,
          countdown_enabled: baseline.countdown_enabled,
          countdown_title: baseline.countdown_title,
          countdown_session_at: baseline.countdown_session_at,
        };
        const restore = await write(
          "/rest/v1/website_settings?id=eq.true",
          "PATCH",
          restoreColumns,
          adminToken ?? undefined,
        );
        const after = await readRow(undefined, Object.keys(restoreColumns).join(","));
        const notRestored = Object.keys(restoreColumns).filter(
          (column) => after.row?.[column] !== baseline[column],
        );
        const restored = notRestored.length === 0;

        record(
          "C6. Section C's writes were rolled back to the pre-flight values",
          restored,
          restored
            ? `footer_tagline, telegram_url and the three countdown columns are back to their ` +
              `pre-flight values (${
                Object.keys(restoreColumns).filter((c) => isConfigured(baseline, c)).length
              }/5 were configured before the run) · updated_at has moved, which is harmless`
            : `RESTORE FAILED (HTTP ${restore.status}) for [${notRestored.join(", ")}] — set these by hand:\n` +
              notRestored
                .map((column) => `      ${column} = ${JSON.stringify(baseline[column])}`)
                .join("\n"),
        );
      }
    }
  }

  // -------------------------------------------------------------------------------
  console.log("\n--- Section D: static claims, no database ---\n");
  // -------------------------------------------------------------------------------
  //
  // Five things asserted in prose that would break quietly. None of them needs a network
  // call, and none of them is covered by the typecheck.

  const migration011 = fs.readFileSync(MIGRATION_011, "utf8");
  const migration012 = fs.readFileSync(MIGRATION_012, "utf8");
  const websiteService = fs.readFileSync(WEBSITE_SERVICE_TS, "utf8");
  const adminService = fs.readFileSync(ADMIN_SERVICE_TS, "utf8");
  const settingsSchema = fs.readFileSync(SETTINGS_SCHEMA_TS, "utf8");

  // D1. The read layer names every column in one string literal. A column added to a migration
  // and not added there is a field the admin form can never load, and TypeScript cannot see the
  // difference because the string is opaque to it.
  {
    const match = websiteService.match(/WEBSITE_SETTINGS_COLUMNS\s*=\s*\n?\s*"([^"]+)"/);
    const listed = match
      ? match[1]
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean)
      : [];
    const missing = READ_COLUMNS.filter((column) => !listed.includes(column));
    const extra = listed.filter((column) => !READ_COLUMNS.includes(column));

    record(
      "D1. WEBSITE_SETTINGS_COLUMNS names exactly the columns 011 and 012 declare, less id and created_at",
      listed.length === READ_COLUMNS.length && missing.length === 0 && extra.length === 0,
      `${listed.length} names` +
        (missing.length === 0 && extra.length === 0
          ? " · matches"
          : ` · missing: [${missing.join(", ")}] · extra: [${extra.join(", ")}]`),
    );
  }

  // D2. "The constraint is the server-side half; the Zod schema is the courtesy half." Both
  // halves have to exist for that sentence to be true, and a sixth URL column added to the
  // table with a check but no Zod rule would give the admin a server error instead of a
  // field message.
  {
    const constrained = URL_COLUMNS.filter((column) =>
      new RegExp(`check \\(${column} is null or ${column} ~\\* '\\^https\\?://'\\)`).test(
        migration011,
      ),
    );
    const validated = URL_COLUMNS.filter((column) =>
      new RegExp(`${column}:\\s*optionalUrl\\(`).test(settingsSchema),
    );

    record(
      "D2. all five URL columns are constrained in SQL and validated in Zod",
      constrained.length === URL_COLUMNS.length && validated.length === URL_COLUMNS.length,
      `011 check constraints: ${constrained.length}/${URL_COLUMNS.length}` +
        (constrained.length === URL_COLUMNS.length
          ? ""
          : ` · missing: [${URL_COLUMNS.filter((c) => !constrained.includes(c)).join(", ")}]`) +
        ` · Zod optionalUrl: ${validated.length}/${URL_COLUMNS.length}` +
        (validated.length === URL_COLUMNS.length
          ? ""
          : ` · missing: [${URL_COLUMNS.filter((c) => !validated.includes(c)).join(", ")}]`),
    );
  }

  // D3. "NO PAYLOAD EVER CARRIES updated_at." Sending it would overwrite the trigger's value
  // with a client clock, and the admin form's remount key is derived from that column — so a
  // skewed clock would break the form in a way that looks like a caching bug.
  {
    const body = adminService.slice(adminService.indexOf("saveWebsiteSettings"));
    const upsertEnd = body.indexOf("onConflict");
    const payload = upsertEnd > 0 ? body.slice(0, upsertEnd) : body;

    record(
      "D3. saveWebsiteSettings never sends updated_at",
      !/updated_at/.test(payload),
      /updated_at/.test(payload)
        ? "the upsert payload mentions updated_at — the trigger owns that column"
        : `the upsert payload names only id and the ${CONTENT_COLUMNS.length} content columns`,
    );
  }

  // D4. websiteSettings.service.ts exists so that importing site copy from a public page
  // cannot drag admin reads and writes into the same bundle. The import that would undo that
  // is public → adminSettings.service, and it would typecheck perfectly.
  {
    const publicRoots = [
      path.join(projectRoot, "src", "components", "public"),
      path.join(projectRoot, "src", "components", "Layout"),
    ];
    const publicPages = [
      "Index.tsx",
      "Signals.tsx",
      "Telegram.tsx",
      "Broker.tsx",
      "Mentorship.tsx",
      "CourseDetail.tsx",
      "CourseEnrollment.tsx",
      "EnrollmentConfirmation.tsx",
    ].map((file) => path.join(projectRoot, "src", "pages", file));

    const walk = (dir) => {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return walk(full);
        return /\.tsx?$/.test(entry.name) ? [full] : [];
      });
    };

    const files = [...publicRoots.flatMap(walk), ...publicPages.filter((f) => fs.existsSync(f))];
    const offenders = files.filter((file) =>
      /from "@\/services\/adminSettings\.service"/.test(fs.readFileSync(file, "utf8")),
    );

    record(
      "D4. no public page or public component imports adminSettings.service",
      offenders.length === 0,
      offenders.length === 0
        ? `${files.length} public file(s) checked · none reaches into the admin service`
        : `IMPORTS THE ADMIN SERVICE: ${offenders.map((f) => path.relative(projectRoot, f)).join(", ")}`,
    );
  }

  // D5. The countdown's schema, on both sides of the wire. 012 is the only migration that adds
  // a cross-column invariant to this table, and the Zod schema is the only thing that turns it
  // into a sentence an administrator can act on — so each half is worth asserting exists. C5
  // proves the constraint bites; this proves it is declared where the prose says it is, and
  // runs without a database or an admin password, which is when most people will see it.
  {
    const declared = COUNTDOWN_COLUMNS.filter((column) =>
      new RegExp(`add column if not exists ${column}\\b`, "i").test(migration012),
    );
    const invariant =
      /check\s*\(\s*not countdown_enabled or countdown_session_at is not null\s*\)/i.test(
        migration012,
      );
    const validated = COUNTDOWN_FORM_FIELDS.filter((field) =>
      new RegExp(`${field}:\\s*sessionPart\\(`).test(settingsSchema),
    );
    // The observable trace of the second superRefine. A regex cannot run the schema, but this
    // message only exists because something refuses a switched-on countdown with no moment.
    const refusesSwitchWithNoMoment =
      /Set the session date and time, or switch the countdown off\./.test(settingsSchema);

    record(
      "D5. 012 declares the three countdown columns and their invariant, and Zod validates both halves of the moment",
      declared.length === COUNTDOWN_COLUMNS.length &&
        invariant &&
        validated.length === COUNTDOWN_FORM_FIELDS.length &&
        refusesSwitchWithNoMoment,
      `012 columns: ${declared.length}/${COUNTDOWN_COLUMNS.length}` +
        (declared.length === COUNTDOWN_COLUMNS.length
          ? ""
          : ` · missing: [${COUNTDOWN_COLUMNS.filter((c) => !declared.includes(c)).join(", ")}]`) +
        ` · invariant check: ${invariant ? "present" : "MISSING — an enabled countdown could store no moment"}` +
        ` · Zod sessionPart: ${validated.length}/${COUNTDOWN_FORM_FIELDS.length}` +
        (validated.length === COUNTDOWN_FORM_FIELDS.length
          ? ""
          : ` · missing: [${COUNTDOWN_FORM_FIELDS.filter((f) => !validated.includes(f)).join(", ")}]`) +
        ` · form-level refusal: ${refusesSwitchWithNoMoment ? "present" : "MISSING"}`,
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
      "\nTo run the skipped sections, add the same probe accounts the Phase 4, 5a and 5b\n" +
        "suites use to .env.local (create them in the Supabase Dashboard with 'Auto Confirm\n" +
        "User' ticked):\n" +
        "\n" +
        "  PROBE_ADMIN_EMAIL=      PROBE_ADMIN_PASSWORD=\n" +
        "  PROBE_NONADMIN_EMAIL=   PROBE_NONADMIN_PASSWORD=\n" +
        "\n" +
        "Link only the first into public.admins with supabase/maintenance/grant_admin.sql.\n" +
        "Without PROBE_ADMIN_PASSWORD the javascript:-URL constraint stays unproven, which is\n" +
        "the one gap in this suite that matters.",
    );
  }

  console.log(
    "\nNothing was left behind: Section A wrote the row's own values back, Section C restored\n" +
      "footer_tagline, telegram_url and the three countdown columns in a finally, and no probe\n" +
      "row can exist in a table whose primary key is a constant. `updated_at` has moved if\n" +
      "Section C ran.",
  );

  process.exitCode = failed.length > 0 ? 1 : 0;
};

main().catch((error) => {
  console.error("Probe run failed:", error);
  process.exitCode = 2;
});
