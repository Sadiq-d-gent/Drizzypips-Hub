/**
 * Phase 5b settings, pause and account security probes.
 *
 * Phase 5b added the first *writes* to the two settings tables, and one new anon-callable
 * function. This suite asks the same three questions the Phase 4 and 5a suites ask, about
 * that surface:
 *
 *   A. Can `anon` reach it?                 (must be: the two pause fields and nothing else)
 *   B. Can a signed-in NON-admin reach it?  (must be: no)
 *   C. Can a signed-in admin reach it?      (must be: yes, and the pause must actually bite)
 *
 * WHAT IS ACTUALLY NEW HERE
 * Anon SELECT on both settings tables was already probed in Phase 3 (1c, 1d) and Phase 4
 * (A6). What has never been probed is everything Phase 5b introduced:
 *
 *   * public.get_enrollment_availability() — a new anon EXECUTE grant. It must return the
 *     two pause fields and nothing else, because admin_settings also holds
 *     notification_email and 003 revokes that whole table from anon on purpose.
 *   * anon and non-admin WRITES to payment_settings and admin_settings. Before 5b nothing
 *     in the app wrote to either table, so nothing ever checked that only an admin can.
 *   * the PA001 guard inside create_enrollment, which 010 added.
 *   * create_enrollment itself, which 010 re-declared in full — 5.6 KB of body copied from
 *     002 so a guard could be inserted at the top. A13 exists because a silent typo in that
 *     copy would break every enrollment on the site, and no other probe would notice.
 *
 * WHY THE ASSERTIONS ARE NOT UNIFORM — the same trap Phase 5a documents
 * The two tables are refused in different ways, and asserting the wrong one produces a
 * false pass:
 *
 *   admin_settings    — 003 runs `revoke all on public.admin_settings from anon`, so an
 *                       anonymous statement of ANY kind is refused at the grant, before RLS
 *                       is consulted and before any constraint. Expect HTTP 4xx / 42501.
 *   payment_settings  — `authenticated` and `anon` hold ordinary table grants, so RLS is
 *                       the only barrier. An INSERT hits a WITH CHECK violation and raises
 *                       (4xx); an UPDATE or DELETE with no applicable USING policy simply
 *                       filters every row away and returns HTTP 2xx with ZERO ROWS.
 *                       Asserting `status >= 400` there would fail against a correctly
 *                       configured database.
 *
 * HOW A REFUSED WRITE IS PROVEN, GIVEN "ZERO ROWS" IS ALSO WHAT A NON-MATCHING FILTER SAYS
 * Every write probe below sends `Prefer: return=representation` and then re-reads the value
 * in a SEPARATE request. Checking a write in the same statement that attempted it reads the
 * pre-statement snapshot and has produced a false pass twice in this project.
 *
 * For admin_settings the re-read is the interesting part: no unprivileged identity can
 * SELECT that table, so the confirmation goes through public.get_enrollment_availability()
 * instead. A write that had gone through would show up there as a changed pause state. That
 * makes A6 and B4 real evidence rather than an assertion about an empty result set.
 *
 * The comparison is against the state recorded at pre-flight, NOT against `true`. If the
 * operator has enrollments paused when this runs, "unchanged" is the invariant; "enabled"
 * is not.
 *
 * NOTHING HERE CORRUPTS LIVE DATA ON PURPOSE
 * The anon UPDATE probe writes payment_settings' existing value back to itself, so even a
 * hypothetical success changes no meaning — the empty representation and the untouched
 * `updated_at` are the evidence. The anon INSERT probe inserts with `is_active = false`, so
 * RLS is the only thing that can refuse it (an active row would collide with
 * payment_settings_single_active_idx and a 23505 would mask the answer), and a row that
 * somehow lands is harmless and is reported for removal. The DELETE probe cannot be made
 * harmless, so the full active row is captured first and printed as recovery data if the
 * delete ever succeeds.
 *
 * SECTION C BRIEFLY PAUSES ENROLLMENTS ON THE TARGET DATABASE.
 * That is the only way to prove PA001 fires from a session. It restores `enrollment_enabled`
 * in a `finally` so a crash mid-probe cannot leave the site closed, and re-reads it afterwards
 * in a separate request. It never touches `enrollment_paused_message` — the administrator's
 * wording is read, asserted against what the RPC hands the public, and left alone.
 *
 * A15 and A16 prove the same guard WITHOUT a session, against a site that is already paused —
 * the "out of band" case. They are what can be reached when no admin password is available;
 * they skip when the site is open, and the skip detail says how to pause it.
 *
 * Credentials are read from `.env.local`, never from the command line and never printed.
 * The anon key is required. Sections needing a session use the same OPTIONAL keys as the
 * Phase 4 and 5a suites:
 *
 *   PROBE_ADMIN_EMAIL / PROBE_ADMIN_PASSWORD        — an account linked in public.admins
 *   PROBE_NONADMIN_EMAIL / PROBE_NONADMIN_PASSWORD  — an account NOT in public.admins
 *
 * Absent credentials produce SKIP, never PASS — and never FAIL either. A probe that reports
 * a verdict on evidence it does not have is worse than one that admits it did not run.
 *
 * Section D needs no database: it checks that the values Phase 5b duplicated into
 * src/lib/constants/ still match the migrations those constants claim to mirror, and that
 * 010's copy of create_enrollment did not lose anything on the way across.
 *
 * Probe enrollments use `probe-5b+<timestamp>@example.com`, which the existing
 * `probe%@example.com` pattern in scripts/probes/phase3-teardown.sql already catches.
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

const MIGRATION_003 = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "003_create_payment_settings.sql",
);
const MIGRATION_010 = path.join(
  projectRoot,
  "supabase",
  "migrations",
  "010_enrollment_availability.sql",
);
const ENROLLMENT_CONSTANTS_TS = path.join(projectRoot, "src", "lib", "constants", "enrollment.ts");
const ADMIN_CONSTANTS_TS = path.join(projectRoot, "src", "lib", "constants", "admin.ts");
const ADMIN_SETTINGS_SERVICE_TS = path.join(projectRoot, "src", "services", "adminSettings.service.ts");
const AVAILABILITY_SERVICE_TS = path.join(
  projectRoot,
  "src",
  "services",
  "enrollmentAvailability.service.ts",
);

/** The two columns get_enrollment_availability() is allowed to return, and no others. */
const AVAILABILITY_KEYS = ["enrollment_enabled", "paused_message"];

