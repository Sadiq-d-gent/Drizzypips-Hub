/**
 * Phase 7 email and verification probes.
 *
 * Phase 7 added three tables holding things that must not be public, a live verification code,
 * a student's address and course, a subscriber list, plus nine functions, of which the
 * dangerous ones can send mail as this brand or hand back live codes.
 *
 * WHY THIS SUITE EXISTS WHEN THE SQL PROBES ALREADY PASSED
 *
 * Migrations 014 to 018 were each verified with a SQL probe run through
 * `supabase db query --linked`. Those probes proved the logic: codes expire, attempts cap,
 * dedupe holds, the claim does not double-serve, the code is redacted at delivery.
 *
 * They proved nothing about access control and could not have. `db query` connects as a
 * superuser-equivalent role, which bypasses RLS entirely and holds every grant by definition. A
 * SQL probe asserting "anon cannot read this table" is asserting something it is structurally
 * incapable of observing: it would pass against a table with `using (true)` for anon.
 *
 * This suite runs over HTTPS with the anon key, which is the identity a visitor's browser
 * actually has, and with real signed-in sessions. It is the only place in the project where the
 * access-control claims in 014, 015, 016, 017 and 018 are tested by the roles they are written
 * about.
 *
 *   A. anon                   what a visitor's browser can reach
 *   B. signed-in non-admin    whether merely holding an account changes anything
 *   C. signed-in admin        the positive case, and its limits
 *   D. static source          no database, no credentials
 *
 * THE REFUSAL SHAPE IS NOT UNIFORM, AND GUESSING IT PRODUCES FALSE PASSES
 *
 * This is the trap the Phase 5a, 5b and 6 suites each document, and it is sharper here because
 * the three tables are treated differently per role. Every expectation below was read off the
 * migration line that creates it:
 *
 *   anon, all three tables, privileges revoked by name (014:170, 015:185, 017:166) and no
 *   policy of any kind. PostgREST cannot build the query, so the refusal is an ERROR. Asserting
 *   zero rows here would assert the weaker thing.
 *
 *   authenticated, all three tables, revoked and then `grant select` given straight back
 *   (014:177, 015:191, 017:171) precisely so the `using (public.is_admin())` policy has a
 *   privilege to filter. A signed-in NON-admin therefore gets HTTP 200 WITH ZERO ROWS, not an
 *   error. Section B asserts exactly that. Asserting `status >= 400` there would FAIL against a
 *   correctly configured database, which is the false negative this comment exists to prevent.
 *
 *   Functions, revoked from anon and authenticated by name, so an RPC call errors. The code may
 *   be 42501 or PGRST202: when a role cannot see a function, PostgREST reports it as missing
 *   rather than as forbidden. Both are refusals and both are printed verbatim.
 *
 * email_verifications IS admin-readable, by design (015:188-198), because it holds only
 * SHA-256 digests. C2 therefore does not assert that it is closed. It asserts that what an
 * admin can see contains no plaintext code, which is the guarantee that actually matters.
 *
 * WHAT THIS SUITE CHANGES ON THE TARGET DATABASE
 *
 * A6 and A10 are the only probes that write, and both go through the front door, a visitor
 * requesting a code and a visitor subscribing to a reminder, which is exactly what anon is
 * supposed to be able to do. Both use a `probe+<uuid>@example.com` address that cannot collide
 * with a real one.
 *
 * Neither can be cleaned up with the anon key, because Section A has just finished proving anon
 * cannot touch these tables. So the cleanup is attempted, its failure is reported as a probe
 * rather than swallowed, and the exact SQL to remove the rows is printed. A suite that claimed
 * a clean exit it had not achieved would be worse than one that leaves three rows behind.
 *
 * No enrollment is ever created: every create_enrollment call here is expected to be refused,
 * and 016:190-197 records that a refusal raises before the INSERT, so it writes nothing and
 * does not burn a volume-disclosing order id. No catalogue, payment or website-settings row is
 * written at any point. A10 reads the live countdown configuration and changes nothing: if
 * reminders are switched off, the RM002 refusal is itself the pass.
 *
 * Credentials come from `.env.local`, are never printed, and are never taken from the command
 * line. Sections B and C skip without them. A SKIP is not a PASS.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

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

const MIGRATIONS = path.join(projectRoot, "supabase", "migrations");
const M014 = path.join(MIGRATIONS, "014_email_outbox.sql");
const M015 = path.join(MIGRATIONS, "015_email_verification.sql");
const M016 = path.join(MIGRATIONS, "016_enrollment_email_notifications.sql");
const M017 = path.join(MIGRATIONS, "017_session_reminders.sql");
const M018 = path.join(MIGRATIONS, "018_email_dispatch.sql");
const EDGE_INDEX = path.join(projectRoot, "supabase", "functions", "send-email", "index.ts");
const EDGE_TEMPLATES = path.join(projectRoot, "supabase", "functions", "send-email", "templates.ts");
const ENV_EXAMPLE = path.join(projectRoot, ".env.example");

/** The three tables Phase 7 added that no unprivileged identity may read. */
const PRIVATE_TABLES = ["email_verifications", "email_outbox", "session_reminders"];

/**
 * Functions no browser identity may execute, with their real argument names taken from the
 * migrations rather than guessed, so a refusal is about permission and not about a signature
 * this suite got wrong.
 *
 * has_verified_email is the least obvious and among the most important. It is not destructive
 * and returns only a boolean, but that boolean answers "has this address been through
 * verification on this site?", which is an account-existence oracle. 015:451-454 revokes it for
 * exactly that reason, and this list is where the decision is enforced rather than stated.
 *
 * enqueue_email would make the queue writable by anyone: an open relay with this brand's sender
 * reputation behind it.
 *
 * claim_email_batch is the worst of them. Its RETURNS TABLE includes `payload`, so one
 * successful call hands back a live verification code for every queued row. It is the
 * highest-value read in this schema.
 */
const FORBIDDEN_RPCS = [
  { name: "has_verified_email", args: { p_email: "probe@example.com" } },
  {
    name: "enqueue_email",
    args: { p_template: "verification_code", p_to_email: "probe@example.com" },
  },
  { name: "dispatch_session_reminders", args: {} },
  { name: "dispatch_email_outbox", args: {} },
  { name: "claim_email_batch", args: { p_limit: 1 } },
  { name: "complete_email_delivery", args: { p_id: "00000000-0000-0000-0000-000000000000" } },
  { name: "requeue_stuck_emails", args: {} },
];

/**
 * 017 also creates reschedule_session_reminders(), and it belongs in the same category as the
 * seven above, but it is deliberately NOT probed over HTTP. It RETURNS trigger, so it is not a
 * callable endpoint and PostgREST never exposes it; a request would fail to route for a reason
 * that has nothing to do with privilege, and the probe would pass while proving nothing. Its
 * ACLs are covered by the static sweep in D9 instead, which reads the migration text and can
 * therefore see the grants on a function no client can reach.
 */

/** A unique address per run, so two concurrent runs cannot interfere with each other. */
const PROBE_EMAIL = `probe+${crypto.randomUUID()}@example.com`;

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
  return text && text.length > 200 ? `${text.slice(0, 200)}…` : text;
};

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

const rpc = (name, args = {}, token = ANON) =>
  call(`/rest/v1/rpc/${name}`, { token, method: "POST", body: JSON.stringify(args) });

