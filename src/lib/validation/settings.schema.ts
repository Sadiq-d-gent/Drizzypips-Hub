import { z } from "zod";

import {
  REVIEW_WINDOW_HOURS_MAX,
  REVIEW_WINDOW_HOURS_MIN,
  SETTINGS_LONG_TEXT_MAX,
  SETTINGS_SHORT_TEXT_MAX,
} from "@/lib/constants/admin";

/**
 * Settings form schemas.
 *
 * Two independent schemas rather than one, because the two cards on /admin/settings save
 * separately: a half-filled bank detail must not be able to block someone from pausing
 * enrollments, and pausing must not require re-validating the payment instructions.
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
 * no length check in 003_create_payment_settings.sql.
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
