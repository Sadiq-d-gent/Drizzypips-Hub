/**
 * Phase 3 security probes — run against the dev Supabase project with the ANON key only.
 *
 * Reads .env.local itself so no credential is ever passed on a command line or printed.
 * Every probe states what it expects and why, and reports PASS/FAIL against that.
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
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
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
  let body;
  const text = await response.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
};

const rpc = (fn, args) =>
  rest(`/rest/v1/rpc/${fn}`, { method: "POST", body: JSON.stringify(args) });

const summarise = (body) => {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
};

// Pulls the human-readable reason out of a Storage API error body. Used to assert
// that a rejection happened for the rule under test rather than for some unrelated
// reason that also yields a 4xx.
const reasonOf = (text) => {
  try {
    const parsed = JSON.parse(text);
    return parsed.message || parsed.error || text.slice(0, 120);
  } catch {
    return String(text).slice(0, 120);
  }
};

const main = async () => {
  console.log("=== Phase 3 security probes (anon key) ===\n");

  // ---------------------------------------------------------------------------
  // Pre-flight: are the Phase 3 objects actually present?
  // ---------------------------------------------------------------------------
  const preflight = await rpc("get_enrollment_by_token", { p_access_token: "x" });
  if (preflight.status === 404) {
    console.error(
      "\nMIGRATIONS NOT APPLIED: get_enrollment_by_token() does not exist.\n" +
        "Apply 002–005 in the Supabase SQL Editor first, then re-run.",
    );
    process.exit(3);
  }

  // ---------------------------------------------------------------------------
  // PROBE 1 — anon SELECT on public.enrollments must be refused.
  // anon has no policy and no grant, so this must not return rows.
  // ---------------------------------------------------------------------------
  {
    const r = await rest("/rest/v1/enrollments?select=*&limit=5");
    const leaked = Array.isArray(r.body) && r.body.length > 0;
    record(
      "1. anon SELECT on public.enrollments",
      !leaked,
      `HTTP ${r.status} · ${leaked ? "LEAKED ROWS" : "no rows returned"} · ${summarise(r.body)}`,
    );
  }

  // Same check for the audit trail and the admin-only settings table.
  {
    const r = await rest("/rest/v1/enrollment_status_history?select=*&limit=5");
    const leaked = Array.isArray(r.body) && r.body.length > 0;
    record(
      "1b. anon SELECT on enrollment_status_history",
      !leaked,
      `HTTP ${r.status} · ${leaked ? "LEAKED ROWS" : "no rows returned"} · ${summarise(r.body)}`,
    );
  }
  {
    const r = await rest("/rest/v1/admin_settings?select=*&limit=5");
    const leaked = Array.isArray(r.body) && r.body.length > 0;
    record(
      "1c. anon SELECT on admin_settings",
      !leaked,
      `HTTP ${r.status} · ${leaked ? "LEAKED ROWS" : "no rows returned"} · ${summarise(r.body)}`,
    );
  }
  // Positive control: the public payment settings row MUST be readable, otherwise
  // the payment step cannot render. A probe suite that only proves "everything is
  // blocked" would also pass against a completely broken database.
  {
    const r = await rest("/rest/v1/payment_settings?select=bank_name,is_active");
    const ok = Array.isArray(r.body) && r.body.length === 1 && r.body[0].is_active === true;
    record(
      "1d. anon SELECT on payment_settings (positive control — must succeed)",
      ok,
      `HTTP ${r.status} · ${Array.isArray(r.body) ? r.body.length : "?"} row(s)`,
    );
  }

  // ---------------------------------------------------------------------------
  // PROBE 2 — anon must not LIST or READ objects in the private receipts bucket.
  //
  // An empty bucket would make both checks pass vacuously, so a real object is
  // uploaded first using the same signed-upload path the app uses. That doubles as
  // an end-to-end check that anon's INSERT-only grant is sufficient to upload.
  // ---------------------------------------------------------------------------
  let uploadedKey = null;
  {
    // A fresh object key each run. anon holds INSERT and nothing else, so it cannot
    // overwrite or delete an existing object — a fixed key would collide with the
    // previous run and fail with 409 KeyAlreadyExists. The folder segment keeps the
    // stable probe prefix so the teardown can still find every object this suite
    // uploaded; only the object name varies.
    const draftId = "11111111-2222-4333-8444-555555555555";
    const objectId = crypto.randomUUID();
    const key = `${draftId}/${objectId}.png`;

    const signed = await fetch(`${URL_BASE}/storage/v1/object/upload/sign/receipts/${key}`, {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const signedBody = await signed.json().catch(() => null);

    if (signed.status === 200 && signedBody?.token) {
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      const put = await fetch(
        `${URL_BASE}/storage/v1/object/upload/sign/receipts/${key}?token=${encodeURIComponent(signedBody.token)}`,
        { method: "PUT", headers: { "Content-Type": "image/png" }, body: png },
      );
      if (put.status === 200) uploadedKey = key;
      record(
        "2. signed upload with anon INSERT only (precondition for 2a/2b)",
        put.status === 200,
        `sign HTTP ${signed.status} · PUT HTTP ${put.status} · key=${uploadedKey ?? "none"}`,
      );
    } else {
      record(
        "2. signed upload with anon INSERT only (precondition for 2a/2b)",
        false,
        `sign HTTP ${signed.status} · ${summarise(signedBody)}`,
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
      "2a. anon LIST on storage bucket 'receipts'",
      !leaked && Boolean(uploadedKey),
      `HTTP ${response.status} · ${leaked ? `LEAKED ${parsed.length} OBJECT(S)` : "no objects listed"}` +
        (uploadedKey ? " · bucket is known non-empty, so this is not a vacuous pass" : " · INCONCLUSIVE: nothing was uploaded"),
    );
  }
  {
    // The exact key just written. anon has no SELECT grant, so even a key it created
    // and knows the value of must not be readable back.
    const key = uploadedKey ?? "00000000-0000-0000-0000-000000000000/00000000-0000-0000-0000-000000000000.jpg";
    const response = await fetch(`${URL_BASE}/storage/v1/object/receipts/${key}`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
    });
    const text = await response.text();
    const ok = response.status !== 200;
    record(
      "2b. anon READ of a receipts object",
      ok,
      `HTTP ${response.status} · key ${uploadedKey ? "EXISTS (real object)" : "guessed"} · ${summarise(text)}`,
    );
  }
  {
    // Public-URL route: proves the bucket is genuinely private, not just policy-gated.
    const key = uploadedKey ?? "00000000-0000-0000-0000-000000000000/x.jpg";
    const response = await fetch(`${URL_BASE}/storage/v1/object/public/receipts/${key}`);
    const text = await response.text();
    const ok = response.status !== 200;
    record(
      "2c. unauthenticated public-URL read of receipts",
      ok,
      `HTTP ${response.status} · ${summarise(text)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // PROBE 3 — enrolling on an unpublished course must be refused, with the same
  // error as a nonexistent course (no draft-course oracle).
  // ---------------------------------------------------------------------------
  const baseArgs = {
    p_student_name: "Probe Student",
    p_student_email: `probe+${Date.now()}@example.com`,
    p_student_phone: "+2348000000000",
    p_student_note: null,
    p_receipt_path: null,
    p_receipt_filename: null,
    p_receipt_size_bytes: null,
    p_receipt_mime_type: null,
  };

  let unpublishedSlug = null;
  {
    // Find a slug that exists in the database but is unpublished. anon cannot see
    // unpublished rows, so the control slug is supplied out of band: the seed data's
    // draft course. The check that it is absent from the published list both locates
    // it and confirms the seed's draft row was never published. Guessing slugs like
    // "draft-course" would only compare two nonexistent courses, which proves nothing.
    const published = await rest("/rest/v1/courses?select=slug");
    const publishedSlugs = new Set(
      (Array.isArray(published.body) ? published.body : []).map((row) => row.slug),
    );
    const draftSlug = "sample-algorithmic-strategies-draft";
    if (!publishedSlugs.has(draftSlug)) {
      unpublishedSlug = draftSlug;
    } else {
      record(
        "3. create_enrollment on an unpublished/unknown course",
        false,
        `INCONCLUSIVE: the seeded draft course ${draftSlug} is published, so no unpublished control row exists to test`,
      );
    }
  }

  if (unpublishedSlug) {
    const r = await rpc("create_enrollment", { ...baseArgs, p_course_slug: unpublishedSlug });
    const missing = await rpc("create_enrollment", {
      ...baseArgs,
      p_course_slug: "definitely-not-a-real-course-xyz",
    });

    const refused = r.status >= 400;
    const sameShape =
      r.status === missing.status &&
      JSON.stringify(r.body?.message) === JSON.stringify(missing.body?.message);

    record(
      "3. create_enrollment on an unpublished/unknown course",
      refused && sameShape,
      `HTTP ${r.status} · refused=${refused} · indistinguishable from unknown course=${sameShape} · ${summarise(r.body)}`,
    );
  }

  // ---------------------------------------------------------------------------
  // PROBE 4 — tampered price. The RPC has no price parameter at all; sending one
  // must be rejected outright rather than silently honoured.
  // ---------------------------------------------------------------------------
  let realSlug = null;
  let realPrice = null;
  {
    // Deliberately the most expensive published course, not simply the first one.
    // The catalogue contains a free course, and a snapshot probe that compares 0 to 0
    // would pass even if the price were never copied at all.
    const courses = await rest("/rest/v1/courses?select=slug,price,currency&order=price.desc&limit=1");
    if (Array.isArray(courses.body) && courses.body.length > 0) {
      realSlug = courses.body[0].slug;
      realPrice = Number(courses.body[0].price);
    }

    if (!realSlug) {
      record("4. tampered price", false, "No published course available to probe against.");
    } else {
      const r = await rpc("create_enrollment", {
        ...baseArgs,
        p_student_email: `probe-price+${Date.now()}@example.com`,
        p_course_slug: realSlug,
        p_price_amount: 0.01,
        price_amount: 0.01,
      });
      // PostgREST rejects unknown named arguments — the function signature simply has
      // no price parameter, so there is nothing to tamper with.
      const rejected = r.status >= 400;
      record(
        "4. tampered price (extra price args sent to create_enrollment)",
        rejected,
        `HTTP ${r.status} · signature has no price parameter · ${summarise(r.body)}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // PROBE 4b — the price that actually gets stored comes from the courses table.
  // Creates one real enrollment and checks the snapshot matches the course row.
  // ---------------------------------------------------------------------------
  let createdToken = null;
  let createdOrderId = null;
  {
    if (!realSlug) {
      record("4b. stored price is the authoritative one", false, "No published course.");
    } else {
      const r = await rpc("create_enrollment", {
        ...baseArgs,
        p_student_email: `probe-snapshot+${Date.now()}@example.com`,
        p_course_slug: realSlug,
      });
      const row = Array.isArray(r.body) ? r.body[0] : r.body;
      createdToken = row?.access_token ?? null;
      createdOrderId = row?.order_id ?? null;

      if (!createdToken) {
        record("4b. stored price is the authoritative one", false, `HTTP ${r.status} · ${summarise(r.body)}`);
      } else {
        const readBack = await rpc("get_enrollment_by_token", { p_access_token: createdToken });
        const enrollment = Array.isArray(readBack.body) ? readBack.body[0] : readBack.body;
        const stored = Number(enrollment?.price_amount);
        const matches = stored === realPrice;
        record(
          "4b. stored price equals the course table price",
          matches && realPrice > 0,
          `course=${realPrice} stored=${stored}${realPrice > 0 ? "" : " · INCONCLUSIVE: probed a zero-priced course"} · order_id=${createdOrderId}`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // PROBE 5 — an invalid / altered token must return nothing.
  // ---------------------------------------------------------------------------
  {
    const cases = [
      ["empty", ""],
      ["short", "abc123"],
      ["64 chars, wrong value", "0".repeat(64)],
      ["sql-ish", "' or 1=1 --"],
    ];
    if (createdToken) {
      // Flip one character of a real token: same length, same shape, one bit wrong.
      const flipped =
        (createdToken[0] === "a" ? "b" : "a") + createdToken.slice(1);
      cases.push(["real token with one character changed", flipped]);
    }

    let allEmpty = true;
    const details = [];
    for (const [label, token] of cases) {
      const r = await rpc("get_enrollment_by_token", { p_access_token: token });
      const rows = Array.isArray(r.body) ? r.body.length : r.body ? 1 : 0;
      if (rows > 0) allEmpty = false;
      details.push(`${label}: HTTP ${r.status}, ${rows} row(s)`);
    }
    record("5. invalid / altered access tokens", allEmpty, details.join(" | "));
  }

  // Positive control: the real token MUST work, and MUST NOT expose admin columns.
  {
    if (!createdToken) {
      record("5b. valid token returns the record", false, "No token was issued.");
    } else {
      const r = await rpc("get_enrollment_by_token", { p_access_token: createdToken });
      const row = Array.isArray(r.body) ? r.body[0] : r.body;
      const forbidden = ["admin_note", "reviewed_by", "reviewed_at", "receipt_path", "access_token_hash", "id"];
      const exposed = row ? forbidden.filter((key) => key in row) : ["<no row>"];
      record(
        "5b. valid token returns record without admin/internal columns",
        Boolean(row) && exposed.length === 0,
        row ? `columns=${Object.keys(row).join(",")}` : "no row returned",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // PROBE 6 — the order ID must not authorise anything.
  // ---------------------------------------------------------------------------
  {
    if (!createdOrderId) {
      record("6. order ID does not authorise", false, "No order id was issued.");
    } else {
      const checks = [];

      // 6a. Order ID passed where the token is expected.
      const asToken = await rpc("get_enrollment_by_token", { p_access_token: createdOrderId });
      const asTokenRows = Array.isArray(asToken.body) ? asToken.body.length : asToken.body ? 1 : 0;
      checks.push(`as access token: HTTP ${asToken.status}, ${asTokenRows} row(s)`);

      // 6b. Order ID used to filter the table directly.
      const direct = await rest(
        `/rest/v1/enrollments?select=*&order_id=eq.${encodeURIComponent(createdOrderId)}`,
      );
      const directRows = Array.isArray(direct.body) ? direct.body.length : 0;
      checks.push(`direct table filter: HTTP ${direct.status}, ${directRows} row(s)`);

      // 6c. Is there any RPC that takes an order id? There must not be.
      const byOrder = await rpc("get_enrollment_by_order_id", { p_order_id: createdOrderId });
      checks.push(`get_enrollment_by_order_id: HTTP ${byOrder.status} (404 = no such function)`);

      const pass = asTokenRows === 0 && directRows === 0 && byOrder.status === 404;
      record("6. order ID authorises nothing", pass, checks.join(" | "));
    }
  }

  // ---------------------------------------------------------------------------
  // PROBE 7 — anon must not be able to write to enrollments directly, nor change
  // a status, nor forge an audit row.
  // ---------------------------------------------------------------------------
  {
    const insert = await rest("/rest/v1/enrollments", {
      method: "POST",
      body: JSON.stringify({
        order_id: "DP-000000-99999",
        course_id: "00000000-0000-0000-0000-000000000000",
        course_title_snapshot: "Forged",
        course_slug_snapshot: "forged",
        price_amount: 0,
        price_currency: "NGN",
        student_name: "Forger",
        student_email: "forger@example.com",
        student_phone: "+2348000000000",
        access_token_hash: "\\x00",
      }),
    });
    const patch = await rest("/rest/v1/enrollments?status=eq.pending_review", {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" }),
    });
    const history = await rest("/rest/v1/enrollment_status_history", {
      method: "POST",
      body: JSON.stringify({
        enrollment_id: "00000000-0000-0000-0000-000000000000",
        to_status: "approved",
      }),
    });

    const pass = insert.status >= 400 && patch.status >= 400 && history.status >= 400;
    record(
      "7. anon direct INSERT / UPDATE / audit-forge on enrollments",
      pass,
      `insert HTTP ${insert.status} | status PATCH HTTP ${patch.status} | history INSERT HTTP ${history.status}`,
    );
  }

  // ---------------------------------------------------------------------------
  // PROBE 8 — receipt path validation: a path outside the convention must be
  // rejected even though the client is the one that proposes it.
  // ---------------------------------------------------------------------------
  {
    if (!realSlug) {
      record("8. malformed receipt path", false, "No published course.");
    } else {
      // A literal "../../etc/passwd" is intercepted by Supabase's edge WAF and never
      // reaches Postgres, which returns an HTML 403. That looks like a pass but proves
      // nothing about is_valid_receipt_path(), so the payloads below are malformed
      // against the key convention without tripping a traversal signature. An HTML
      // body is treated as inconclusive rather than as a refusal by the database.
      const payloads = [
        ["not a uuid folder", "hacker/evil.png"],
        ["no folder segment", "66666666-7777-4888-8999-aaaaaaaaaaaa.png"],
        ["nested too deep", "11111111-2222-4333-8444-555555555555/nested/66666666-7777-4888-8999-aaaaaaaaaaaa.png"],
        ["disallowed extension", "11111111-2222-4333-8444-555555555555/66666666-7777-4888-8999-aaaaaaaaaaaa.svg"],
        ["uppercase hex outside the pattern", "11111111-2222-4333-8444-555555555555/AAAAAAAA-7777-4888-8999-AAAAAAAAAAAA.png"],
      ];

      const details = [];
      let allRefusedByDb = true;
      for (const [label, candidate] of payloads) {
        const r = await rpc("create_enrollment", {
          ...baseArgs,
          p_student_email: `probe-path+${Date.now()}-${details.length}@example.com`,
          p_course_slug: realSlug,
          p_receipt_path: candidate,
          p_receipt_filename: "receipt.png",
          p_receipt_size_bytes: 10,
          p_receipt_mime_type: "image/png",
        });
        const html = typeof r.body === "string" && r.body.trimStart().startsWith("<");
        const refusedByDb = r.status >= 400 && !html;
        if (!refusedByDb) allRefusedByDb = false;
        details.push(`${label}: HTTP ${r.status}${html ? " (HTML — blocked upstream, INCONCLUSIVE)" : ""}`);
      }
      record("8. malformed receipt paths rejected by the database", allRefusedByDb, details.join(" | "));
    }
  }

  // ---------------------------------------------------------------------------
  // PROBE 9 — storage upload restrictions.
  //
  // Probe 2 proved a *valid* upload succeeds. This proves the bucket's limits are
  // real: the INSERT policy constrains the key shape, and the bucket constrains
  // MIME type and size. SVG matters most — it is an executable document and a
  // stored-XSS vector the moment an admin opens one, so 004 excludes it
  // deliberately. Each case is asserted against the specific rule it violates.
  // ---------------------------------------------------------------------------
  {
    const draftId = crypto.randomUUID();
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    // The signed-upload route only checks the INSERT policy (the key shape), so key
    // violations are probed there. MIME type and size are enforced on the object
    // write itself, so those are probed through the direct upload route.
    const trySign = async (key) => {
      const response = await fetch(`${URL_BASE}/storage/v1/object/upload/sign/receipts/${key}`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await response.text();
      return { status: response.status, reason: reasonOf(body) };
    };

    const tryUpload = async (key, contentType, body) => {
      const response = await fetch(`${URL_BASE}/storage/v1/object/receipts/${key}`, {
        method: "POST",
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": contentType },
        body,
      });
      const text = await response.text();
      return { status: response.status, reason: reasonOf(text) };
    };

    const checks = [];

    // 9a. Key shape — enforced by the INSERT policy in 004. Expect an RLS refusal,
    // not merely "some 4xx": a generic error would pass a status-only assertion
    // while proving nothing about the policy.
    const isRls = (r) => r.status >= 400 && /unauthorized|violates row-level security|new row violates/i.test(r.reason);

    const rootKey = await trySign(`${crypto.randomUUID()}.png`);
    checks.push(["object at bucket root (no folder)", isRls(rootKey), `HTTP ${rootKey.status} ${rootKey.reason}`]);

    const deepKey = await trySign(`${draftId}/nested/${crypto.randomUUID()}.png`);
    checks.push(["nested two levels deep", isRls(deepKey), `HTTP ${deepKey.status} ${deepKey.reason}`]);

    const nonUuidFolder = await trySign(`not-a-uuid/${crypto.randomUUID()}.png`);
    checks.push(["folder segment is not a UUID", isRls(nonUuidFolder), `HTTP ${nonUuidFolder.status} ${nonUuidFolder.reason}`]);

    // 9b. MIME type — enforced by the bucket's allowed_mime_types. The reason must
    // name the mime type, otherwise the upload may have failed for an unrelated cause.
    const svg = await tryUpload(
      `${draftId}/${crypto.randomUUID()}.svg`,
      "image/svg+xml",
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const mimeRefused = (r) => r.status >= 400 && /mime type|content type/i.test(r.reason);
    checks.push(["SVG upload (stored-XSS vector)", mimeRefused(svg), `HTTP ${svg.status} ${svg.reason}`]);

    const html = await tryUpload(
      `${draftId}/${crypto.randomUUID()}.png`,
      "text/html",
      "<html><script>alert(1)</script></html>",
    );
    checks.push(["text/html upload", mimeRefused(html), `HTTP ${html.status} ${html.reason}`]);

    // 9c. Size — enforced by the bucket's 5 MB file_size_limit.
    const oversize = await tryUpload(
      `${draftId}/${crypto.randomUUID()}.png`,
      "image/png",
      Buffer.concat([png, Buffer.alloc(6 * 1024 * 1024)]),
    );
    const sizeRefused =
      oversize.status >= 400 && /maximum allowed size|exceeded|too large|entity too large/i.test(oversize.reason);
    checks.push(["6 MB upload against a 5 MB limit", sizeRefused, `HTTP ${oversize.status} ${oversize.reason}`]);

    const allRefused = checks.every(([, pass]) => pass);
    record(
      "9. storage upload restrictions (key shape, MIME type, size)",
      allRefused,
      checks.map(([label, pass, detail]) => `${label}: ${detail}${pass ? "" : " ← ALLOWED"}`).join(" | "),
    );
  }

  console.log("\n=== Summary ===");
  const failed = results.filter((entry) => !entry.pass);
  console.log(`${results.length - failed.length}/${results.length} probes passed.`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const entry of failed) console.log(`  - ${entry.name}: ${entry.detail}`);
  }
  if (createdOrderId) {
    console.log(
      `\nNOTE: probe enrollments were created (e.g. ${createdOrderId}) and one object was ` +
        "uploaded to the receipts bucket. Clean both up by running " +
        "scripts/probes/phase3-teardown.sql in the Supabase SQL Editor.",
    );
  }
  process.exit(failed.length > 0 ? 1 : 0);
};

main().catch((error) => {
  console.error("Probe run failed:", error);
  process.exit(2);
});
