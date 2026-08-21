import { z } from "zod";

import {
  COUNTDOWN_TITLE_MAX,
  HERO_STAT_LABEL_MAX,
  HERO_STAT_VALUE_MAX,
  REVIEW_WINDOW_HOURS_MAX,
  REVIEW_WINDOW_HOURS_MIN,
  SETTINGS_LONG_TEXT_MAX,
  SETTINGS_SHORT_TEXT_MAX,
} from "@/lib/constants/admin";
import {
  SESSION_DATE_PATTERN,
  SESSION_TIME_PATTERN,
  combineSessionDateTime,
} from "@/lib/website/countdown";

/**
 * Settings form schemas.
 *
 * Three independent schemas rather than one, because the three cards on /admin/settings save
 * separately: a half-filled bank detail must not be able to block someone from pausing
 * enrollments, pausing must not require re-validating the payment instructions, and neither
 * must stand between an administrator and a corrected Telegram link.
 *
 * Nullable columns are typed here as plain strings, not `string | null`. A text input's
 * empty value is `""`, and giving these fields a nullable type would mean every form
 * default and every reset had to convert in both directions. The empty-to-null conversion
 * happens once, at the service boundary, where the database's own shape is what matters.
 */

/**
 * Optional free text: allowed to be blank, capped for the layout's sake.
 *
 * The cap is not mirroring a constraint — every one of these columns is plain `text` with
 * no length check in 003_create_payment_settings.sql or 011_create_website_settings.sql. The
 * URL checks below are the one exception, and they say so.
 */
const optionalText = (max: number) => z.string().trim().max(max, {
  message: `Keep this under ${max} characters.`,
});

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, { message: `${label} is required.` })
    .max(max, { message: `Keep ${label.toLowerCase()} under ${max} characters.` });

/**
 * `public.payment_settings` as the admin edits it.
 *
 * `id`, `is_active`, `created_at` and `updated_at` are absent on purpose. The first two
 * are decided by the service — it edits the active row in place — and the timestamps
 * belong to the table's default and its BEFORE UPDATE trigger.
 *
 * Every field here is shown to a paying student, so the validation is about not publishing
 * a blank where an account number should be, rather than about safety: nothing a student
 * reads on the payment step is a security boundary.
 */
export const paymentSettingsSchema = z.object({
  bank_name: requiredText("Bank name", SETTINGS_SHORT_TEXT_MAX),
  account_name: requiredText("Account name", SETTINGS_SHORT_TEXT_MAX),
  /**
   * Not forced to digits. The column is plain `text` with no check, the field serves
   * non-NGN accounts whose identifiers are not all numeric, and inventing a format rule
   * here would be a business rule the database does not have — one that would block a
   * legitimate IBAN.
   */
  account_number: requiredText("Account number", SETTINGS_SHORT_TEXT_MAX),
  additional_details: optionalText(SETTINGS_LONG_TEXT_MAX),
  currency: requiredText("Currency", 8),
  payment_instructions: requiredText("Payment instructions", SETTINGS_LONG_TEXT_MAX),
  /**
   * Mirrors `check (review_window_hours > 0 and review_window_hours <= 336)` in
   * 003_create_payment_settings.sql. One of the few settings bounds that is a real
   * constraint: sending 0 from here would come back as a 23514, not be accepted.
   *
   * Not `z.coerce.number()`. The field holds a number and the input hands over
   * `valueAsNumber`, which is `NaN` for an empty or half-typed box — and `NaN` is what
   * invalid_type_error is there to describe. Coercing would turn `""` into `0` and report it
   * as "must be at least 1 hour", which is a confusing thing to say about an empty field.
   */
  review_window_hours: z
    .number({ invalid_type_error: "Enter the review window in hours." })
    .int({ message: "Enter a whole number of hours." })
    .min(REVIEW_WINDOW_HOURS_MIN, {
      message: `The review window must be at least ${REVIEW_WINDOW_HOURS_MIN} hour.`,
    })
    .max(REVIEW_WINDOW_HOURS_MAX, {
      message: `The review window cannot exceed ${REVIEW_WINDOW_HOURS_MAX} hours.`,
    }),
  support_whatsapp_number: optionalText(SETTINGS_SHORT_TEXT_MAX),
});

export type PaymentSettingsInput = z.infer<typeof paymentSettingsSchema>;

/**
 * `public.admin_settings` as the admin edits it.
 *
 * `id` is absent because it is a constant `true` — the upsert's conflict target, not a
 * value anyone chooses.
 */
