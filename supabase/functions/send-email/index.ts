// supabase/functions/send-email/index.ts
//
// Phase 7: the dispatcher. The only component in this project that talks to a mail provider,
// and the only place the provider's API key exists.
//
// WHAT IT IS FOR
//
// Every email this platform sends is enqueued by a SECURITY DEFINER function inside the same
// transaction as the thing it is telling somebody about: a verification code, an enrollment
// acknowledgement, an approve or reject decision, a session reminder. 014's header sets out
// why. Nothing in that design sends anything. This function is what drains it.
//
// It holds no policy of its own. Which rows are due, how many attempts they get, how long to
// back off, and what to strip from a payload on success are all decided by 018's SQL. This
// file renders HTML, talks to Resend, and reports what happened.
//
// WHY THE SECRET CHECK IS FIRST
//
// An Edge Function is a public URL. Without a caller check this is an open relay: anybody
// could drain the queue on demand and, worse, POST it repeatedly to burn a verification code's
// five attempts or exhaust the Resend quota. So nothing happens, not even a database client,
// before x-dispatch-secret matches EMAIL_DISPATCH_SECRET.
//
// verify_jwt is off for this function (see supabase/config.toml). It has to be: pg_cron calls
// it with a shared secret rather than a user JWT, and the Supabase anon JWT is public anyway,
// so requiring it would not be a check at all. The shared secret is the check.
//
// WHERE THE SECRETS LIVE
//
// RESEND_API_KEY, EMAIL_DISPATCH_SECRET and EMAIL_FROM are read from the Edge environment,
// set with `supabase secrets set`. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by
// the platform. None is a VITE_ variable and none is committed: .env.example carries
// placeholder names only. The frontend never sees any of this, which is the spec's hardest
// constraint and the reason a browser cannot send an email even indirectly. It can only ask a
// database function to enqueue one.
//
// AT LEAST ONCE, MADE AT MOST ONCE
//
// If Resend accepts a message and this function dies before recording it, 018's reaper
// requeues the row and it sends again. That gap cannot be closed from this side: the commit
// and the HTTP call are not one atomic act.
//
// It is closed from the other side instead. The outbox row id goes to Resend as an
// Idempotency-Key, so a second delivery of the same row is recognised and dropped by the
// provider rather than arriving in somebody's inbox.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import { renderTemplate, type RenderedEmail, type TemplateContext } from './templates.ts'

interface ClaimedEmail {
  id: string
  template: string
  to_email: string
  payload: Record<string, unknown>
  attempts: number
}

const BRAND = 'Drizzypipshub'

// One claim per invocation, bounded. The cap sits well under Resend's rate limit and well
// under the Edge wall-clock budget, and the queue is drained by repeated runs rather than by
// one long one. A run that fills its batch reports batch_full, so a backlog is visible rather
// than inferred.
const BATCH_SIZE = 20

// How long a row may sit in 'sending' before it is treated as abandoned. Comfortably longer
// than a full batch of sequential sends, so a slow run is never mistaken for a dead one.
const STUCK_AFTER = '10 minutes'

// ---------------------------------------------------------------------------
// Resend
// ---------------------------------------------------------------------------

