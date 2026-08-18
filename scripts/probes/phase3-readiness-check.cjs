/**
 * Phase 3.1 production-readiness check — ANON key only.
 *
 * Separate from the security probes: those prove the boundary holds against an
 * attacker, this proves the deployment is fit to show a real student. It creates
 * nothing, so it is safe to run repeatedly and safe to run last.
 *
 * WHAT THIS CANNOT SEE, AND WHY
 *   Probe residue lives in tables anon cannot read (public.enrollments) and in a
 *   private bucket anon cannot list — which is exactly the security property the
 *   probe suite verifies. So "no probe enrollments remain" and "no probe receipt
 *   objects remain" are NOT checkable from here; they need the SQL Editor. This
 *   script prints the two queries to run and reports those checks as MANUAL rather
 *   than silently passing them.
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
const record = (name, state, detail) => {
  results.push({ name, state, detail });
  console.log(`${state}  ${name}`);
  console.log(`      ${detail}`);
};

const rest = async (pathname, init = {}) => {
  const response = await fetch(`${URL_BASE}${pathname}`, {
    ...init,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
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

const main = async () => {
  console.log("=== Phase 3.1 production-readiness check (anon key) ===\n");

  // ---------------------------------------------------------------------------
  // 1 & 2 — probe residue. Not visible to anon by design; see the header note.
  // ---------------------------------------------------------------------------
  record(
    "1+2. no probe enrollments / receipt objects remain",
    "MANUAL",
    "Probe residue cannot be seen with the anon key (that is the point of probes 1 and 2a).\n" +
      "      Run these two in the SQL Editor and expect 0 from each:\n" +
      "        select count(*) from public.enrollments where student_email like 'probe%@example.com';\n" +
      "        select count(*) from storage.objects o where o.bucket_id = 'receipts'\n" +
      "          and not exists (select 1 from public.enrollments e where e.receipt_path = o.name);\n" +
      "      Remove any receipt objects via the Storage API, not SQL — see\n" +
      "      supabase/maintenance/cleanup_orphan_receipts.sql.",
  );

  // ---------------------------------------------------------------------------
  // 3 — sample payment details must be unmistakably development-only.
  // ---------------------------------------------------------------------------
  {
    const r = await rest(
      "/rest/v1/payment_settings?select=bank_name,account_name,account_number,additional_details,is_active",
    );
    const row = Array.isArray(r.body) ? r.body[0] : null;

    if (!row) {
      record(
        "3. sample payment details are development-only",
        "FAIL",
        `No active payment_settings row. HTTP ${r.status} — the payment step cannot render.`,
      );
    } else {
      // Marked as sample AND non-routable. Either alone is not enough: a real-looking
      // account number with a "[Sample]" label is still something a student might pay into.
      const labelled =
        /\[sample\]|sample|test|development/i.test(`${row.bank_name} ${row.account_name}`);
      const nonRoutable = /^0+$/.test(String(row.account_number ?? "").replace(/\D/g, ""));
      const warned = /does not exist|cannot receive payment|sample/i.test(row.additional_details ?? "");

      const isSample = labelled && nonRoutable;
      record(
        "3. sample payment details are development-only",
        isSample ? "PASS" : "FAIL",
        isSample
          ? `Development-only and non-routable: "${row.bank_name}" / account ${row.account_number}` +
            `${warned ? " · warning text present" : " · WARNING TEXT MISSING"}\n` +
            "      NOTE: this must be replaced with real details before taking a real payment."
          : `LIVE-LOOKING DETAILS: "${row.bank_name}" / "${row.account_name}" / account ${row.account_number}. ` +
            "If these are real, this check is informational; if they are not, no student can pay.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 4 — the confirmation RPC must not expose PII beyond the student's own record,
  //     and must not expose internal columns at all.
  // ---------------------------------------------------------------------------
  {
    // A token that matches nothing must yield nothing — no row, no error detail that
    // distinguishes "no such enrollment" from "not yours".
    const miss = await rest("/rest/v1/rpc/get_enrollment_by_token", {
      method: "POST",
      body: JSON.stringify({ p_access_token: "f".repeat(64) }),
    });
    const rows = Array.isArray(miss.body) ? miss.body.length : miss.body ? 1 : 0;

    // And the enrollments table itself must stay unreadable.
    const table = await rest("/rest/v1/enrollments?select=student_email&limit=1");
    const tableLeak = Array.isArray(table.body) && table.body.length > 0;

    const pass = rows === 0 && !tableLeak;
    record(
      "4. confirmation RPC leaks no PII",
      pass ? "PASS" : "FAIL",
      `unknown token → ${rows} row(s) · direct enrollments SELECT → HTTP ${table.status}` +
        `${tableLeak ? " LEAKED PII" : " no rows"}`,
    );
  }

  // ---------------------------------------------------------------------------
  // 5 — no admin surface is reachable with the anon key.
  //
  // Asserts on the HTTP status, not just on row count. A table that returns 200 with
  // [] is filtered by RLS but still *granted* to anon; an empty table would make a
  // row-count-only check pass while proving nothing about a populated one. 401 means
  // the privilege itself is absent, which is the standard every Phase 3 table meets.
  // ---------------------------------------------------------------------------
  {
    const checks = [];
    for (const table of ["admins", "admin_settings", "enrollment_status_history"]) {
      const r = await rest(`/rest/v1/${table}?select=*&limit=1`);
      const leaked = Array.isArray(r.body) && r.body.length > 0;
      const granted = r.status === 200;
      checks.push({ table, leaked, granted, status: r.status });
    }
    const anyLeak = checks.some((c) => c.leaked);
    const anyGrant = checks.some((c) => c.granted);
    const pass = !anyLeak && !anyGrant;
    record(
      "5. admin surfaces unreachable by anon",
      pass ? "PASS" : anyLeak ? "FAIL" : "WARN",
      checks
        .map(
          (c) =>
            `${c.table}: HTTP ${c.status}` +
            (c.leaked ? " LEAKED ROWS" : c.granted ? " ← readable (RLS-filtered, grant still present)" : ""),
        )
        .join(" | "),
    );
  }

  // ---------------------------------------------------------------------------
  // 6 — catalogue exposes published courses only.
  // ---------------------------------------------------------------------------
  {
    const r = await rest("/rest/v1/courses?select=slug,published");
    const rowsArr = Array.isArray(r.body) ? r.body : [];
    const unpublished = rowsArr.filter((row) => row.published === false);
    const pass = rowsArr.length > 0 && unpublished.length === 0;
    record(
      "6. catalogue exposes published courses only",
      pass ? "PASS" : "FAIL",
      `${rowsArr.length} course(s) visible to anon · ${unpublished.length} unpublished leaked`,
    );
  }

  console.log("\n=== Summary ===");
  const failed = results.filter((entry) => entry.state === "FAIL");
  const warned = results.filter((entry) => entry.state === "WARN");
  const manual = results.filter((entry) => entry.state === "MANUAL");
  const passed = results.length - failed.length - warned.length - manual.length;
  console.log(
    `${passed} passed, ${warned.length} warning(s), ${failed.length} failed, ` +
      `${manual.length} require the SQL Editor.`,
  );
  if (warned.length > 0) {
    console.log("\nWARNINGS (no data exposed, but weaker than the rest of the schema):");
    for (const entry of warned) console.log(`  - ${entry.name}: ${entry.detail}`);
  }
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail}`);
  }
  process.exit(failed.length > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error("Readiness check failed:", error);
  process.exit(2);
});