export const siteSettingsSchema = z
  .object({
    /**
     * Blank is valid: 003 stores this address for notifications that are not built yet, so
     * an empty value is the honest state rather than a missing one. Validated as an email
     * only when something is actually there, so clearing the field is not an error.
     */
    notification_email: optionalText(SETTINGS_SHORT_TEXT_MAX).refine(
      (value) => value === "" || z.string().email().safeParse(value).success,
      { message: "Enter a valid email address, or leave this blank." },
    ),
    enrollment_enabled: z.boolean(),
    enrollment_paused_message: optionalText(SETTINGS_LONG_TEXT_MAX),
  })
  /**
   * A pause with no message is refused. The message is the only thing a blocked student
   * sees — DEFAULT_ENROLLMENT_PAUSED_MESSAGE exists for a row edited outside the app, and
   * falling back to it from inside the form that could have asked would be a worse answer
   * than an error. The message stays editable while enrollments are open so it can be
   * drafted ahead of a planned pause; get_enrollment_availability() withholds it until the
   * pause is actually on.
   */
  .refine(
    (value) => value.enrollment_enabled || value.enrollment_paused_message.length > 0,
    {
      message: "Write the message students should see while enrollments are paused.",
      path: ["enrollment_paused_message"],
    },
  );

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

/**
 * Optional URL: blank, or something the database will actually accept.
 *
 * This one *is* mirroring a constraint, unlike every length cap above.
 * 011_create_website_settings.sql puts `check (col is null or col ~* '^https?://')` on all
 * five URL columns, so a `javascript:` value is refused with a 23514 whether or not this
 * check exists. That is the point: these values are written into an `<a href>`, and the
 * server-side half of the guard cannot be bypassed by anything holding an admin session,
 * including a direct PostgREST call. This half only turns the refusal into a sentence the
 * administrator can act on before the round trip.
 */
const optionalUrl = (label: string) =>
  optionalText(SETTINGS_SHORT_TEXT_MAX).refine(
    (value) => value === "" || /^https?:\/\//i.test(value),
    { message: `${label} must start with http:// or https://.` },
  );

/** One hero figure. Blank means "keep the site default", per resolveWebsiteSettings. */
const heroStatFields = {
  value: optionalText(HERO_STAT_VALUE_MAX),
  label: optionalText(HERO_STAT_LABEL_MAX),
};

/**
 * One half of the session moment: blank, or the shape its input actually produces.
 *
 * `<input type="date">` and `<input type="time">` already refuse a malformed value in every
 * browser that implements them — the field simply stays empty — so this is here for the two
 * cases that are not the picker: a browser falling back to a plain text box, and a value
 * arriving from somewhere other than this form. Whether the two halves make a real moment
 * *together* is not a per-field question, and is checked in the second superRefine below.
 */
const sessionPart = (pattern: RegExp, message: string) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || pattern.test(value), { message });

/**
 * `public.website_settings` as the admin edits it.
 *
 * Nearly every field is optional, because blank is the meaningful state here rather than a
 * missing one: null means "use the compiled-in default", which is what the whole table is
 * built around. So there is almost nothing to require — an entirely empty form is valid and
 * renders the site exactly as it shipped.
 *
 * The countdown is the exception, and only while it is switched on. It is the one thing on
 * this form with no default to fall back to — there is no honest guess at when the next
 * session is — so "show a countdown" and "here is what to count to" have to arrive together.
 * See the second superRefine.
 *
 * `id`, `created_at` and `updated_at` are absent for the same reasons as in the two schemas
 * above: the first is the upsert's constant conflict target, and the timestamps belong to
 * the column default and the BEFORE UPDATE trigger. `countdown_session_at` is absent for a
 * different reason — the administrator edits a date and a time, and the single instant those
 * two make is assembled at the service boundary, where every other form-shape-to-row-shape
 * conversion on this table already happens.
 */