async function sendViaResend(
  apiKey: string,
  from: string,
  email: ClaimedEmail,
  rendered: RenderedEmail,
): Promise<string> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // The outbox row id, so a redelivery after a crash is dropped by Resend instead of
      // reaching the recipient. See the header.
      'Idempotency-Key': email.id,
    },
    body: JSON.stringify({
      from,
      to: [email.to_email],
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    }),
  })

  const body = await response.text()

  if (!response.ok) {
    // The status is included because it is what distinguishes a retry worth making from one
    // that never will be. A 422 on a malformed address fails the same way five times; a 429 or
    // a 5xx is exactly what the backoff exists for. Both end up in last_error, where an
    // operator reading the delivery log can tell them apart.
    throw new Error(`Resend ${response.status}: ${body.slice(0, 500)}`)
  }

  try {
    return String(JSON.parse(body).id ?? '')
  } catch {
    // Accepted, but the body was not what we expected. The send stands: failing the row here
    // would retry a message the provider has already taken.
    return ''
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

Deno.serve(async (request: Request): Promise<Response> => {
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  // Before anything else. See the header: this URL is public.
  const expectedSecret = Deno.env.get('EMAIL_DISPATCH_SECRET')

  if (!expectedSecret) {
    // Refusing rather than defaulting to open. A missing secret is a misconfigured deploy, and
    // the safe reading of "no secret is configured" is "nobody may call this", not "everybody
    // may".
    console.error('EMAIL_DISPATCH_SECRET is not set; refusing every request')
    return json(503, { error: 'Not configured' })
  }

  if (!timingSafeEqual(request.headers.get('x-dispatch-secret') ?? '', expectedSecret)) {
    return json(401, { error: 'Unauthorized' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM') ?? `${BRAND} <onboarding@resend.dev>`

  if (!supabaseUrl || !serviceRoleKey || !resendKey) {
    // Named individually, because "not configured" with no detail is the least useful thing a
    // deploy can tell you. The values themselves are never logged.
    console.error('Missing environment:', {
      SUPABASE_URL: Boolean(supabaseUrl),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(serviceRoleKey),
      RESEND_API_KEY: Boolean(resendKey),
    })
    return json(503, { error: 'Not configured' })
  }

  // The fallbacks are a last resort for a misconfigured deploy, not the normal path:
  // PUBLIC_SITE_URL is set as a secret and is what actually applies. The trailing slash is
  // stripped so the logo URL below cannot come out with a doubled one, which some proxies
  // will not follow.
  const siteUrl = (Deno.env.get('PUBLIC_SITE_URL') ?? 'https://drizzypipshub.com').replace(/\/+$/, '')

  const ctx: TemplateContext = {
    brand: BRAND,
    siteUrl,
    // An inbox has no origin, so this has to be absolute and publicly reachable with no
    // auth. It is derived from the site URL rather than configured separately: one fewer
    // secret to keep in step, and the asset ships in the same deploy as the site that
    // serves it. EMAIL_LOGO_URL overrides it if the mark ever moves to a CDN.
    logoUrl: Deno.env.get('EMAIL_LOGO_URL') ?? `${siteUrl}/email-logo.jpg`,
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const result = {
    reminders_queued: 0,
    requeued: 0,
    claimed: 0,
    sent: 0,
    failed: 0,
    batch_full: false,
  }

  // 1. Move any due session reminders into the outbox.
  //
  //    This is 017's contract, stated in its header: dispatch_session_reminders is pure SQL
  //    and this dispatcher is what calls it, so reminders work whether or not pg_cron is
  //    installed. A failure here is logged and stepped over: the rows already queued are owed
  //    to people regardless of whether the reminder sweep succeeded.
  const { data: queued, error: reminderError } = await supabase.rpc('dispatch_session_reminders')

  if (reminderError) {
    console.error('dispatch_session_reminders failed:', reminderError.message)
  } else {
    result.reminders_queued = Number(queued ?? 0)
  }

  // 2. Reclaim anything a previous run abandoned mid-send, before claiming new work, so a
  //    crashed run's rows rejoin this batch rather than waiting for the next one.
  const { data: requeued, error: requeueError } = await supabase.rpc('requeue_stuck_emails', {
    p_older_than: STUCK_AFTER,
  })

  if (requeueError) {
    console.error('requeue_stuck_emails failed:', requeueError.message)
  } else {
    result.requeued = Number(requeued ?? 0)
  }

  // 3. Claim. Atomic, and it counts the attempt, so a row that kills this function while
  //    rendering cannot be retried forever. 018 has the reasoning.
  //
  //    Unlike the two above, a failure here is fatal to the run: with no batch there is
  //    nothing to do, and returning 200 would tell a caller the queue was empty when it was
  //    only unreachable.
  const { data: claimed, error: claimError } = await supabase.rpc('claim_email_batch', {
    p_limit: BATCH_SIZE,
  })

  if (claimError) {
    console.error('claim_email_batch failed:', claimError.message)
    return json(500, { error: 'Claim failed', detail: claimError.message })
  }

  const batch = (claimed ?? []) as ClaimedEmail[]
  result.claimed = batch.length
  result.batch_full = batch.length === BATCH_SIZE

  // 4. Send.
  //
  //    Sequential on purpose. The batch is small, Resend rate-limits per second, and a burst
  //    of parallel sends would trade a slightly shorter run for rows failing on 429 and
  //    consuming attempts they did not need to spend.
  for (const email of batch) {
    try {
      const rendered = renderTemplate(email.template, email.payload ?? {}, ctx)
      const providerId = await sendViaResend(resendKey, from, email, rendered)

      const { error } = await supabase.rpc('complete_email_delivery', {
        p_id: email.id,
        p_provider_id: providerId || null,
        p_error: null,
      })

      if (error) {
        // Delivered, but not recorded. The row stays in 'sending' and the reaper will requeue
        // it; the idempotency key is what stops that becoming a second email in the student's
        // inbox. Logged loudly, because this is the one path where the database and reality
        // disagree.
        console.error(`Sent ${email.id} but could not record it:`, error.message)
      } else {
        result.sent += 1
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)

      // The payload is never logged. A verification_code row carries a live code, and a log
      // line is exactly the kind of durable copy 015 exists to avoid. The row id and template
      // are enough to find it in the delivery log, where the payload is already redacted.
      console.error(`Delivery failed for ${email.id} (${email.template}):`, message)

      const { error } = await supabase.rpc('complete_email_delivery', {
        p_id: email.id,
        p_provider_id: null,
        p_error: message,
      })

      if (error) {
        console.error(`Could not record failure for ${email.id}:`, error.message)
      }

      result.failed += 1
    }
  }

  return json(200, result)
})

// Compares two strings without returning early at the first differing byte. A timing attack
// over the public internet against a high-entropy secret is close to theoretical, but this is
// one small function and it removes the question.
//
// The length difference is folded into the accumulator rather than short-circuited on, and the
// loop runs over the longer of the two, so the time taken does not describe the secret.
function timingSafeEqual(a: string, b: string): boolean {
  if (!a || !b) return false

  const encoder = new TextEncoder()
  const left = encoder.encode(a)
  const right = encoder.encode(b)

  let diff = left.length ^ right.length
  const max = Math.max(left.length, right.length)

  for (let i = 0; i < max; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }

  return diff === 0
}