/** Columns create_enrollment() returns. access_token_hash is deliberately not among them. */
const ENROLLMENT_RESULT_KEYS = ["access_token", "created_at", "order_id", "status"];

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
const codeOf = (body) => (body && typeof body === "object" && !Array.isArray(body) ? body.code : null);

const signIn = async (email, password) => {
  const response = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, token: body?.access_token ?? null, body };
};

/** The public pause state, read the way the enrollment page reads it. */
const readAvailability = async (token) => {
  const r = await rpc("get_enrollment_availability", {}, token);
  const row = Array.isArray(r.body) ? r.body[0] : r.body;
  return { status: r.status, body: r.body, row: row ?? null };
};

/** One enrollment attempt as anon, with a fresh address so the RL001 limiter is never the answer. */
const attemptEnrollment = async (slug, label) => {
  const r = await rpc("create_enrollment", {
    p_course_slug: slug,
    p_student_name: "Probe 5b Student",
    p_student_email: `probe-5b+${label}-${Date.now()}@example.com`,
    p_student_phone: "+2348000000000",
    p_student_note: null,
    p_receipt_path: null,
    p_receipt_filename: null,
    p_receipt_size_bytes: null,
    p_receipt_mime_type: null,
  });
  const row = Array.isArray(r.body) ? r.body[0] : null;
  return { status: r.status, body: r.body, row };
};