export const websiteSettingsSchema = z
  .object({
    hero_title: optionalText(SETTINGS_SHORT_TEXT_MAX),
    hero_subtitle: optionalText(SETTINGS_LONG_TEXT_MAX),

    hero_stat_1_value: heroStatFields.value,
    hero_stat_1_label: heroStatFields.label,
    hero_stat_2_value: heroStatFields.value,
    hero_stat_2_label: heroStatFields.label,
    hero_stat_3_value: heroStatFields.value,
    hero_stat_3_label: heroStatFields.label,

    countdown_enabled: z.boolean(),
    countdown_title: optionalText(COUNTDOWN_TITLE_MAX),
    countdown_session_date: sessionPart(
      SESSION_DATE_PATTERN,
      "Enter the date as YYYY-MM-DD.",
    ),
    countdown_session_time: sessionPart(
      SESSION_TIME_PATTERN,
      "Enter the time as HH:MM on a 24-hour clock.",
    ),

    telegram_url: optionalUrl("The Telegram link"),
    signal_group_url: optionalUrl("The signal group link"),

    broker_name: optionalText(SETTINGS_SHORT_TEXT_MAX),
    broker_description: optionalText(SETTINGS_LONG_TEXT_MAX),
    broker_url: optionalUrl("The broker link"),

    instagram_url: optionalUrl("The Instagram link"),
    tiktok_url: optionalUrl("The TikTok link"),
    /**
     * Validated as an email only when something is there, exactly like `notification_email`
     * above, so clearing the field is not an error. No database check backs this one: the
     * footer builds `mailto:${value}`, so the scheme is fixed by our code rather than by the
     * stored value, and there is no injection to close.
     */
    contact_email: optionalText(SETTINGS_SHORT_TEXT_MAX).refine(
      (value) => value === "" || z.string().email().safeParse(value).success,
      { message: "Enter a valid email address, or leave this blank." },
    ),

    footer_tagline: optionalText(SETTINGS_LONG_TEXT_MAX),
    footer_copyright: optionalText(SETTINGS_SHORT_TEXT_MAX),
  })
  /**
   * A hero figure needs both halves or neither.
   *
   * resolveWebsiteSettings falls back to the default *pair* when either half is missing,
   * because a value with no label is a number meaning nothing and a label with no value is a
   * caption under nothing. That fallback is silent, which is right for a row edited outside
   * the app and wrong for a form that could have asked — so the form asks.
   */
  .superRefine((value, ctx) => {
    ([1, 2, 3] as const).forEach((slot) => {
      const statValue = value[`hero_stat_${slot}_value`];
      const statLabel = value[`hero_stat_${slot}_label`];

      if (statValue.length > 0 && statLabel.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add a label, or clear the figure to use the site default.",
          path: [`hero_stat_${slot}_label`],
        });
      }

      if (statLabel.length > 0 && statValue.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Add a figure, or clear the label to use the site default.",
          path: [`hero_stat_${slot}_value`],
        });
      }
    });
  })
  /**
   * The countdown needs a real moment, and only when it is on.
   *
   * A second superRefine rather than more branches in the one above, because these checks are
   * about a different thing: the hero figures fall back silently and the form only asks so the
   * fallback is not a surprise, whereas here there is nothing to fall back to. This is the
   * `enrollment_paused_message` rule in siteSettingsSchema — a switch that has been turned on
   * without the thing it needs is refused rather than defaulted.
   *
   * Off with a half-filled date is still an error. The pair is stored as one column, so a date
   * with no time is a value the row cannot hold, and silently dropping it would lose an entry
   * the administrator had clearly meant to keep — they may well be scheduling ahead of turning
   * the countdown on.
   *
   * The past is deliberately NOT refused. A session that has started has a defined rendering —
   * the hero says "Session is starting" rather than showing negative numbers — and refusing it
   * here would mean that months after a session, an administrator could not save an unrelated
   * footer edit without first clearing a field they were not thinking about. The form warns
   * instead; see WebsiteSettingsForm.
   */
  .superRefine((value, ctx) => {
    const hasDate = value.countdown_session_date.length > 0;
    const hasTime = value.countdown_session_time.length > 0;

    if (value.countdown_enabled && !hasDate && !hasTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Set the session date and time, or switch the countdown off.",
        path: ["countdown_session_date"],
      });

      return;
    }

    if (hasTime && !hasDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add the session date — a time on its own is not a moment.",
        path: ["countdown_session_date"],
      });
    }

    if (hasDate && !hasTime) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Add the session time — a date on its own is not a moment.",
        path: ["countdown_session_time"],
      });
    }

    /**
     * Both halves present, but not a date that exists.
     *
     * `combineSessionDateTime` is the same function the service uses to build the stored
     * value, so a pair it rejects is exactly a pair that would be saved as NULL — which, with
     * the switch on, is the row 012's check constraint refuses. Asking here turns a 23514
     * round trip into a field message. 31 February is the case a regex cannot catch.
     */
    if (
      hasDate &&
      hasTime &&
      combineSessionDateTime(value.countdown_session_date, value.countdown_session_time) === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "That date and time are not a real moment. Check the day of the month.",
        path: ["countdown_session_date"],
      });
    }
  });

export type WebsiteSettingsInput = z.infer<typeof websiteSettingsSchema>;