const rowsOf = (body) => (Array.isArray(body) ? body.length : 0);

/** PostgREST returns a bare object for an error and an array for a result set. */
const codeOf = (body) =>
  body && typeof body === "object" && !Array.isArray(body) ? body.code : null;

const errorLine = (r) =>
  `HTTP ${r.status}${codeOf(r.body) ? ` / ${codeOf(r.body)}` : ""} · ` +
  summarise(r.body?.message ?? r.body);

/** A `returns table` RPC arrives as a one-row array; a scalar arrives bare. */
const firstRow = (body) => (Array.isArray(body) ? body[0] ?? null : body);

const signIn = async (email, password) => {
  const response = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, token: body?.access_token ?? null, body };
};

const readSource = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
};

/**
 * Runs SQL against the linked remote database through the Supabase CLI, as a superuser-equivalent
 * role. This bypasses RLS entirely, so it is the WRONG tool for asking whether a table leaks, and
 * that is the whole reason Sections A to C go over HTTPS instead.
 *
 * Section E uses it for the one thing HTTPS cannot do without a password: it impersonates a role
 * INSIDE the query with `set role` plus a forged `request.jwt.claims`, which is how RLS is
 * exercised for an identity no probe account exists for. That is genuinely weaker than a real
 * session (nothing here proves the HTTP layer wires the JWT through), and Section E says so in
 * its own output rather than implying otherwise.
 */
const runSql = (sql) => {
  const r = spawnSync("npx", ["supabase", "db", "query", "--linked"], {
    input: sql,
    encoding: "utf8",
    shell: true,
    timeout: 120000,
    cwd: projectRoot,
  });

  if (r.error) return { ok: false, why: r.error.message };

  const out = r.stdout ?? "";
  const start = out.indexOf("{");
  if (start === -1) return { ok: false, why: `no JSON in output: ${out.trim().slice(0, 160)}` };

  // The CLI prints exactly one JSON object, and warnings follow it on stderr, which is why only
  // stdout is read and the slice stops at the final brace.
  const end = out.lastIndexOf("}");
  try {
    return { ok: true, rows: JSON.parse(out.slice(start, end + 1)).rows ?? [] };
  } catch {
    return { ok: false, why: "the CLI's output was not parseable JSON" };
  }
};

/** The ID an admin session carries. Read from the database so the check is not tied to one deploy. */
const asAdminSql = (body) => `
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select auth_id::text from public.admins limit 1), 'role', 'authenticated')::text,
  false
);
set role authenticated;
${body}
`;

const asNonAdminSql = (body) => `
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',
  false
);
set role authenticated;
${body}
`;

/**
 * Replaces the CONTENTS of every string, template literal and comment with spaces, keeping the
 * file byte-for-byte the same LENGTH so indices still line up with the original.
 *
 * The length preservation is the point: D4 and D5 need to find a call by scanning structure and
 * then read the real literal out of the same offsets. Two things go wrong without this. A
 * parenthesis inside a string, which the Edge Function has at line 257 in
 * `${email.template}):`, corrupts a nesting count. And a comment mentioning `payload`, which the
 * Edge Function has at line 14, reads as though the code logged one.
 *
 * `sql: true` also masks `--` to end of line, and that is what makes D5 work at all. A migration
 * is prose as much as code, and 016:210 writes "PL/pgSQL's" inside a comment. A masker that only
 * knows about quotes reads that apostrophe as opening a string literal and blanks everything
 * after it until the next quote somewhere far below, which in 016 is far enough to swallow the
 * CASE that names two real templates. The failure is silent, and it looks exactly like templates
 * that were never enqueued.
 *
 * TypeScript keeps the original behaviour, where `--` is a decrement operator and not a comment.
 */
const maskLiterals = (text, { sql = false } = {}) => {
  const out = text.split("");
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // SQL string literals escape a quote by doubling it, so '' is a quote inside a string rather
    // than the end of one. Handled here because the same prose that writes "PL/pgSQL's" also
    // writes things like "010's own 'ADDED IN 010' comments".
    if (ch === "'") {
      i += 1;
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'" && sql) {
          out[i] = " ";
          out[i + 1] = " ";
          i += 2;
          continue;
        }
        if (text[i] === "'") break;
        out[i] = " ";
        i += 1;
      }
      i += 1;
      continue;
    }

    if (ch === '"' || ch === "`") {
      i += 1;
      while (i < text.length) {
        if (text[i] === "\\") {
          out[i] = " ";
          i += 2;
          continue;
        }
        if (text[i] === ch) break;
        out[i] = " ";
        i += 1;
      }
      i += 1;
      continue;
    }

    if (sql && ch === "-" && text[i + 1] === "-") {
      while (i < text.length && text[i] !== "\n") {
        out[i] = " ";
        i += 1;
      }
      continue;
    }

    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        out[i] = " ";
        i += 1;
      }
      continue;
    }

    if (ch === "/" && text[i + 1] === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        out[i] = " ";
        i += 1;
      }
      out[i] = " ";
      out[i + 1] = " ";
      i += 2;
      continue;
    }

    i += 1;
  }

  return out.join("");
};

/**
 * The character range of a call's arguments: just after its opening parenthesis to the matching
 * close. Nesting is tracked so `console.error(a, b(c))` does not run past its own end, which is
 * what a `[^;]*` scan does in a semicolon-free file.
 *
 * Run against masked text. The returned indices are valid in the original, because masking
 * preserves length.
 */
const argumentRange = (text, openIndex) => {
  let depth = 0;

  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === "(") depth += 1;
    else if (text[i] === ")") {
      depth -= 1;
      if (depth === 0) return { start: openIndex + 1, end: i };
    }
  }

  return { start: openIndex + 1, end: text.length };
};

/** A call's first argument: up to the first comma at nesting depth zero. */
const firstArgument = (span) => {
  let depth = 0;

  for (let i = 0; i < span.length; i += 1) {
    const ch = span[i];
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === "," && depth === 0) return span.slice(0, i);
  }

  return span;
};

/**
 * create_enrollment's real signature, from 016:150-160. There is no payment-reference argument
 * and the course is identified by SLUG, not by id: 016:218-221 looks it up with
 * `where courses.slug = p_course_slug and courses.published = true`.
 *
 * That ordering is why a real slug is required. The course lookup raises no_data_found at
 * 016:228, BEFORE the EV002 guard at 016:255 is reached, so calling with a nonexistent course
 * would be refused by the wrong check and the probe would report a pass it had not earned.
 */
const enrollmentArgs = (slug, email) => ({
  p_course_slug: slug,
  p_student_name: "Phase 7 Probe",
  p_student_email: email,
  p_student_phone: "+2348000000000",
});

/**
 * A table read that must be refused with an ERROR rather than with zero rows. Used for anon
 * only: `authenticated` holds `grant select` on all three tables, so it gets the zero-rows
 * shape instead. See the header.
 *
 * 404 / PGRST205 counts, and is worth explaining. With privileges revoked, PostgREST's schema
 * cache may not expose the table to the role at all, so it answers "no such table" rather than
 * "permission denied". That is a stronger refusal, not a weaker one: the table is not merely
 * unreadable, it is invisible.
 */