const main = async () => {
  console.log("=== Phase 5b settings / pause / account probes ===\n");

  /** Enrollments this run created, reported at the end for teardown. */
  const createdOrderIds = [];
  /** payment_settings rows a probe managed to insert. Empty is the expected state. */
  const strandedRows = [];

  // -------------------------------------------------------------------------------
  console.log("--- Pre-flight: what state is the target database in? ---\n");
  // -------------------------------------------------------------------------------
  //
  // Two facts are needed before anything can be asserted, and both are read as anon:
  //
  //   1. the current pause state, because every "the write changed nothing" probe compares
  //      against THIS rather than against `true`;
  //   2. the active payment_settings row in full, because the anon DELETE probe is the one
  //      probe here that cannot be made harmless, and a captured row is the difference
  //      between a bad surprise and a paste.

  let baselineEnabled = null;
  {
    const availability = await readAvailability();
    baselineEnabled = availability.row?.enrollment_enabled ?? null;
    record(
      "P1. get_enrollment_availability() answers an anonymous caller",
      availability.status === 200 && typeof baselineEnabled === "boolean",
      `HTTP ${availability.status} · ${summarise(availability.body)}`,
    );

    if (typeof baselineEnabled !== "boolean") {
      console.log(
        "\nThe availability RPC did not answer, so the pause baseline is unknown and every\n" +
          "probe that depends on it would be guessing. Stopping here.\n",
      );
      process.exitCode = 2;
      return;
    }

    console.log(
      `      baseline: enrollment_enabled=${baselineEnabled}` +
        (baselineEnabled
          ? " ← the site is open; A15/A16 need it paused and will skip"
          : " ← the site is PAUSED; A13/A14 skip and A15/A16 run"),
    );
  }

  let activePaymentRow = null;
  {
    const r = await call("/rest/v1/payment_settings?select=*&is_active=eq.true");
    activePaymentRow = Array.isArray(r.body) ? (r.body[0] ?? null) : null;
    // Not a probe of its own: 003's public read policy is already covered by Phase 3's 1d,
    // and phase3-readiness-check.cjs fails outright when there is no active row.
    console.log(
      `      active payment_settings row: ${activePaymentRow ? `id ${activePaymentRow.id}` : "NONE — A9/A10/A12 will skip"}`,
    );
  }

  let publishedSlug = null;
  {
    const r = await call("/rest/v1/courses?select=slug&limit=1");
    publishedSlug = Array.isArray(r.body) ? (r.body[0]?.slug ?? null) : null;
    console.log(
      `      published course for the enrollment probes: ${publishedSlug ?? "NONE — A13 and C4c/C4f will skip"}\n`,
    );
  }

  // -------------------------------------------------------------------------------
  console.log("--- Section A: as anon ---\n");
  // -------------------------------------------------------------------------------

  // A1/A2/A3 are the whole reason 010 uses a function instead of an anon SELECT policy.
  // The claim being tested is narrow and absolute: this is a two-field window onto a table
  // that is otherwise entirely closed, and a `select=*` cannot widen a function's result.
  {
    const availability = await readAvailability();
    const keys = availability.row ? Object.keys(availability.row).sort() : [];

    record(
      "A1. anon holds EXECUTE on get_enrollment_availability() and gets exactly one row",
      availability.status === 200 && rowsOf(availability.body) === 1,
      `HTTP ${availability.status} · ${rowsOf(availability.body)} row(s) · ${summarise(availability.body)}`,
    );

    record(
      "A2. the result has exactly the two documented columns",
      JSON.stringify(keys) === JSON.stringify(AVAILABILITY_KEYS.slice().sort()),
      `keys: [${keys.join(", ")}] · expected: [${AVAILABILITY_KEYS.join(", ")}]`,
    );

    // Substring search over the raw body, not a key check: a column added to admin_settings
    // and accidentally selected would show up here whatever it was called, and the two names
    // this function does return share no substring with the one it must never return.
    const raw = JSON.stringify(availability.body);
    const forbidden = ["notification_email", "enrollment_paused_message", "created_at", "updated_at"];
    const leaked = forbidden.filter((field) => raw.includes(field));

    record(
      "A3. the response carries no other admin_settings field, notification_email least of all",
      leaked.length === 0,
      leaked.length === 0
        ? `none of [${forbidden.join(", ")}] appears in the response`
        : `LEAKED: ${leaked.join(", ")}`,
    );
  }

  // A4/A5 re-establish, after 010, what Phase 3's 1c established before it. 010 added a
  // SECURITY DEFINER reader over this table; a function is not a grant, but the invariant is
  // worth re-measuring in the phase that changed the code around it.
  {
    const all = await call("/rest/v1/admin_settings?select=*&limit=5");
    record(
      "A4. anon SELECT on admin_settings is still refused or empty",
      all.status >= 400 || rowsOf(all.body) === 0,
      `HTTP ${all.status} · ${rowsOf(all.body)} row(s) · code=${codeOf(all.body) ?? "—"} · ${summarise(all.body)}`,
    );

    // Asked for by name, because "select=*" being empty and "the one sensitive column"
    // being empty are not quite the same claim.
    const targeted = await call("/rest/v1/admin_settings?select=notification_email");
    const leaked =
      Array.isArray(targeted.body) &&
      targeted.body.some((row) => row && row.notification_email != null);
    record(
      "A5. anon cannot read admin_settings.notification_email by asking for it directly",
      targeted.status >= 400 || !leaked,
      `HTTP ${targeted.status} · ${rowsOf(targeted.body)} row(s) · code=${codeOf(targeted.body) ?? "—"} · value present=${leaked}`,
    );
  }

  // A6 is the strongest probe in this section. The attempted write is the one that matters
  // most — flipping the kill switch — and the confirmation is a SEPARATE request through the
  // availability RPC, which is the only window an unprivileged identity has onto this table.
  {
    const attempt = await write(
      "/rest/v1/admin_settings?id=eq.true",
      "PATCH",
      { enrollment_enabled: false },
    );
    const after = await readAvailability();
    const unchanged = after.row?.enrollment_enabled === baselineEnabled;

    record(
      "A6. anon UPDATE on admin_settings changes nothing (kill switch untouched)",
      (attempt.status >= 400 || rowsOf(attempt.body) === 0) && unchanged,
      `PATCH HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
        `separate re-read: enrollment_enabled=${after.row?.enrollment_enabled} (baseline ${baselineEnabled})` +
        (unchanged ? "" : " ← CHANGED. Restore it: update public.admin_settings set enrollment_enabled = true where id;"),
    );
  }

  {
    // `id: true` is the only value the `check (id)` constraint permits, so this collides with
    // the existing row — but `revoke all … from anon` refuses at the grant, before any
    // constraint is reached, which is why the code is expected to be 42501 and not 23505.
    const attempt = await write("/rest/v1/admin_settings", "POST", {
      id: true,
      notification_email: "probe-5b@example.com",
      enrollment_enabled: false,
    });
    record(
      "A7. anon INSERT on admin_settings is refused",
      attempt.status >= 400,
      `HTTP ${attempt.status} · code=${codeOf(attempt.body) ?? "—"} · ${summarise(attempt.body)}`,
    );
  }

  {
    const attempt = await write("/rest/v1/admin_settings?id=eq.true", "DELETE", undefined);
    // The settings row surviving is checked through the RPC rather than by SELECT, again
    // because anon has no read on this table. Deletion would make the RPC fail open, so
    // "still reports the baseline" is only meaningful together with A6 above; both must hold.
    const after = await readAvailability();
    record(
      "A8. anon DELETE on admin_settings removes nothing",
      (attempt.status >= 400 || rowsOf(attempt.body) === 0) &&
        after.row?.enrollment_enabled === baselineEnabled,
      `DELETE HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
        `separate re-read: enrollment_enabled=${after.row?.enrollment_enabled} (baseline ${baselineEnabled})`,
    );
  }

  // A9. The 003 policy is `using (is_active = true)`. Phase 3's 1d proved the row is
  // readable; this proves the filter is still doing its job, which is what keeps a
  // superseded account number from being handed to a student.
  {
    const r = await call("/rest/v1/payment_settings?select=id,is_active,account_number");
    const rows = Array.isArray(r.body) ? r.body : [];
    const allActive = rows.length > 0 && rows.every((row) => row.is_active === true);
    record(
      "A9. anon sees only the active payment_settings row",
      r.status === 200 && rows.length === 1 && allActive,
      `HTTP ${r.status} · ${rows.length} row(s) · every row is_active=${allActive}`,
    );
  }

  if (!activePaymentRow) {
    skip(
      "A10. anon UPDATE on payment_settings changes nothing",
      "No active payment_settings row to attempt against, so a zero-row result would be a " +
        "statement about an empty table rather than about RLS.",
    );
    skip("A11. anon DELETE on payment_settings removes nothing", "Same reason as A10.");
  } else {
    // The value written is the row's OWN current value, so a hypothetical success would
    // change no meaning. The evidence is the empty representation plus `updated_at`, which
    // the 003 BEFORE UPDATE trigger would have moved if the statement had touched the row.
    {
      const attempt = await write("/rest/v1/payment_settings?is_active=eq.true", "PATCH", {
        additional_details: activePaymentRow.additional_details,
      });
      const after = await call("/rest/v1/payment_settings?select=updated_at&is_active=eq.true");
      const afterUpdatedAt = Array.isArray(after.body) ? (after.body[0]?.updated_at ?? null) : null;
      const untouched = afterUpdatedAt === activePaymentRow.updated_at;

      record(
        "A10. anon UPDATE on payment_settings changes nothing",
        (attempt.status >= 400 || rowsOf(attempt.body) === 0) && untouched,
        `PATCH HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
          `separate re-read: updated_at ${untouched ? "unchanged" : `MOVED to ${afterUpdatedAt}`}`,
      );
    }

    {
      const attempt = await write("/rest/v1/payment_settings?is_active=eq.true", "DELETE", undefined);
      const after = await call(
        `/rest/v1/payment_settings?select=id&id=eq.${encodeURIComponent(activePaymentRow.id)}`,
      );
      const survived = rowsOf(after.body) === 1;

      record(
        "A11. anon DELETE on payment_settings removes nothing",
        (attempt.status >= 400 || rowsOf(attempt.body) === 0) && survived,
        `DELETE HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
          `separate re-read: row ${survived ? "still present" : "GONE"}`,
      );

      if (!survived) {
        console.log(
          "\n!! The active payment_settings row was deleted by an anonymous caller. Students\n" +
            "!! cannot see where to pay until it is restored. Recovery data, captured before\n" +
            "!! the attempt:\n" +
            `!! ${JSON.stringify(activePaymentRow)}\n`,
        );
      }
    }

    {
      // is_active: false on purpose — an active row would collide with
      // payment_settings_single_active_idx and a 23505 would mask whether RLS refused it.
      const attempt = await write("/rest/v1/payment_settings", "POST", {
        bank_name: "[probe-5b] anon insert must be refused",
        account_name: "[probe-5b]",
        account_number: "0000000000",
        currency: "NGN",
        payment_instructions: "[probe-5b] inactive row, safe to delete",
        is_active: false,
      });
      record(
        "A12. anon INSERT on payment_settings is refused",
        attempt.status >= 400 && rowsOf(attempt.body) === 0,
        `HTTP ${attempt.status} · code=${codeOf(attempt.body) ?? "—"} · ${summarise(attempt.body)}`,
      );

      const inserted = Array.isArray(attempt.body) ? attempt.body[0] : null;
      if (inserted?.id) {
        strandedRows.push(`payment_settings id ${inserted.id} (inserted by A12, is_active=false)`);
      }
    }
  }

  // A13/A14. 010 re-declared create_enrollment in full so a guard could go at the top. If
  // anything in that 5.6 KB copy was mistyped, enrollment is broken site-wide — and it would
  // be broken quietly, because the wizard's generic failure copy looks identical to a network
  // problem. This is the probe that would catch it.
  if (!publishedSlug) {
    skip(
      "A13. create_enrollment still works after 010 re-declared it",
      "No published course to enrol in, so a failure here would say nothing about the function.",
    );
    skip("A14. the returned row is exactly the four documented columns", "Depends on A13.");
  } else if (baselineEnabled === false) {
    skip(
      "A13. create_enrollment still works after 010 re-declared it",
      "Enrollments are currently paused on this database, so a refusal is the correct answer " +
        "and cannot double as a positive control. Section C proves both directions.",
    );
    skip("A14. the returned row is exactly the four documented columns", "Depends on A13.");
  } else {
    const attempt = await attemptEnrollment(publishedSlug, "open");
    const created = Boolean(attempt.row?.order_id && attempt.row?.access_token);
    if (attempt.row?.order_id) createdOrderIds.push(attempt.row.order_id);

    record(
      "A13. create_enrollment still works after 010 re-declared it",
      attempt.status < 400 && created,
      `HTTP ${attempt.status} · order_id=${attempt.row?.order_id ?? "—"} · status=${attempt.row?.status ?? "—"} · ` +
        (created ? "token issued" : summarise(attempt.body)),
    );

    // The token is issued once and never stored in plaintext; access_token_hash must not be
    // in the result. 002 designed the RETURNS TABLE that way and 010 had to copy it exactly.
    const keys = attempt.row ? Object.keys(attempt.row).sort() : [];
    record(
      "A14. the returned row is exactly the four documented columns",
      JSON.stringify(keys) === JSON.stringify(ENROLLMENT_RESULT_KEYS),
      `keys: [${keys.join(", ")}] · expected: [${ENROLLMENT_RESULT_KEYS.join(", ")}]`,
    );
  }

  // A15/A16. The guard itself — the whole point of migration 010 — proven without holding an
  // admin password.
  //
  // Anon cannot flip the switch, so these only run against a site that is ALREADY paused.
  // That is the "with the pause switched on out of band" case, and pausing it out of band is
  // a single statement through the linked Supabase CLI or the SQL editor; the skip detail
  // below carries it. Section C drives the same assertions in both directions when an admin
  // session is available, but these two are the ones that can be reached without one.
  if (!publishedSlug) {
    skip(
      "A15. create_enrollment is refused with PA001 while the site is paused",
      "No published course to attempt an enrollment against.",
    );
    skip(
      "A16. a paused site hands the administrator's message to an anonymous caller",
      "No published course.",
    );
  } else if (baselineEnabled !== false) {
    skip(
      "A15. create_enrollment is refused with PA001 while the site is paused",
      "Enrollments are open on this database, so a successful enrollment is the correct answer " +
        "and proves nothing about the guard. To prove it, pause out of band, re-run this " +
        "suite, then restore and re-read in a separate statement:\n" +
        "        update public.admin_settings set enrollment_enabled = false where id;  -- then re-run\n" +
        "        update public.admin_settings set enrollment_enabled = true  where id;  -- then re-read",
    );
    skip(
      "A16. a paused site hands the administrator's message to an anonymous caller",
      "Enrollments are open, so paused_message is correctly null — P1 and A1 cover that branch.",
    );
  } else {
    const attempt = await attemptEnrollment(publishedSlug, "paused");
    const code = codeOf(attempt.body);
    if (attempt.row?.order_id) createdOrderIds.push(attempt.row.order_id);

    record(
      "A15. create_enrollment is refused with PA001 while the site is paused",
      attempt.status >= 400 && code === "PA001",
      `HTTP ${attempt.status} · code=${code ?? "—"} · ${summarise(attempt.body)}` +
        (attempt.row?.order_id
          ? ` ← AN ENROLLMENT WAS CREATED WHILE PAUSED (order ${attempt.row.order_id})`
          : ""),
    );

    // 010 returns the message only from the paused branch of a CASE expression. P1 and A1
    // cover the open branch returning null; this covers the other one, and that branch is
    // the only wording a blocked student ever reads — the PA001 error text is deliberately
    // operator-facing and never rendered.
    const availability = await readAvailability();
    const message = availability.row?.paused_message ?? null;
    const present = typeof message === "string" && message.trim().length > 0;

    record(
      "A16. a paused site hands the administrator's message to an anonymous caller",
      availability.row?.enrollment_enabled === false && present,
      `enrollment_enabled=${availability.row?.enrollment_enabled} · paused_message ` +
        (present
          ? `present (${message.length} chars): ${summarise(message)}`
          : `${JSON.stringify(message)} — the panel would fall back to DEFAULT_ENROLLMENT_PAUSED_MESSAGE`),
    );
  }

  // -------------------------------------------------------------------------------
  console.log("\n--- Section B: as a signed-in NON-admin ---\n");
  // -------------------------------------------------------------------------------
  //
  // A different question from section A, and the one an attacker with a free account asks.
  // `authenticated` holds ordinary table grants on payment_settings and admin_settings, so
  // here RLS really is the only barrier and a missing policy shows up as zero rows rather
  // than as a permission error.

  let userToken = null;

  if (!env.PROBE_NONADMIN_EMAIL || !env.PROBE_NONADMIN_PASSWORD) {
    skip(
      "B1. non-admin can sign in",
      "PROBE_NONADMIN_EMAIL / PROBE_NONADMIN_PASSWORD not set in .env.local — the whole of " +
        "section B is unproven.",
    );
  } else {
    const session = await signIn(env.PROBE_NONADMIN_EMAIL, env.PROBE_NONADMIN_PASSWORD);
    userToken = session.token;
    record(
      "B1. non-admin can sign in",
      Boolean(userToken),
      `HTTP ${session.status} · ${userToken ? "session obtained" : summarise(session.body)}`,
    );
  }

  if (!userToken) {
    for (const name of [
      "B2. is_admin() is false for this account (precondition)",
      "B3. non-admin SELECT on admin_settings returns nothing",
      "B4. non-admin UPDATE on admin_settings changes nothing",
      "B5. non-admin INSERT on admin_settings is refused",
      "B6. non-admin UPDATE on payment_settings changes nothing",
      "B7. non-admin INSERT on payment_settings is refused",
      "B8. non-admin DELETE on payment_settings removes nothing",
      "B9. non-admin can still read the active payment row (positive control)",
    ]) {
      skip(name, "No non-admin session.");
    }
  } else {
    const isAdmin = await rpc("is_admin", {}, userToken);
    const confirmedNotAdmin = isAdmin.status === 200 && isAdmin.body === false;
    record(
      "B2. is_admin() is false for this account (precondition)",
      confirmedNotAdmin,
      `HTTP ${isAdmin.status} · is_admin=${JSON.stringify(isAdmin.body)}`,
    );

    if (!confirmedNotAdmin) {
      console.log(
        "\n      PROBE_NONADMIN_* is linked in public.admins, so it cannot answer the " +
          "non-admin question.\n      Remaining section B probes would measure an " +
          "administrator and are skipped.\n",
      );
      for (const name of [
        "B3. non-admin SELECT on admin_settings returns nothing",
        "B4. non-admin UPDATE on admin_settings changes nothing",
        "B5. non-admin INSERT on admin_settings is refused",
        "B6. non-admin UPDATE on payment_settings changes nothing",
        "B7. non-admin INSERT on payment_settings is refused",
        "B8. non-admin DELETE on payment_settings removes nothing",
        "B9. non-admin can still read the active payment row (positive control)",
      ]) {
        skip(name, "PROBE_NONADMIN_* is an administrator.");
      }
    } else {
      {
        const r = await call("/rest/v1/admin_settings?select=*", { token: userToken });
        record(
          "B3. non-admin SELECT on admin_settings returns nothing",
          r.status >= 400 || rowsOf(r.body) === 0,
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s) · code=${codeOf(r.body) ?? "—"} · ${summarise(r.body)}`,
        );
      }

      {
        const attempt = await write(
          "/rest/v1/admin_settings?id=eq.true",
          "PATCH",
          { enrollment_enabled: false },
          userToken,
        );
        // Same trick as A6: the confirmation goes through the anon availability RPC, because
        // this identity cannot SELECT the table it just tried to write.
        const after = await readAvailability();
        const unchanged = after.row?.enrollment_enabled === baselineEnabled;
        record(
          "B4. non-admin UPDATE on admin_settings changes nothing",
          (attempt.status >= 400 || rowsOf(attempt.body) === 0) && unchanged,
          `PATCH HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
            `separate re-read: enrollment_enabled=${after.row?.enrollment_enabled} (baseline ${baselineEnabled})` +
            (unchanged ? "" : " ← CHANGED. Restore it: update public.admin_settings set enrollment_enabled = true where id;"),
        );
      }

      {
        const attempt = await write(
          "/rest/v1/admin_settings",
          "POST",
          { id: true, notification_email: "probe-5b@example.com" },
          userToken,
        );
        record(
          "B5. non-admin INSERT on admin_settings is refused",
          attempt.status >= 400 && rowsOf(attempt.body) === 0,
          `HTTP ${attempt.status} · code=${codeOf(attempt.body) ?? "—"} · ${summarise(attempt.body)}`,
        );
      }

      if (!activePaymentRow) {
        skip("B6. non-admin UPDATE on payment_settings changes nothing", "No active row.");
        skip("B8. non-admin DELETE on payment_settings removes nothing", "No active row.");
      } else {
        {
          const attempt = await write(
            "/rest/v1/payment_settings?is_active=eq.true",
            "PATCH",
            { additional_details: activePaymentRow.additional_details },
            userToken,
          );
          const after = await call("/rest/v1/payment_settings?select=updated_at&is_active=eq.true");
          const afterUpdatedAt = Array.isArray(after.body) ? (after.body[0]?.updated_at ?? null) : null;
          const untouched = afterUpdatedAt === activePaymentRow.updated_at;
          record(
            "B6. non-admin UPDATE on payment_settings changes nothing",
            (attempt.status >= 400 || rowsOf(attempt.body) === 0) && untouched,
            `PATCH HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
              `separate re-read: updated_at ${untouched ? "unchanged" : `MOVED to ${afterUpdatedAt}`}`,
          );
        }

        {
          const attempt = await write(
            "/rest/v1/payment_settings?is_active=eq.true",
            "DELETE",
            undefined,
            userToken,
          );
          const after = await call(
            `/rest/v1/payment_settings?select=id&id=eq.${encodeURIComponent(activePaymentRow.id)}`,
          );
          const survived = rowsOf(after.body) === 1;
          record(
            "B8. non-admin DELETE on payment_settings removes nothing",
            (attempt.status >= 400 || rowsOf(attempt.body) === 0) && survived,
            `DELETE HTTP ${attempt.status} · ${rowsOf(attempt.body)} row(s) · code=${codeOf(attempt.body) ?? "—"} · ` +
              `separate re-read: row ${survived ? "still present" : "GONE"}`,
          );

          if (!survived) {
            console.log(
              "\n!! The active payment_settings row was deleted by a NON-ADMIN account.\n" +
                "!! Recovery data, captured before the attempt:\n" +
                `!! ${JSON.stringify(activePaymentRow)}\n`,
            );
          }
        }
      }

      {
        const attempt = await write(
          "/rest/v1/payment_settings",
          "POST",
          {
            bank_name: "[probe-5b] non-admin insert must be refused",
            account_name: "[probe-5b]",
            account_number: "0000000000",
            currency: "NGN",
            payment_instructions: "[probe-5b] inactive row, safe to delete",
            is_active: false,
          },
          userToken,
        );
        record(
          "B7. non-admin INSERT on payment_settings is refused",
          attempt.status >= 400 && rowsOf(attempt.body) === 0,
          `HTTP ${attempt.status} · code=${codeOf(attempt.body) ?? "—"} · ${summarise(attempt.body)}`,
        );

        const inserted = Array.isArray(attempt.body) ? attempt.body[0] : null;
        if (inserted?.id) {
          strandedRows.push(`payment_settings id ${inserted.id} (inserted by B7, is_active=false)`);
        }
      }

      {
        // Positive control. 003's public read policy is `to anon, authenticated`, and a
        // "tightening" that broke it would break the payment step for every signed-in
        // visitor — a failure mode no negative probe would ever notice.
        const r = await call("/rest/v1/payment_settings?select=bank_name,is_active", {
          token: userToken,
        });
        record(
          "B9. non-admin can still read the active payment row (positive control)",
          r.status === 200 && rowsOf(r.body) === 1,
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s)`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------------
  console.log("\n--- Section C: as a signed-in admin, including the pause round trip ---\n");
  // -------------------------------------------------------------------------------

  let adminToken = null;

  if (!env.PROBE_ADMIN_EMAIL || !env.PROBE_ADMIN_PASSWORD) {
    skip(
      "C1. admin can sign in",
      "PROBE_ADMIN_EMAIL / PROBE_ADMIN_PASSWORD not set in .env.local — the admin positive " +
        "controls and the PA001 round trip are unproven.",
    );
  } else {
    const session = await signIn(env.PROBE_ADMIN_EMAIL, env.PROBE_ADMIN_PASSWORD);
    adminToken = session.token;
    record(
      "C1. admin can sign in",
      Boolean(adminToken),
      `HTTP ${session.status} · ${adminToken ? "session obtained" : summarise(session.body)}`,
    );
  }

  const skipSectionC = (reason) => {
    for (const name of [
      "C2. is_admin() is true for this account (precondition)",
      "C3. admin can read admin_settings (positive control)",
      "C4a. admin can pause enrollments",
      "C4b. the paused state and the admin's message reach an anonymous caller",
      "C4c. create_enrollment is refused with PA001 while paused",
      "C4d. admin can reopen enrollments",
      "C4e. the reopen is confirmed by a separate re-read",
      "C4f. create_enrollment succeeds again once reopened",
    ]) {
      skip(name, reason);
    }
  };

  if (!adminToken) {
    skipSectionC("No admin session.");
    console.log(
      "\n      NOTE: without an admin session the round trip cannot be driven from here, but\n" +
        "      A15/A16 prove the guard against a site paused out of band. Pause it, re-run\n" +
        "      this suite, then restore and re-read in a separate statement:\n" +
        "        update public.admin_settings set enrollment_enabled = false where id;\n" +
        "        update public.admin_settings set enrollment_enabled = true  where id;\n",
    );
  } else {
    const isAdmin = await rpc("is_admin", {}, adminToken);
    const confirmed = isAdmin.status === 200 && isAdmin.body === true;
    record(
      "C2. is_admin() is true for this account (precondition)",
      confirmed,
      `HTTP ${isAdmin.status} · is_admin=${JSON.stringify(isAdmin.body)}`,
    );

    if (!confirmed) {
      console.log(
        "\n      PROBE_ADMIN_* is not linked in public.admins. Link it with\n" +
          "      supabase/maintenance/grant_admin.sql. Nothing below can run without it.\n",
      );
      skipSectionC("PROBE_ADMIN_* is not an administrator.");
    } else {
      // C3. The positive control for 003's admin SELECT policy, and the only place in this
      // suite that touches notification_email. Its presence is asserted; its value is never
      // printed, because a probe log is not the place for an operator's address.
      let storedMessage = null;
      {
        const r = await call(
          "/rest/v1/admin_settings?select=notification_email,enrollment_enabled,enrollment_paused_message",
          { token: adminToken },
        );
        const row = Array.isArray(r.body) ? (r.body[0] ?? null) : null;
        storedMessage = row?.enrollment_paused_message ?? null;

        record(
          "C3. admin can read admin_settings (positive control)",
          r.status === 200 && rowsOf(r.body) === 1 && typeof row?.enrollment_enabled === "boolean",
          `HTTP ${r.status} · ${rowsOf(r.body)} row(s) · notification_email ` +
            `${row && "notification_email" in row ? (row.notification_email ? "present (not printed)" : "null") : "MISSING FROM RESULT"} · ` +
            `enrollment_enabled=${row?.enrollment_enabled} · paused_message ${storedMessage ? `set (${storedMessage.length} chars)` : "null"}`,
        );
      }

      // C4. The round trip. `finally` restores the switch even if a probe throws, because a
      // crash here would otherwise leave the site closed to enrollments.
      let paused = false;
      try {
        {
          // Only enrollment_enabled is sent. The administrator's own wording is left exactly
          // as it is — C4b asserts against what C3 read rather than against text this suite
          // made up, which is a stronger claim anyway.
          const r = await write(
            "/rest/v1/admin_settings?id=eq.true",
            "PATCH",
            { enrollment_enabled: false },
            adminToken,
          );
          paused = r.status < 400 && rowsOf(r.body) === 1;
          record(
            "C4a. admin can pause enrollments",
            paused,
            `PATCH HTTP ${r.status} · ${rowsOf(r.body)} row(s) · code=${codeOf(r.body) ?? "—"} · ${summarise(r.body)}`,
          );
        }

        if (!paused) {
          for (const name of [
            "C4b. the paused state and the admin's message reach an anonymous caller",
            "C4c. create_enrollment is refused with PA001 while paused",
            "C4f. create_enrollment succeeds again once reopened",
          ]) {
            skip(name, "The pause could not be set, so there is nothing to observe.");
          }
        } else {
          {
            const after = await readAvailability();
            const enabled = after.row?.enrollment_enabled;
            const message = after.row?.paused_message ?? null;
            // The message must be the stored one verbatim: it is the only thing a blocked
            // student reads, and 010 hands it out precisely so error text never has to.
            const messageMatches = message === storedMessage;
            record(
              "C4b. the paused state and the admin's message reach an anonymous caller",
              after.status === 200 && enabled === false && messageMatches,
              `HTTP ${after.status} · enrollment_enabled=${enabled} · paused_message ` +
                `${messageMatches ? "matches the stored message" : `DIFFERS (got ${summarise(message)})`}`,
            );
          }

          if (!publishedSlug) {
            skip(
              "C4c. create_enrollment is refused with PA001 while paused",
              "No published course to attempt an enrollment against.",
            );
          } else {
            const attempt = await attemptEnrollment(publishedSlug, "paused");
            const code = codeOf(attempt.body);
            if (attempt.row?.order_id) createdOrderIds.push(attempt.row.order_id);
            record(
              "C4c. create_enrollment is refused with PA001 while paused",
              attempt.status >= 400 && code === "PA001",
              `HTTP ${attempt.status} · code=${code ?? "—"} · ${summarise(attempt.body)}` +
                (attempt.row?.order_id
                  ? ` ← AN ENROLLMENT WAS CREATED WHILE PAUSED (order ${attempt.row.order_id})`
                  : ""),
            );
          }
        }
      } finally {
        const r = await write(
          "/rest/v1/admin_settings?id=eq.true",
          "PATCH",
          { enrollment_enabled: true },
          adminToken,
        );
        record(
          "C4d. admin can reopen enrollments",
          r.status < 400 && rowsOf(r.body) === 1,
          `PATCH HTTP ${r.status} · ${rowsOf(r.body)} row(s) · code=${codeOf(r.body) ?? "—"}`,
        );

        // A separate request, deliberately. The PATCH above already returned the row it
        // wrote; trusting that instead of re-reading is the exact mistake that produced two
        // false passes earlier in this project.
        const after = await readAvailability();
        record(
          "C4e. the reopen is confirmed by a separate re-read",
          after.status === 200 &&
            after.row?.enrollment_enabled === true &&
            (after.row?.paused_message ?? null) === null,
          `HTTP ${after.status} · enrollment_enabled=${after.row?.enrollment_enabled} · ` +
            `paused_message=${JSON.stringify(after.row?.paused_message ?? null)}` +
            (after.row?.enrollment_enabled === true
              ? ""
              : " ← STILL PAUSED. Restore it by hand: update public.admin_settings set enrollment_enabled = true where id;"),
        );

        if (!publishedSlug) {
          skip("C4f. create_enrollment succeeds again once reopened", "No published course.");
        } else if (after.row?.enrollment_enabled !== true) {
          skip("C4f. create_enrollment succeeds again once reopened", "The reopen did not take.");
        } else {
          const attempt = await attemptEnrollment(publishedSlug, "reopened");
          if (attempt.row?.order_id) createdOrderIds.push(attempt.row.order_id);
          record(
            "C4f. create_enrollment succeeds again once reopened",
            attempt.status < 400 && Boolean(attempt.row?.order_id),
            `HTTP ${attempt.status} · order_id=${attempt.row?.order_id ?? "—"} · ` +
              (attempt.row?.order_id ? "the guard released" : summarise(attempt.body)),
          );
        }
      }
    }
  }

  // -------------------------------------------------------------------------------
  console.log("\n--- Section D: the working tree ---\n");
  // -------------------------------------------------------------------------------
  //
  // No database. These check the values Phase 5b duplicated out of SQL into TypeScript, and
  // the integrity of 010's copy of create_enrollment. Every one of them is a drift a
  // typecheck cannot see and a runtime error would only reveal to a student.

  const migration003 = fs.readFileSync(MIGRATION_003, "utf8");
  const migration010 = fs.readFileSync(MIGRATION_010, "utf8");
  const enrollmentConstants = fs.readFileSync(ENROLLMENT_CONSTANTS_TS, "utf8");
  const adminConstants = fs.readFileSync(ADMIN_CONSTANTS_TS, "utf8");
  const adminSettingsService = fs.readFileSync(ADMIN_SETTINGS_SERVICE_TS, "utf8");
  const availabilityService = fs.readFileSync(AVAILABILITY_SERVICE_TS, "utf8");

  /** A function body from a migration, between its `as $$` and the closing `$$;`. */
  const bodyOf = (sql, functionName) => {
    const pattern = new RegExp(
      `create or replace function public\\.${functionName}\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;`,
    );
    return pattern.exec(sql)?.[1] ?? null;
  };

  const availabilityBody = bodyOf(migration010, "get_enrollment_availability");
  const createEnrollmentBody = bodyOf(migration010, "create_enrollment");

  // D1. The SQLSTATE the frontend matches on against the one 010 raises. A mismatch would
  // turn the paused-mid-flow case into the generic "something went wrong" branch, losing the
  // "contact support before making any further payment" instruction that case exists for.
  {
    const sqlCode = /raise exception 'Enrollments are currently paused'[\s\S]*?using errcode = '([^']+)'/.exec(
      migration010,
    )?.[1];
    const tsCode = /ENROLLMENT_PAUSED_SQLSTATE\s*=\s*"([^"]+)"/.exec(enrollmentConstants)?.[1];
    record(
      "D1. ENROLLMENT_PAUSED_SQLSTATE matches the errcode 010 raises",
      Boolean(sqlCode) && sqlCode === tsCode,
      `010: ${sqlCode ?? "not found"} · enrollment.ts: ${tsCode ?? "not found"}`,
    );

    // D2. 002's own rule for a custom condition: the class's first character must fall in the
    // I-Z range PostgreSQL reserves for user-defined SQLSTATEs. 'EN001' would break it.
    const first = sqlCode?.[0] ?? "";
    record(
      "D2. the SQLSTATE class is in the I-Z range reserved for user-defined conditions",
      first >= "I" && first <= "Z",
      `code ${sqlCode ?? "—"} · class letter '${first || "—"}' ${first >= "I" && first <= "Z" ? "in range" : "OUT OF RANGE"}`,
    );
  }

  // D3. The narrow window. If the function ever selected more than its two columns, this is
  // the file where it would happen, and A3 would only catch it against a live database.
  {
    const returns = /returns table \(([\s\S]*?)\)\s*language sql/.exec(migration010)?.[1] ?? "";
    const columns = returns
      .split(",")
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean)
      .sort();
    const exact = JSON.stringify(columns) === JSON.stringify(AVAILABILITY_KEYS.slice().sort());
    // The header comment mentions notification_email while explaining why it is excluded, so
    // this looks at the body only.
    const bodyClean = Boolean(availabilityBody) && !availabilityBody.includes("notification_email");
    record(
      "D3. get_enrollment_availability returns two columns and its body never names notification_email",
      exact && bodyClean,
      `columns: [${columns.join(", ")}] · body mentions notification_email: ${!bodyClean}`,
    );
  }

  // D4. 010 retyped nothing, but it did copy 5.6 KB. These four names are the load-bearing
  // pieces of the body: the rate limiter, the order id, the token hash, and the receipt path
  // validator. Any one of them missing means the copy lost something.
  {
    const required = ["RL001", "next_enrollment_order_id", "access_token_hash", "is_valid_receipt_path"];
    const missing = required.filter((name) => !createEnrollmentBody?.includes(name));
    record(
      "D4. 010's copy of create_enrollment still contains every load-bearing piece of 002's body",
      Boolean(createEnrollmentBody) && missing.length === 0,
      createEnrollmentBody
        ? missing.length === 0
          ? `all present: ${required.join(", ")}`
          : `MISSING: ${missing.join(", ")}`
        : "create_enrollment body not found in 010",
    );
  }

  // D5. Ordering, which is a security property rather than a style choice: the guard has to
  // precede the course lookup, or a paused site becomes an oracle for which slugs exist.
  {
    const guardAt = createEnrollmentBody?.indexOf("PA001") ?? -1;
    const lookupAt = createEnrollmentBody?.indexOf("from public.courses") ?? -1;
    record(
      "D5. the pause guard precedes the course lookup, so a paused site is not a slug oracle",
      guardAt > -1 && lookupAt > -1 && guardAt < lookupAt,
      `PA001 at ${guardAt} · course lookup at ${lookupAt}`,
    );
  }

  // D6. The one new grant this phase adds, and the grant it must not add.
  {
    const revoked = /revoke all on function public\.get_enrollment_availability\(\) from public;/.test(
      migration010,
    );
    const granted =
      /grant execute on function public\.get_enrollment_availability\(\) to anon, authenticated;/.test(
        migration010,
      );
    // A `grant … on public.admin_settings` anywhere in 010 would undo 003's revoke and make
    // notification_email reachable, which is the single worst thing this migration could do.
    const grantsTable = /grant[^;]{0,200}\bon\b[^;]{0,80}admin_settings/i.test(migration010);
    record(
      "D6. 010 grants EXECUTE on the RPC to anon/authenticated and grants nothing on admin_settings",
      revoked && granted && !grantsTable,
      `revoke from public: ${revoked} · grant to anon, authenticated: ${granted} · ` +
        `grants a table privilege on admin_settings: ${grantsTable}`,
    );
  }

  // D7. The one settings bound that mirrors a real constraint, unlike the length maxima
  // beside it. `> 0` on an integer column is a minimum of 1.
  {
    const check = /check \(review_window_hours > (\d+) and review_window_hours <= (\d+)\)/.exec(
      migration003,
    );
    const sqlMin = check ? Number(check[1]) + 1 : null;
    const sqlMax = check ? Number(check[2]) : null;
    const tsMin = Number(/REVIEW_WINDOW_HOURS_MIN\s*=\s*(\d+)/.exec(adminConstants)?.[1]);
    const tsMax = Number(/REVIEW_WINDOW_HOURS_MAX\s*=\s*(\d+)/.exec(adminConstants)?.[1]);
    record(
      "D7. the review-window bounds match 003's check constraint",
      sqlMin !== null && sqlMin === tsMin && sqlMax === tsMax,
      `003: ${sqlMin ?? "not found"}–${sqlMax ?? "not found"} · admin.ts: ${tsMin}–${tsMax}`,
    );
  }

  // D8. Both tables carry a set_updated_at() BEFORE UPDATE trigger, so `updated_at` belongs
  // to the database. A payload key would be a value the trigger immediately overwrites — and
  // code that reads as though it did not know that. The column names appear in the SELECT
  // lists as string contents, never as an object key, so an `updated_at:` line is exactly the
  // mistake being looked for.
  {
    const written = /^\s*updated_at\s*:/m.test(adminSettingsService);
    record(
      "D8. no settings write payload carries updated_at",
      !written,
      written
        ? "adminSettings.service.ts assigns updated_at in a payload — the trigger owns that column"
        : "no `updated_at:` payload key in adminSettings.service.ts",
    );
  }

  // D9. The RPC name is a string on one side and a function name on the other, so nothing
  // but this connects them. A typo here typechecks and fails only in front of a student.
  {
    const declared = /create or replace function public\.(get_enrollment_availability)\(\)/.exec(
      migration010,
    )?.[1];
    const called = /supabase\.rpc\("([^"]+)"\)/.exec(availabilityService)?.[1];
    record(
      "D9. the RPC name the service calls is the function 010 creates",
      Boolean(declared) && declared === called,
      `010: ${declared ?? "not found"} · enrollmentAvailability.service.ts: ${called ?? "not found"}`,
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
      "\nTo run the skipped sections, add the same probe accounts the Phase 4 and 5a suites\n" +
        "use to .env.local (create them in the Supabase Dashboard with 'Auto Confirm User'\n" +
        "ticked):\n" +
        "\n" +
        "  PROBE_ADMIN_EMAIL=      PROBE_ADMIN_PASSWORD=\n" +
        "  PROBE_NONADMIN_EMAIL=   PROBE_NONADMIN_PASSWORD=\n" +
        "\n" +
        "Link only the first into public.admins with supabase/maintenance/grant_admin.sql.",
    );
  }

  // Teardown report. Enrollments are expected leftovers — creating them IS the positive
  // control — so they are listed rather than treated as a finding. A stranded
  // payment_settings row is the opposite: it means a write that should have been refused
  // was not, and the probe that inserted it will already have failed.
  if (createdOrderIds.length > 0) {
    console.log(
      `\nCREATED BY THIS RUN — ${createdOrderIds.length} probe enrollment(s): ${createdOrderIds.join(", ")}\n` +
        "Addresses are probe-5b+…@example.com, which scripts/probes/phase3-teardown.sql already\n" +
        "matches with its 'probe%@example.com' pattern. No receipt objects were uploaded.",
    );
  } else {
    console.log("\nNo probe enrollments were created by this run.");
  }

  if (strandedRows.length > 0) {
    console.log("\nLEFT BEHIND AND SHOULD NOT EXIST — remove these by hand:");
    for (const item of strandedRows) console.log(`  - ${item}`);
    console.log(
      "\nEach of these is a row an unprivileged caller inserted into public.payment_settings.\n" +
        "Delete by id, and treat the corresponding failed probe as the real finding.",
    );
  }

  process.exitCode = failed.length > 0 ? 1 : 0;
};

main().catch((error) => {
  console.error("Probe run failed:", error);
  process.exitCode = 2;
});
