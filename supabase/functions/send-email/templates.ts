// supabase/functions/send-email/templates.ts
//
// Phase 7: the six emails this platform sends, as pure functions.
//
// Separated from index.ts for one reason: index.ts cannot be run outside Deno, and these can.
// There is no Deno import, no environment read and no network call anywhere in this file, so
// the whole template surface can be rendered and inspected from Node in CI or by hand. The
// alternative, templates inlined in the handler, is only verifiable by actually sending mail.
//
// Everything the templates need is passed in: the payload from the outbox row, and a context
// carrying the brand and site URL. No module-level configuration, so two callers rendering
// with different settings cannot interfere.
//
// The template list lives here rather than in the database. That is 014's decision, recorded
// in its header: "the Edge Function owns the template list, a new template is a function
// deploy rather than a schema change". The cost is that the database can enqueue a template
// this file does not know, and renderTemplate throws on that rather than substituting
// something generic, so index.ts can fail the one row and leave the batch alone.

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface TemplateContext {
  brand: string
  siteUrl: string
  // Absolute, publicly reachable URL of the brand mark shown at the top of every email.
  // Optional: empty or absent renders the wordmark alone, which is what this layout did
  // before the logo existed. A relative path cannot work here, an inbox has no origin to
  // resolve it against, so index.ts builds a fully qualified URL or passes nothing.
  logoUrl?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Every interpolated value goes through this. A student's name reaches the payload unmodified
// from the enrollment form, and a course title is admin-entered, so both are untrusted as far
// as an HTML document is concerned.
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Whole minutes between now and an ISO timestamp from a payload. Null when the value is
// missing or unparseable, so a template can say something sensible rather than "NaN minutes".
export function minutesUntil(value: unknown, now: number = Date.now()): number | null {
  if (!value) return null
  const target = new Date(String(value)).getTime()
  if (!Number.isFinite(target)) return null
  return Math.round((target - now) / 60000)
}

// A timestamp as a reader can act on it. UTC is stated explicitly rather than implied: the
// audience is not in one timezone, and an unlabelled time is worse than a labelled one in the
// wrong zone.
export function formatWhen(value: unknown, fallback: string): string {
  if (!value) return fallback
  const date = new Date(String(value))
  if (!Number.isFinite(date.getTime())) return fallback
  return date.toUTCString().replace('GMT', 'UTC')
}

// Money is formatted here rather than at enqueue time because the payload snapshots raw
// numbers, which is the right thing for it to store. Falls back to the bare figures if the
// currency code is one Intl does not recognise, so a bad code costs formatting, not the email.
export function formatPrice(amount: unknown, currency: unknown): string {
  const value = Number(amount)
  const code = String(currency ?? '').toUpperCase()
  if (!Number.isFinite(value)) return ''
  try {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: code }).format(value)
  } catch {
    return `${code} ${value.toLocaleString('en-NG')}`.trim()
  }
}

// Plain inline-styled HTML. No framework and no external stylesheet, because a mail client
// will strip a <style> block and ignore a class. Table-free and single-column, which is the
// layout least likely to be mangled and the one that already reads correctly on a phone.
//
// The header carries the logo and the wordmark, not one or the other. Most clients block
// remote images until the reader allows them, and Gmail fetches them through a proxy rather
// than from us, so an image-only header is blank for a good share of recipients on first
// open. Keeping the wordmark means a blocked image costs the logo and nothing else: the
// email still says who sent it, exactly as it did before the logo was added.
function layout(ctx: TemplateContext, heading: string, bodyHtml: string): string {
  // width/height attributes as well as CSS: Outlook ignores the stylesheet and reserves the
  // attribute box, and without them a blocked image collapses the layout. height:auto lets
  // the mark scale with max-width on a narrow phone instead of stretching, so the attributes
  // must match the asset's real 440x255 ratio or it renders squashed.
  const logo = ctx.logoUrl
    ? `<img src="${escapeHtml(ctx.logoUrl)}" alt="" width="220" height="128" style="display:block;width:220px;height:auto;max-width:100%;border:0;outline:none;margin:0 0 18px;" />`
    : ''

  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      ${logo}
      <p style="margin:0 0 24px;font-size:18px;font-weight:700;letter-spacing:-0.02em;">${escapeHtml(ctx.brand)}</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;">${escapeHtml(heading)}</h1>
      ${bodyHtml}
      <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #eeeeee;font-size:12px;color:#777777;">
        You received this email because of activity on ${escapeHtml(ctx.brand)}.
        If it was not you, no action is needed.
      </p>
    </div>
  </body>
</html>`
}

function p(html: string): string {
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${html}</p>`
}