const probeTablesUnreadable = async ({ label, token, prefix }) => {
  for (const table of PRIVATE_TABLES) {
    const r = await call(`/rest/v1/${table}?select=*&limit=1`, { token });
    const refused = r.status >= 400;

    record(
      `${prefix} ${label} cannot read public.${table}`,
      refused && rowsOf(r.body) === 0,
      refused
        ? `refused: ${errorLine(r)}`
        : `LEAK: HTTP ${r.status} returned ${rowsOf(r.body)} row(s) · ${summarise(r.body)}`,
    );
  }
};

const probeRpcsForbidden = async ({ label, token, prefix }) => {
  for (const { name, args } of FORBIDDEN_RPCS) {
    const r = await rpc(name, args, token);

    record(
      `${prefix} ${label} cannot execute ${name}()`,
      r.status >= 400,
      r.status >= 400
        ? `refused: ${errorLine(r)}`
        : `EXECUTED: HTTP ${r.status} · ${summarise(r.body)}`,
    );
  }
};

const main = async () => {
  console.log("Phase 7 email and verification probes");
  console.log(`Target: ${URL_BASE}`);
  console.log(`Probe address: ${PROBE_EMAIL}`);

  let createdVerification = false;
  let createdReminder = false;

  try {
    // =================================================================================
    console.log("\n=== A. Anonymous, the identity every visitor's browser holds ===\n");

    await probeTablesUnreadable({ label: "anon", token: ANON, prefix: "A1" });
    await probeRpcsForbidden({ label: "anon", token: ANON, prefix: "A2" });

    // A published course, so the EV002 probes are refused by the verification guard and not by
    // the course lookup that precedes it. Read, never written.
    const catalogue = await call("/rest/v1/courses?select=slug&published=is.true&limit=1");
    const slug = Array.isArray(catalogue.body) ? catalogue.body[0]?.slug ?? null : null;

    if (!slug) {
      skip(
        "A3  the server-side enrollment guard",
        "No published course to enroll against, and create_enrollment checks the course " +
          "(016:218) before it checks verification (016:255), so a synthetic slug would be " +
          "refused by the wrong guard. Whether EV002 fires is UNPROVEN.",
      );
    } else {
      // A3. The sentence the whole feature rests on: the enrollment submission itself must
      // verify the verification state server-side. A browser that sets verified = true in React
      // state, or a caller that skips the UI and POSTs the RPC directly, which is what this
      // does, must still be refused.
      //
      // EV002 specifically. A generic 400 would not prove the guard fired, because a bad slug, a
      // short name or a malformed address each produce one too. This call is deliberately well
      // formed in every other respect, so EV002 is the only thing left to refuse it.
      const r = await rpc("create_enrollment", enrollmentArgs(slug, PROBE_EMAIL));
      const code = codeOf(r.body);

      record(
        "A3  create_enrollment refuses an unverified address with EV002",
        r.status >= 400 && code === "EV002",
        r.status >= 400
          ? errorLine(r) +
            (code === "EV002"
              ? ` · against the real published course "${slug}", so the guard was reached`
              : " · WRONG GUARD: refused, but not by the verification check")
          : `ACCEPTED: HTTP ${r.status} — an enrollment was created without verification · ${summarise(r.body)}`,
      );

      // A4. The same guard with the address's case changed. create_enrollment only btrims
      // (016:180) while has_verified_email lowercases (015:444), so normalisation happens inside
      // the guard. If it did not, an attacker could sidestep verification by capitalising one
      // letter of an address they had already verified.
      const cased = await rpc("create_enrollment", enrollmentArgs(slug, PROBE_EMAIL.toUpperCase()));

      record(
        "A4  the guard is not bypassed by changing the address's case",
        cased.status >= 400 && codeOf(cased.body) === "EV002",
        errorLine(cased),
      );
    }

    // A5. What anon SHOULD be able to do. A visitor must be able to ask for a code or the
    // feature does not exist.
    //
    // The assertion is not "it worked", it is that the response cannot yield the code. 015
    // returns only expires_at and resend_after (015:216-219), and its header calls a response
    // body containing the code "decorative", since anyone who can call the RPC could read it.
    //
    // Checked by KEY, then by a digit scan over the response with timestamps removed. The
    // removal is load-bearing: a Postgres timestamptz serialises its microseconds as exactly six
    // digits, so a naive /\d{6}/ would match `.789123` inside expires_at and fail against a
    // correct database.
    {
      const r = await rpc("request_email_verification", { p_email: PROBE_EMAIL });
      const ok = r.status < 400;
      createdVerification = ok;

      const row = firstRow(r.body) ?? {};
      const keys = ok && typeof row === "object" ? Object.keys(row) : [];
      const unexpected = keys.filter((k) => k !== "expires_at" && k !== "resend_after");

      const withoutTimestamps = JSON.stringify(r.body ?? "").replace(
        /\d{4}-\d{2}-\d{2}T[\d:.]+(?:[+-]\d{2}:?\d{2}|Z)?/g,
        "",
      );
      const strayDigits = /\d{6}/.test(withoutTimestamps);

      record(
        "A5  anon can request a code, and the response cannot yield it",
        ok && unexpected.length === 0 && !strayDigits,
        ok
          ? `HTTP ${r.status} · keys: [${keys.join(", ")}]` +
            (unexpected.length ? ` · LEAK: unexpected key(s) [${unexpected.join(", ")}]` : "") +
            (strayDigits ? " · LEAK: a six-digit run survives timestamp removal" : "")
          : `refused: ${errorLine(r)}`,
      );
    }

    // A6. The cooldown, exercised from outside. 015:244 puts 60 seconds between requests for the
    // same address, which is what stops this endpoint being used to mail-bomb somebody.
    // Immediately repeating A5 must be refused with EV001.
    {
      const r = await rpc("request_email_verification", { p_email: PROBE_EMAIL });

      record(
        "A6  a second request for the same address is rate limited (EV001)",
        r.status >= 400 && codeOf(r.body) === "EV001",
        r.status >= 400
          ? errorLine(r)
          : `NOT LIMITED: HTTP ${r.status} — the cooldown did not fire · ${summarise(r.body)}`,
      );
    }

    // A7. A wrong code must not verify.
    //
    // verify_email_code returns a status rather than raising, deliberately: 015:314-315 records
    // that a RAISE would roll back the attempt counter the function depends on. So this asserts
    // on the returned status, not on an HTTP code. Anything other than 'verified' passes;
    // 'incorrect' is what a correct implementation returns here.
    {
      const r = await rpc("verify_email_code", { p_email: PROBE_EMAIL, p_code: "000000" });
      const status = firstRow(r.body)?.status ?? null;

      record(
        "A7  a wrong code does not verify the address",
        r.status < 400 && status !== null && status !== "verified",
        r.status < 400
          ? `status: ${status} · ${summarise(r.body)}`
          : `unexpected error rather than a status: ${errorLine(r)}`,
      );
    }

    // A8. And having failed, the address is still refused by the enrollment guard. This is A3
    // from the state a real attacker reaches: a code requested but never received, and a wrong
    // guess submitted.
    if (slug) {
      const r = await rpc("create_enrollment", enrollmentArgs(slug, PROBE_EMAIL));

      record(
        "A8  a failed verification attempt does not count as verification",
        r.status >= 400 && codeOf(r.body) === "EV002",
        errorLine(r),
      );
    }

    // A9. Reminder subscription, the other thing anon is meant to be able to do. Whether it
    // succeeds depends on live settings this suite must not change, so both outcomes are
    // legitimate and the probe reports which one it saw. RM002 means reminders are switched off,
    // no session is set, or the session has already started (017:272-287), each of which is
    // correct behaviour rather than a failure.
    {
      const r = await rpc("subscribe_session_reminder", { p_email: PROBE_EMAIL });
      const code = codeOf(r.body);
      const status = firstRow(r.body)?.status ?? null;
      createdReminder = r.status < 400 && status === "subscribed";

      record(
        "A9  anon can subscribe to a reminder, or is told why not",
        r.status < 400 || code === "RM002",
        r.status < 400
          ? `subscribed: status ${status} · ${summarise(r.body)}`
          : code === "RM002"
            ? "reminders are not currently open (RM002), a valid live configuration"
            : `UNEXPECTED: ${errorLine(r)}`,
      );
    }

    // A10. The subscriber list stays invisible even to somebody on it. Subscribing grants no
    // read: 017:180-181 has no anon policy of any kind. A1 already proved the table errors; this
    // repeats it against a row anon just caused to exist, which is the case a well-meaning
    // "it's my own row" policy would have opened up.
    {
      const r = await call(
        `/rest/v1/session_reminders?select=email&email=eq.${encodeURIComponent(PROBE_EMAIL)}`,
      );

      record(
        "A10 subscribing does not let anon read the subscriber list",
        r.status >= 400 || rowsOf(r.body) === 0,
        r.status >= 400
          ? `refused: ${errorLine(r)}`
          : `HTTP ${r.status} returned ${rowsOf(r.body)} row(s)` +
            (rowsOf(r.body) ? ` · LEAK: ${summarise(r.body)}` : ""),
      );
    }

    // A11. The outbox is where a verification code sits in plaintext between enqueue and
    // delivery, and A5 has just put one there. This is the highest-value read in the schema and
    // the single most important assertion in this file.
    {
      const r = await call(
        `/rest/v1/email_outbox?select=payload,to_email&to_email=eq.${encodeURIComponent(PROBE_EMAIL)}`,
      );

      record(
        "A11 anon cannot read the outbox row holding its own live code",
        r.status >= 400 || rowsOf(r.body) === 0,
        r.status >= 400
          ? `refused: ${errorLine(r)}`
          : `HTTP ${r.status} returned ${rowsOf(r.body)} row(s)` +
            (rowsOf(r.body) ? ` · SEVERE LEAK: ${summarise(r.body)}` : ""),
      );
    }

    // =================================================================================
    console.log("\n=== B. Signed-in non-admin ===\n");

    const nonAdminEmail = env.PROBE_NONADMIN_EMAIL;
    const nonAdminPassword = env.PROBE_NONADMIN_PASSWORD;

    if (!nonAdminEmail || !nonAdminPassword) {
      skip(
        "B*  signed-in non-admin probes",
        "PROBE_NONADMIN_EMAIL / PROBE_NONADMIN_PASSWORD not set in .env.local. All three " +
          "tables grant SELECT to `authenticated` and rely on an is_admin() policy to filter, " +
          "so whether that policy actually filters is UNPROVEN.",
      );
    } else {
      const session = await signIn(nonAdminEmail, nonAdminPassword);

      if (!session.token) {
        record(
          "B0  sign in as non-admin",
          false,
          `could not sign in: HTTP ${session.status} · ${summarise(session.body)}`,
        );
      } else {
        record("B0  sign in as non-admin", true, `signed in, HTTP ${session.status}`);

        // ZERO ROWS, not an error. This is the shape the header warns about: 014:177, 015:191 and
        // 017:171 each grant SELECT back to `authenticated` so the admin policy has a privilege
        // to filter, so a non-admin's read succeeds and returns nothing.
        //
        // What is being proved is therefore the POLICY, not the grant: is_admin() is false for
        // this account, so every row is filtered away. Asserting an error here would fail against
        // a correctly configured database.
        for (const table of PRIVATE_TABLES) {
          const r = await call(`/rest/v1/${table}?select=*&limit=1`, { token: session.token });

          record(
            `B1  non-admin reads zero rows from public.${table}`,
            r.status < 400 && rowsOf(r.body) === 0,
            r.status < 400
              ? `HTTP ${r.status} returned ${rowsOf(r.body)} row(s)` +
                (rowsOf(r.body)
                  ? ` · LEAK: the is_admin() policy did not filter · ${summarise(r.body)}`
                  : " · filtered by the is_admin() policy, as designed")
              : `refused outright: ${errorLine(r)} · not a leak, but not the documented shape either`,
          );
        }

        await probeRpcsForbidden({ label: "non-admin", token: session.token, prefix: "B2 " });

        // A signed-in account is not a verified address. Holding a Supabase session says nothing
        // about owning the address typed into an enrollment form, and the guard must not treat it
        // as though it does.
        if (slug) {
          const r = await rpc("create_enrollment", enrollmentArgs(slug, PROBE_EMAIL), session.token);

          record(
            "B3  being signed in does not substitute for email verification",
            r.status >= 400 && codeOf(r.body) === "EV002",
            errorLine(r),
          );
        }

        // review_enrollment is granted to `authenticated` (016:591) rather than to admins,
        // because the check lives inside the function: 016:457 raises insufficient_privilege. So
        // a non-admin reaches the function and is refused by it, which means this probes the
        // guard rather than the grant.
        //
        // The enrollment id is deliberately nonexistent, and no_data_found is treated as a FAIL:
        // reaching the lookup at 016:485 would mean the admin check at 016:457 did not fire.
        {
          const r = await rpc(
            "review_enrollment",
            { p_enrollment_id: "00000000-0000-0000-0000-000000000000", p_status: "approved" },
            session.token,
          );

          record(
            "B4  a non-admin cannot approve an enrollment, so cannot trigger its email",
            r.status >= 400 && codeOf(r.body) !== "no_data_found",
            r.status >= 400
              ? errorLine(r) +
                (codeOf(r.body) === "no_data_found"
                  ? " · WRONG GUARD: it reached the enrollment lookup, so the admin check did not fire first"
                  : " · refused before the lookup, by the admin check inside the function")
              : `ACCEPTED: HTTP ${r.status} · ${summarise(r.body)}`,
          );
        }
      }
    }

    // =================================================================================
    console.log("\n=== C. Signed-in admin ===\n");

    const adminEmail = env.PROBE_ADMIN_EMAIL;
    const adminPassword = env.PROBE_ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      skip(
        "C*  signed-in admin probes",
        "PROBE_ADMIN_EMAIL / PROBE_ADMIN_PASSWORD not set in .env.local. Whether the admin " +
          "delivery log is reachable at all is UNPROVEN, and a migration that revoked " +
          "everything from everybody would pass every probe in Sections A and B.",
      );
    } else {
      const session = await signIn(adminEmail, adminPassword);

      if (!session.token) {
        record(
          "C0  sign in as admin",
          false,
          `could not sign in: HTTP ${session.status} · ${summarise(session.body)}`,
        );
      } else {
        record("C0  sign in as admin", true, `signed in, HTTP ${session.status}`);

        // The positive case, and the reason it matters: Sections A and B prove things are
        // refused. Without this, a migration that granted nothing to anybody would score a clean
        // sweep while leaving the admin panel unable to show a delivery log or a subscriber
        // count, which is the feature Stage 2 builds on.
        for (const table of PRIVATE_TABLES) {
          const r = await call(`/rest/v1/${table}?select=*&limit=5`, { token: session.token });

          record(
            `C1  admin can read public.${table}`,
            r.status < 400,
            r.status < 400
              ? `HTTP ${r.status}, ${rowsOf(r.body)} row(s) visible through the is_admin() policy`
              : `REFUSED: ${errorLine(r)} — the admin panel cannot read this`,
          );
        }

        // C2. email_verifications IS admin-readable by design (015:188-198), because it holds
        // only digests. So the guarantee worth testing is not that the table is closed but that
        // reading it yields nothing usable: no plaintext code column anywhere, and code_hash
        // rendered as a hex string that cannot be reversed.
        {
          const r = await call("/rest/v1/email_verifications?select=*&limit=5", {
            token: session.token,
          });
          const columns = rowsOf(r.body) ? Object.keys(r.body[0]) : [];
          const plaintext = columns.filter((c) => /^code$|plain|secret/i.test(c));

          record(
            "C2  the verification table exposes a hash, never a code",
            r.status < 400 && plaintext.length === 0,
            r.status < 400
              ? rowsOf(r.body)
                ? `columns: [${columns.join(", ")}]` +
                  (columns.includes("code_hash") ? " · code_hash present" : "") +
                  (plaintext.length ? ` · LEAK: plaintext column(s) [${plaintext.join(", ")}]` : "")
                : "no rows visible to inspect; A5 created one, so this account may not be an admin"
              : `refused: ${errorLine(r)}`,
          );
        }

        // C3. An admin must not be able to write the outbox. 014:173-176 states the reason
        // directly: an admin who could UPDATE a row to 'sent' could suppress an email a student
        // is owed. SELECT is the only grant, so this is refused, or filtered to zero rows because
        // no UPDATE policy exists for it to satisfy. Both shapes are the guarantee; a 2xx
        // affecting rows is not.
        {
          const r = await call("/rest/v1/email_outbox?id=eq.00000000-0000-0000-0000-000000000000", {
            token: session.token,
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ status: "sent" }),
          });

          record(
            "C3  an admin cannot mark an outbox row sent",
            r.status >= 400 || rowsOf(r.body) === 0,
            r.status >= 400
              ? `refused: ${errorLine(r)}`
              : `HTTP ${r.status} affected ${rowsOf(r.body)} row(s)` +
                (rowsOf(r.body) ? " · LEAK: an admin can suppress a student's email" : ""),
          );
        }

        // C4. Nor delete delivery history. 014:186-188 says so in as many words: "An admin
        // deliberately cannot delete delivery history from the panel." Scoped to this run's own
        // probe address, so a database that wrongly permits the DELETE destroys nothing real.
        {
          const r = await call(
            `/rest/v1/email_outbox?to_email=eq.${encodeURIComponent(PROBE_EMAIL)}`,
            { token: session.token, method: "DELETE", headers: { Prefer: "return=representation" } },
          );

          record(
            "C4  an admin cannot delete delivery history",
            r.status >= 400 || rowsOf(r.body) === 0,
            r.status >= 400
              ? `refused: ${errorLine(r)}`
              : `HTTP ${r.status} affected ${rowsOf(r.body)} row(s)` +
                (rowsOf(r.body) ? " · LEAK: delivery history is admin-deletable" : ""),
          );
        }

        // C5. The dispatch machinery is service_role only. An admin session is a user session and
        // must not reach it: an admin who could call claim_email_batch would receive live
        // verification codes in the response body, and one who could call enqueue_email could
        // send arbitrary mail as this brand.
        await probeRpcsForbidden({ label: "admin", token: session.token, prefix: "C5 " });
      }
    }

    // =================================================================================
    console.log("\n=== D. Static source claims, no database ===\n");

    // D1. The constraint the spec states most forcefully: no provider secret may be reachable
    // from the browser. A VITE_ prefixed variable is inlined into the public bundle by Vite, so a
    // VITE_RESEND_API_KEY would ship the ability to send mail as this brand to every visitor who
    // opened devtools.
    {
      const offenders = [];
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            const text = fs.readFileSync(full, "utf8");
            const relative = path.relative(projectRoot, full);
            if (/VITE_[A-Z0-9_]*(RESEND|EMAIL|SECRET|SERVICE_ROLE|API_KEY)/.test(text)) {
              offenders.push(`${relative} (VITE_ secret)`);
            }
            if (/RESEND_API_KEY|EMAIL_DISPATCH_SECRET|SERVICE_ROLE_KEY/.test(text)) {
              offenders.push(`${relative} (names a secret directly)`);
            }
          }
        }
      };
      walk(path.join(projectRoot, "src"));

      record(
        "D1  no email secret is reachable from src/",
        offenders.length === 0,
        offenders.length === 0
          ? "no VITE_ email secret and no direct reference to a provider key anywhere in src/"
          : `SECRET EXPOSED IN THE BUNDLE: ${offenders.join(", ")}`,
      );
    }

    // D2. The Edge Function must check its caller before doing anything. Its URL is public, so
    // without this it is an open relay, and repeated calls would drain the queue on demand.
    // Checked by POSITION, not just presence: the check has to precede the database client, or an
    // unauthenticated caller has already caused work.
    {
      const source = readSource(EDGE_INDEX);

      if (!source) {
        record("D2  the Edge Function authenticates its caller", false, "index.ts not found");
      } else {
        const secretAt = source.indexOf("EMAIL_DISPATCH_SECRET");
        const clientAt = source.indexOf("createClient(", source.indexOf("Deno.serve"));
        const constantTime = /timingSafeEqual/.test(source);
        const refusesUnset = /refusing every request/.test(source);

        record(
          "D2  the Edge Function authenticates its caller before acting",
          secretAt > 0 && clientAt > secretAt && constantTime && refusesUnset,
          `secret read at offset ${secretAt}, client constructed at ${clientAt}` +
            ` · constant-time compare: ${constantTime ? "yes" : "NO"}` +
            ` · refuses when the secret is unset: ${refusesUnset ? "yes" : "NO, a missing secret would open the relay"}`,
        );
      }
    }

    // D3. 015 promises the plaintext code's window closes at delivery, and 018 is where the
    // promise is kept: the redaction sits in the SAME UPDATE that sets status='sent', so a row
    // cannot read as delivered while still carrying a live code. If that moved into the Edge
    // Function it would hold only until somebody edited the TypeScript.
    {
      const source = readSource(M018);

      if (!source) {
        record("D3  the code is redacted in SQL at delivery", false, "018 not found");
      } else {
        const body = source.slice(source.indexOf("function public.complete_email_delivery"));
        const sentAt = body.indexOf("status = 'sent'");
        const sentUpdate = sentAt < 0 ? "" : body.slice(sentAt, body.indexOf("where o.id = p_id", sentAt));
        const redacts = /payload\s*-\s*'code'/.test(sentUpdate);

        record(
          "D3  the code is redacted in the same statement that marks the row sent",
          redacts,
          redacts
            ? "the `payload - 'code'` assignment is inside the UPDATE that sets status='sent', so the two cannot come apart"
            : "NOT ATOMIC: the redaction is not in the UPDATE that marks delivery",
        );
      }
    }

    // D4. The Edge Function must never log a payload. A verification_code row carries a live
    // code, and a log line is exactly the kind of durable copy 015 exists to prevent: it would
    // outlive the ten-minute expiry inside a log retention system.
    //
    // Each console call's own argument span is examined, rather than a scan from the call to the
    // next semicolon. That distinction is not pedantic. This file is written without semicolons,
    // so the naive version ran from a console.error forward across a following comment that reads
    // "The payload is never logged" and reported a leak that does not exist. Masking comments and
    // string contents first, then matching the balanced parenthesis, examines what each call
    // actually receives.
    {
      const source = readSource(EDGE_INDEX);

      if (!source) {
        record("D4  the Edge Function never logs a payload", false, "index.ts not found");
      } else {
        const masked = maskLiterals(source);
        const calls = [...masked.matchAll(/console\.\w+\s*\(/g)];
        const offenders = [];

        for (const match of calls) {
          const openIndex = masked.indexOf("(", match.index);
          const { start, end } = argumentRange(masked, openIndex);
          const args = source.slice(start, end);

          if (/\bpayload\b/.test(args)) {
            const line = source.slice(0, match.index).split("\n").length;
            offenders.push(`line ${line}: ${args.replace(/\s+/g, " ").trim().slice(0, 80)}`);
          }
        }

        record(
          "D4  the Edge Function never logs a payload",
          offenders.length === 0,
          offenders.length === 0
            ? `${calls.length} console call(s) examined by argument span; none receives a payload. ` +
              `Failures are logged by row id and template, which is enough to find the row in ` +
              `the delivery log, where the payload is already redacted`
            : `LEAK: ${offenders.join(" · ")}`,
        );
      }
    }

    // D5. Every template the database can enqueue must have a renderer, and every renderer must
    // correspond to a template the database enqueues. A gap in the first direction fails a real
    // email at send time; in the second it is dead code implying a message this system does not
    // send.
    //
    // The template is the FIRST argument of enqueue_email, so the extraction stops at the first
    // top-level comma and reads only that span. It has to be a span rather than a literal match,
    // because 016:549 passes one through a CASE:
    //
    //   case when p_status = 'approved' then 'enrollment_approved' else 'enrollment_rejected' end,
    //
    // Both branches are real templates. A pattern expecting a quote straight after the opening
    // parenthesis sees neither, which is how the first version of this probe reported two
    // templates missing that are present and correct.
    //
    // The CASE's comparison literal is skipped. 'approved' there is a status being tested, not a
    // template, and taking it would invent a template that does not exist.
    //
    // There is no vocabulary to check against instead: 014:89-92 deliberately leaves `template`
    // as unconstrained text, since the Edge Function owns the list and a new template should be a
    // function deploy rather than a schema change. So the extraction is structural.
    {
      const templates = readSource(EDGE_TEMPLATES);
      const found = new Set();

      for (const file of [M015, M016, M017]) {
        const source = readSource(file);
        if (!source) continue;

        const masked = maskLiterals(source, { sql: true });

        for (const match of masked.matchAll(/enqueue_email\s*\(/g)) {
          const openIndex = masked.indexOf("(", match.index);
          const { start, end } = argumentRange(masked, openIndex);
          const first = firstArgument(source.slice(start, end));
          const where = file.split(/[\\/]/).pop();

          if (!/'/.test(first)) {
            found.add(`<computed in ${where}>`);
            continue;
          }

          if (!/\bcase\b/.test(first)) {
            for (const literal of first.matchAll(/'([a-z][a-z0-9_]*)'/g)) found.add(literal[1]);
            continue;
          }

          for (const branch of first.matchAll(/\b(?:then|else)\s*'([a-z][a-z0-9_]*)'/g)) {
            found.add(branch[1]);
          }
        }
      }

      const computed = [...found].filter((t) => t.startsWith("<computed"));
      const enqueued = new Set([...found].filter((t) => !t.startsWith("<computed")));
      const rendered = new Set();
      if (templates) {
        for (const match of templates.matchAll(/^\s*case '([a-z_]+)':/gm)) rendered.add(match[1]);
      }

      const missing = [...enqueued].filter((t) => !rendered.has(t));
      const extra = [...rendered].filter((t) => !enqueued.has(t));
      const matched = enqueued.size > 0 && !missing.length && !extra.length && !computed.length;

      record(
        "D5  every enqueued template has a renderer, and every renderer is enqueued",
        matched,
        `${enqueued.size} enqueued by 015/016/017 (${[...enqueued].sort().join(", ")}), ` +
          `${rendered.size} rendered by templates.ts` +
          (missing.length ? ` · WOULD FAIL AT SEND: [${missing.join(", ")}]` : "") +
          (extra.length ? ` · rendered but never enqueued: [${extra.join(", ")}]` : "") +
          (computed.length ? ` · NOT DETERMINABLE STATICALLY: [${computed.join(", ")}]` : "") +
          (matched ? " · exact match in both directions" : ""),
      );
    }

    // D6. Each new table must enable RLS and revoke both roles BY NAME in the migration that
    // creates it. Section A proves the CURRENT state; this proves the migration would reproduce
    // it on a fresh database, which is what a future deploy depends on.
    {
      const sources = { email_outbox: M014, email_verifications: M015, session_reminders: M017 };
      const problems = [];

      for (const [table, file] of Object.entries(sources)) {
        const text = readSource(file);
        if (!text) {
          problems.push(`${table}: migration unreadable`);
          continue;
        }
        if (!new RegExp(`alter table public\\.${table}\\s+enable row level security`, "i").test(text)) {
          problems.push(`${table}: RLS not enabled`);
        }
        // By name, because `revoke ... from public` does not strip Supabase's ALTER DEFAULT
        // PRIVILEGES grants to anon and authenticated. Each role has to be named explicitly.
        if (!new RegExp(`revoke all on public\\.${table} from anon`, "i").test(text)) {
          problems.push(`${table}: anon not revoked by name`);
        }
        if (!new RegExp(`revoke all on public\\.${table} from authenticated`, "i").test(text)) {
          problems.push(`${table}: authenticated not revoked by name`);
        }
        if (!/using \(public\.is_admin\(\)\)/.test(text)) {
          problems.push(`${table}: no is_admin() policy, so the admin panel cannot read it`);
        }
      }

      record(
        "D6  each new table enables RLS, revokes both roles by name, and gates admin reads",
        problems.length === 0,
        problems.length === 0
          ? "all three tables: RLS on, anon and authenticated revoked by name, admin SELECT via is_admin(), following 002:185-188"
          : `INCOMPLETE: ${problems.join(" · ")}`,
      );
    }

    // D7. .env.example documents the Edge secrets with placeholders only, and says they are never
    // VITE_. The spec asks for this directly.
    {
      const source = readSource(ENV_EXAMPLE);
      const names = ["RESEND_API_KEY", "EMAIL_DISPATCH_SECRET", "EMAIL_FROM", "PUBLIC_SITE_URL"];
      const documented = source ? names.filter((n) => source.includes(n)) : [];
      // A real Resend key is re_ followed by a long token. A placeholder is not.
      const realKey = source ? /re_[A-Za-z0-9]{16,}/.test(source) : false;
      const warnsAboutVite = source ? /VITE_RESEND_API_KEY/.test(source) : false;

      record(
        "D7  .env.example documents the Edge secrets as placeholders only",
        documented.length === names.length && !realKey && warnsAboutVite,
        `documented ${documented.length}/${names.length}` +
          (documented.length === names.length
            ? ""
            : ` · missing [${names.filter((n) => !documented.includes(n)).join(", ")}]`) +
          ` · contains a real key: ${realKey ? "YES, REMOVE IT" : "no"}` +
          ` · explains why never VITE_: ${warnsAboutVite ? "yes" : "NO"}`,
      );
    }

    // D8. Historical migrations are untouched. The spec forbids editing them, so this asserts 001
    // to 012 are all still present and that no Phase 7 migration drops an object an earlier one
    // created. `create or replace function` is how 016 legitimately replaces create_enrollment;
    // a DROP would be the thing that loses its grants.
    {
      const files = fs.readdirSync(MIGRATIONS);
      const historical = files.filter((f) => /^0(0[1-9]|1[0-2])_.*\.sql$/.test(f)).sort();
      const phase7 = files.filter((f) => /^01[3-8]_.*\.sql$/.test(f)).sort();

      const destructive = phase7.filter((f) =>
        /drop (table|type|column)\s+(if exists\s+)?public\.|drop function public\.(create_enrollment|review_enrollment|get_)/i.test(
          readSource(path.join(MIGRATIONS, f)) ?? "",
        ),
      );

      record(
        "D8  Phase 7 added migrations rather than editing history",
        historical.length === 12 && phase7.length === 6 && destructive.length === 0,
        `001-012 present: ${historical.length}/12 · Phase 7: ${phase7.length} (${phase7.map((f) => f.slice(0, 3)).join(", ")})` +
          (destructive.length ? ` · DROPS AN EXISTING OBJECT: ${destructive.join(", ")}` : ""),
      );
    }

    // D9. Every function a Phase 7 migration creates must carry an explicit access decision, and
    // that decision must be refusal for anyone who is not the server.
    //
    // This is the static counterpart to the HTTPS probes in section A, and it exists because of a
    // defect found by hand while building 017: reschedule_session_reminders() was created and
    // left with no revoke at all. A new function in this schema is EXECUTE-able by anon and
    // authenticated through Supabase's ALTER DEFAULT PRIVILEGES, so "no decision" means
    // "everyone", and section A could not have caught it. The function RETURNS trigger, so no
    // HTTP request can reach it, and no probe of A's kind would ever have looked. A static read
    // of the migration text is the only view that sees it, which is the whole argument for
    // keeping this check here rather than in section A.
    //
    // The assertion is "no function is left undecided", not "every function is revoked". Some
    // are meant to be callable: create_enrollment and subscribe_session_reminder are the public
    // entry points, and their grants are real decisions. Flagging those as failures would make
    // this probe a nuisance that gets disabled. A grant to anon is therefore accepted, but only
    // when it is STATED, so the reviewer sees it.
    //
    // ACLs are matched against the whole 013-018 corpus rather than a window after the
    // definition, because the migrations do not keep the two together. 015 declares its three
    // functions across lines 215-434 and writes all three revokes at 463-470, in a trailing
    // block; a window that stops at the next `create function` sees none of them and reports
    // three secure functions as undecided. Matching a statement that names the function
    // explicitly is precise enough on its own, and the statements being matched are ACLs rather
    // than calls, so an unrelated `enqueue_email(` inside a body cannot satisfy the pattern.
    {
      const files = fs
        .readdirSync(MIGRATIONS)
        .filter((f) => /^01[3-8]_.*\.sql$/.test(f))
        .sort();

      const corpus = files
        .map((f) => maskLiterals(readSource(path.join(MIGRATIONS, f)) ?? "", { sql: true }))
        .join("\n");

      const undecided = [];
      const deliberatelyCallable = [];
      const seen = new Set();
      let created = 0;

      for (const file of files) {
        const masked = maskLiterals(readSource(path.join(MIGRATIONS, file)) ?? "", { sql: true });

        for (const match of masked.matchAll(
          /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z_][a-z0-9_]*)\s*\(/g,
        )) {
          const fn = match[1];
          if (seen.has(fn)) continue;
          seen.add(fn);
          created += 1;

          const revokes = new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${fn}\\s*\\(`, "i");
          const grants = new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\(`, "i");
          const toAnon = new RegExp(
            `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^;]*?to\\s+[^;]*\\banon\\b`,
            "i",
          );
          const toAuthed = new RegExp(
            `grant\\s+execute\\s+on\\s+function\\s+public\\.${fn}\\s*\\([^;]*?to\\s+[^;]*\\bauthenticated\\b`,
            "i",
          );

          if (!revokes.test(corpus) && !grants.test(corpus)) {
            undecided.push(`${file.slice(0, 3)}:${fn}`);
            continue;
          }

          // A revoked-then-re-granted function is a deliberate public entry point. Anything else
          // that grants EXECUTE is one too, and either way it must be intentional, so it is only
          // reported, never failed, as long as the decision is written down.
          if (toAnon.test(corpus) || toAuthed.test(corpus)) {
            deliberatelyCallable.push(`${file.slice(0, 3)}:${fn}`);
          }
        }
      }

      record(
        "D9  every Phase 7 function carries an explicit, refusal-first access decision",
        created > 0 && undecided.length === 0,
        `${created} function(s) created across 013-018 · ` +
          (undecided.length
            ? `NO ACL DECISION, so the default grants leave them open to anon: ${undecided.join(", ")}`
            : `all revoke anon and authenticated, or state a grant deliberately`) +
          (deliberatelyCallable.length
            ? ` · deliberately callable by a browser identity: ${deliberatelyCallable.join(", ")}`
            : ""),
      );
    }

    // =================================================================================
    console.log("\n=== E. Role-scoped reads, checked in SQL ===\n");

    // What Sections B and C would prove over HTTPS if this machine had an admin and a non-admin
    // password to sign in with. It does not, and inventing accounts on a live project to satisfy a
    // test is not a trade worth making, so the question is asked a different way.
    //
    // `set role authenticated` plus a forged `request.jwt.claims` runs the query as the real
    // `authenticated` role under the real policies. The grants and the is_admin() filter are the
    // same ones an HTTP request would meet, which makes this genuine evidence for the thing that
    // matters most here: that 015, 016 and 017 grant SELECT to `authenticated` and rely on a
    // policy to filter it, and that the policy does filter.
    //
    // It is still weaker than B and C, in one specific and worth-stating way: nothing below proves
    // PostgREST passes the session's JWT through to `auth.uid()`. A wiring mistake there would go
    // unnoticed here and would be caught by B and C. Section E is a substitute for a credential
    // this machine does not have, not an equivalent to one.
    //
    // The baseline read is what makes the rest mean anything. A table with no rows returns zero
    // for everybody, so "the non-admin saw nothing" would be true and useless. Comparing against
    // the superuser's own count is what turns an absence into evidence.
    {
      const baseline = runSql(`
        select
          (select count(*) from public.email_outbox)::int as outbox,
          (select count(*) from public.email_verifications)::int as verifications,
          (select count(*) from public.session_reminders)::int as reminders,
          (select count(*) from public.admins)::int as admins
      `);

      if (!baseline.ok) {
        skip(
          "E*  role-scoped reads in SQL",
          `the Supabase CLI could not be run (${baseline.why}). These checks need a linked ` +
            `project, and Section E is opt-in for that reason. Whether the admin policies ` +
            `actually filter remains UNPROVEN from this machine.`,
        );
      } else {
        const base = baseline.rows[0] ?? {};

        // The baseline aliases its columns, so the real table name is mapped to the alias it came
        // back under. Reading base["email_outbox"] finds nothing and would make every table look
        // empty, which is how the first version of this section skipped itself.
        const TABLES = { email_outbox: "outbox", email_verifications: "verifications", session_reminders: "reminders" };
        const countOf = (t) => Number(base[TABLES[t]] ?? 0);

        // Only a table with rows can distinguish a filtering policy from an empty one.
        const populated = Object.keys(TABLES).filter((t) => countOf(t) > 0);
        const empty = Object.keys(TABLES).filter((t) => !populated.includes(t));

        const countsSql = (t) => `select (select count(*) from public.${t})::int as n`;

        const readAs = (role, body) => {
          const sql = role === "admin" ? asAdminSql(body) : asNonAdminSql(body);
          const r = runSql(sql);
          return { ok: r.ok, n: r.ok ? Number(r.rows[0]?.n ?? -1) : -1, why: r.why };
        };

        if (!base.admins) {
          record(
            "E1  a role-scoped read can be performed",
            false,
            "no row in public.admins, so there is no admin identity to impersonate",
          );
        } else if (populated.length === 0) {
          skip(
            "E1  the admin policy filters rows from a non-admin",
            `all three tables are empty (outbox ${base.outbox}, verifications ` +
              `${base.verifications}, reminders ${base.reminders}), so a non-admin reading zero ` +
              `rows would prove nothing about the policy. The filters remain UNPROVEN.`,
          );
        } else {
          // E1. The claim that matters: a signed-in non-admin is granted SELECT (015:191, 017:171)
          // and sees only what is_admin() allows, which for these three tables is nothing.
          const nonAdminReads = populated.map((t) => ({ table: t, ...readAs("non-admin", countsSql(t)) }));
          const leaked = nonAdminReads.filter((r) => r.ok && r.n !== 0);

          record(
            "E1  a signed-in non-admin sees 0 rows in every private table that has rows",
            nonAdminReads.every((r) => r.ok) && leaked.length === 0,
            nonAdminReads.some((r) => !r.ok)
              ? `could not read as a non-admin: ${nonAdminReads.find((r) => !r.ok)?.why}`
              : nonAdminReads
                  .map((r) => `${r.table} ${r.n} of ${countOf(r.table)}`)
                  .join(" · ") +
                (empty.length ? ` · untestable because empty: ${empty.join(", ")}` : "") +
                (leaked.length ? " · LEAK" : ""),
          );

          // E2. And the other direction, which is what makes E1 an absence rather than a wall. If
          // the admin also saw zero, a revoked grant would look identical to a filtering policy.
          const adminReads = populated.map((t) => ({ table: t, ...readAs("admin", countsSql(t)) }));
          const short = adminReads.filter((r) => r.ok && r.n !== countOf(r.table));

          record(
            "E2  the admin sees every row, so E1 is a filter and not a wall",
            adminReads.every((r) => r.ok) && short.length === 0,
            adminReads.some((r) => !r.ok)
              ? `could not read as the admin: ${adminReads.find((r) => !r.ok)?.why}`
              : adminReads.map((r) => `${r.table} ${r.n} of ${countOf(r.table)}`).join(" · "),
          );

          // E3. 014:173-176 says an admin cannot mark a row sent, because that would record a
          // delivery that never happened, and cannot delete a row, because the delivery log is
          // the record of what was sent to whom. A grant is the cleanest way to ask, and unlike a
          // DELETE attempt it leaves nothing behind in a table this suite cannot clean up.
          const acl = runSql(asAdminSql(`
            select
              public.is_admin()::text as is_admin,
              has_table_privilege('authenticated', 'public.email_outbox', 'select')::text as may_select,
              has_table_privilege('authenticated', 'public.email_outbox', 'update')::text as may_update,
              has_table_privilege('authenticated', 'public.email_outbox', 'delete')::text as may_delete
          `));

          if (!acl.ok) {
            record("E3  an admin may read the log but not rewrite or erase it", false, acl.why);
          } else {
            const row = acl.rows[0] ?? {};
            const good = row.is_admin === "true" && row.may_select === "true" &&
              row.may_update === "false" && row.may_delete === "false";

            record(
              "E3  an admin may read the log but not rewrite or erase it",
              good,
              `as admin: is_admin ${row.is_admin}, select ${row.may_select}, update ` +
                `${row.may_update}, delete ${row.may_delete}` +
                (good ? " (014:173-176 expects exactly this)" : " · UNEXPECTED"),
            );
          }
        }
      }
    }
  } finally {
    // =================================================================================
    console.log("\n=== Cleanup ===\n");

    const created = [];
    if (createdVerification) created.push("email_verifications", "email_outbox");
    if (createdReminder) created.push("session_reminders");

    if (created.length === 0) {
      record("Z1  nothing to clean up", true, "no probe rows were created");
    } else {
      // Attempted over the anon key, which cannot delete these rows. That is by design and
      // Section A just proved it, so this reports the inability rather than claiming a clean exit
      // it did not achieve.
      const attempt = await call(
        `/rest/v1/session_reminders?email=eq.${encodeURIComponent(PROBE_EMAIL)}`,
        { method: "DELETE", headers: { Prefer: "return=representation" } },
      );

      record(
        "Z1  probe rows cannot be removed with the anon key, as designed",
        attempt.status >= 400 || rowsOf(attempt.body) === 0,
        `anon DELETE: HTTP ${attempt.status}. This suite cannot clean up after itself, which is ` +
          `the same guarantee A10 asserts. Rows created in: ${[...new Set(created)].join(", ")}.\n` +
          `      Remove them with supabase db query --linked:\n` +
          `        delete from public.email_outbox        where to_email = '${PROBE_EMAIL}';\n` +
          `        delete from public.email_verifications where email    = '${PROBE_EMAIL}';\n` +
          `        delete from public.session_reminders   where email    = '${PROBE_EMAIL}';`,
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
      console.log("\nSKIPPED, therefore NOT PROVEN:");
      for (const entry of skipped) console.log(`  - ${entry.name}`);
      console.log(
        "\nTo run the skipped sections, add the same probe accounts the Phase 4, 5a, 5b and 6\n" +
          "suites use to .env.local:\n" +
          "\n" +
          "  PROBE_ADMIN_EMAIL=      PROBE_ADMIN_PASSWORD=\n" +
          "  PROBE_NONADMIN_EMAIL=   PROBE_NONADMIN_PASSWORD=\n",
      );
    }

    console.log(
      "\nThis suite created no enrollment and wrote no catalogue, payment or website-settings\n" +
        `row. It wrote only through the two RPCs anon is meant to reach, as ${PROBE_EMAIL}.`,
    );

    process.exitCode = failed.length > 0 ? 1 : 0;
  }
};

main().catch((error) => {
  console.error("Probe run failed:", error);
  process.exitCode = 2;
});