function button(ctx: TemplateContext, label: string): string {
  return `<p style="margin:24px 0 0;"><a href="${escapeHtml(ctx.siteUrl)}" style="display:inline-block;background:#111111;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(label)}</a></p>`
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const KNOWN_TEMPLATES = [
  'verification_code',
  'enrollment_pending',
  'enrollment_approved',
  'enrollment_rejected',
  'reminder_confirmed',
  'session_reminder',
] as const

export function renderTemplate(
  template: string,
  payload: Record<string, unknown>,
  ctx: TemplateContext,
  now: number = Date.now(),
): RenderedEmail {
  const name = String(payload.student_name ?? 'there')
  const course = String(payload.course_title ?? 'your program')
  const orderId = String(payload.order_id ?? '')

  switch (template) {
    // 015. The only message that carries a secret, which is why 018 strips the code from the
    // payload in the same statement that marks this row sent.
    //
    // 015 enqueues expires_at, an absolute timestamp, not a duration. Rendered as minutes
    // remaining at send time rather than as a clock time, because a UTC timestamp in an inbox
    // makes the reader do timezone arithmetic to answer "have I still got time?". Computing it
    // here rather than at enqueue means a delayed retry tells the truth about what is left.
    case 'verification_code': {
      const code = String(payload.code ?? '')
      const minutes = minutesUntil(payload.expires_at, now)
      const validity = minutes === null
        ? 'The code is short lived and can be used once.'
        : minutes <= 0
          ? 'This code has already expired. Request a new one to continue.'
          : `The code expires in ${minutes} minute${minutes === 1 ? '' : 's'} and can be used once.`

      return {
        subject: `${code} is your ${ctx.brand} verification code`,
        html: layout(ctx, 'Confirm your email address', [
          p('Enter this code to continue with your enrollment.'),
          `<p style="margin:0 0 16px;font-size:34px;font-weight:700;letter-spacing:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${escapeHtml(code)}</p>`,
          p(escapeHtml(validity)),
          p('If you did not start an enrollment, you can ignore this email. Nobody can use the code without it.'),
        ].join('')),
        text: `Your ${ctx.brand} verification code is ${code}. ${validity} If you did not start an enrollment, you can ignore this email.`,
      }
    }

    // 016, enqueued by create_enrollment in the same transaction as the submission itself.
    case 'enrollment_pending': {
      const price = formatPrice(payload.price_amount, payload.price_currency)
      return {
        subject: `We have your enrollment for ${course}`,
        html: layout(ctx, 'Enrollment received', [
          p(`Hi ${escapeHtml(name)}, your enrollment for <strong>${escapeHtml(course)}</strong> has been received and is waiting for review.`),
          p(`Reference: <strong>${escapeHtml(orderId)}</strong>${price ? ` &middot; ${escapeHtml(price)}` : ''}`),
          p('We check payment details by hand, so this is usually reviewed within one business day. You will get another email as soon as it is done.'),
          p('Keep your reference number, it is how we find your submission if you need to get in touch.'),
        ].join('')),
        text: `Hi ${name}, your enrollment for ${course} has been received and is waiting for review. Reference: ${orderId}${price ? ` (${price})` : ''}. We check payment details by hand, so this is usually reviewed within one business day, and you will get another email as soon as it is done. Keep your reference number, it is how we find your submission if you need to get in touch.`,
      }
    }

    // 016, from review_enrollment.
    case 'enrollment_approved': {
      return {
        subject: `You are in: ${course}`,
        html: layout(ctx, 'Your enrollment is approved', [
          p(`Hi ${escapeHtml(name)}, your payment for <strong>${escapeHtml(course)}</strong> has been confirmed and your place is booked.`),
          p(`Reference: <strong>${escapeHtml(orderId)}</strong>`),
          p('We will be in touch with your schedule and joining details. Welcome aboard.'),
          button(ctx, `Visit ${ctx.brand}`),
        ].join('')),
        text: `Hi ${name}, your payment for ${course} has been confirmed and your place is booked. Reference: ${orderId}. We will be in touch with your schedule and joining details. Welcome aboard.`,
      }
    }

    // 016. Carries rejection_reason, the student-facing note, and never admin_note, which four
    // separate places in this codebase promise is private to the admin who wrote it.
    case 'enrollment_rejected': {
      const reason = String(payload.rejection_reason ?? '').trim()
      return {
        subject: `About your enrollment for ${course}`,
        html: layout(ctx, 'We could not approve this enrollment', [
          p(`Hi ${escapeHtml(name)}, we reviewed your enrollment for <strong>${escapeHtml(course)}</strong> and were not able to approve it.`),
          reason
            ? `<div style="margin:0 0 16px;padding:16px;background:#f8f8f8;border-radius:8px;font-size:15px;line-height:1.6;"><strong style="display:block;margin-bottom:4px;">Reason</strong>${escapeHtml(reason)}</div>`
            : p('This usually means the payment could not be matched to your submission.'),
          p(`Reference: <strong>${escapeHtml(orderId)}</strong>`),
          p('If you think this is a mistake, reply to this email with your reference number and we will take another look.'),
        ].join('')),
        text: `Hi ${name}, we reviewed your enrollment for ${course} and were not able to approve it.${reason ? ` Reason: ${reason}` : ' This usually means the payment could not be matched to your submission.'} Reference: ${orderId}. If you think this is a mistake, reply to this email with your reference number and we will take another look.`,
      }
    }

    // 017, sent on subscribing.
    case 'reminder_confirmed': {
      const when = formatWhen(payload.session_at, 'the next session')
      const title = String(payload.countdown_title ?? '').trim()
      const lead = Number(payload.lead_hours)
      const leadText = Number.isFinite(lead) && lead > 0
        ? `about ${lead} hour${lead === 1 ? '' : 's'} before it starts`
        : 'before it starts'

      return {
        subject: 'You are on the reminder list',
        html: layout(ctx, 'Reminder set', [
          p(`We will email you ${escapeHtml(leadText)}.`),
          title
            ? p(`<strong>${escapeHtml(title)}</strong> is scheduled for <strong>${escapeHtml(when)}</strong>.`)
            : p(`The next session is scheduled for <strong>${escapeHtml(when)}</strong>.`),
          p('If the date moves, your reminder moves with it.'),
          p('You will get one reminder, not a mailing list.'),
        ].join('')),
        text: `We will email you ${leadText}. ${title ? `${title} is` : 'The next session is'} scheduled for ${when}. If the date moves, your reminder moves with it. You will get one reminder, not a mailing list.`,
      }
    }

    // 017, from dispatch_session_reminders.
    case 'session_reminder': {
      const when = formatWhen(payload.session_at, 'shortly')
      const title = String(payload.countdown_title ?? '').trim() || 'The next mentorship session'

      return {
        subject: `${title} starts soon`,
        html: layout(ctx, 'Your session is coming up', [
          p(`<strong>${escapeHtml(title)}</strong> starts at <strong>${escapeHtml(when)}</strong>.`),
          p('You asked to be reminded, so here it is.'),
          button(ctx, 'See the details'),
        ].join('')),
        text: `${title} starts at ${when}. You asked to be reminded, so here it is. See the details at ${ctx.siteUrl}`,
      }
    }

    default:
      // Thrown rather than rendered as a fallback. A template this file does not know is a
      // deployment running behind the database, and quietly mailing something generic would
      // hide that. index.ts catches this per row, so it fails one email and the batch goes on.
      throw new Error(`Unknown template: ${template}`)
  }
}
