import { SETTINGS_SQLSTATE } from "@/lib/constants/admin";
import { getSupabaseClient } from "@/lib/supabase/client";
import type { PaymentSettingsInput, SiteSettingsInput } from "@/lib/validation/settings.schema";
import type { AdminSettings } from "@/types/admin";
import type { PaymentSettings } from "@/types/enrollment";

/**
 * Administrator reads and writes for the two settings tables.
 *
 * WHY DIRECT TABLE ACCESS AND NOT AN RPC
 * Same reasoning as adminCourse.service.ts. 003_create_payment_settings.sql already
 * expresses the whole invariant in policies — SELECT/INSERT/UPDATE/DELETE gated on
 * `public.is_admin()` for both tables, plus `revoke all on public.admin_settings from anon`
 * — so a SECURITY DEFINER function would only restate it, in a second place that could
 * drift. The RLS policies are the authorization boundary; nothing on this side of the wire
 * is trusted, and a caller who is not an administrator gets 42501 rather than a write.
 *
 * The one thing that does need a function is the *anonymous* read of the pause state,
 * because `admin_settings` also holds `notification_email` and must stay closed to anon.
 * That lives in enrollmentAvailability.service.ts, deliberately in its own module so the
 * student bundle never imports anything from here.
 *
 * NO PAYLOAD EVER CARRIES `updated_at`. Both tables have a `set_updated_at()` BEFORE UPDATE
 * trigger (003:57-62 and 003:88-93), so the column belongs to the database. Sending it
 * would be a value the trigger immediately overwrites, and reading like a client that
 * believes otherwise.
 */

/** Columns of payment_settings, matching PaymentSettings. Named rather than `*`. */
const PAYMENT_SETTINGS_COLUMNS =
  "id, bank_name, account_name, account_number, additional_details, currency, payment_instructions, review_window_hours, support_whatsapp_number, is_active, created_at, updated_at";

/**
 * Columns of admin_settings, matching AdminSettings.
 *
 * `notification_email` is in this list because the settings form edits it. That is the
 * reason the admin settings query sits inside ADMIN_QUERY_SCOPE and is dropped on sign-out
 * — unlike payment settings, which are public by design.
 */
const ADMIN_SETTINGS_COLUMNS =
  "notification_email, enrollment_enabled, enrollment_paused_message, updated_at";

type SettingsFailure = { code?: string | null; message?: string };

/**
 * Error carrying the SQLSTATE, so the UI can distinguish the few cases worth their own
 * copy from a generic failure without matching on message text.
 */
export class SettingsError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "SettingsError";
    this.code = code;
  }

  get isNotAdmin(): boolean {
    return (
      this.code === SETTINGS_SQLSTATE.NOT_ADMIN ||
      this.code === SETTINGS_SQLSTATE.NO_ROW_RETURNED
    );
  }
}

/**
 * Maps a Postgres failure to something an administrator can act on.
 *
 * The default branch deliberately drops `error.message`, for the reason
 * adminCourse.service.ts sets out: raw Postgres text is written for an operator reading a
 * log — it names constraints, columns and sometimes the offending value — and putting it in
 * front of an admin is both confusing and a small disclosure of schema detail.
 */
const toSettingsError = (error: SettingsFailure, fallback: string): SettingsError => {
  const code = error.code ?? undefined;

  switch (code) {
    case SETTINGS_SQLSTATE.NOT_ADMIN:
    case SETTINGS_SQLSTATE.NO_ROW_RETURNED:
      return new SettingsError(
        "Your account is not allowed to change settings. Sign out and back in, and contact whoever administers this site if it keeps happening.",
        code,
      );
    case SETTINGS_SQLSTATE.CHECK_VIOLATION:
      return new SettingsError(
        "One of these values is outside what the database accepts. Check the review window and try again.",
        code,
      );
    case SETTINGS_SQLSTATE.DUPLICATE_ACTIVE:
      return new SettingsError(
        "There is already another active set of payment details. Only one can be active at a time — this needs sorting out in the database.",
        code,
      );
    default:
      return new SettingsError(fallback, code);
  }
};

/**
 * Blank text field to null.
 *
 * The form models an empty optional field as `""`; the database models it as NULL, which is
 * what the student-facing fallbacks test for — `support_whatsapp_number` being null is how
 * PaymentInstructions knows to use the compiled-in support number. Storing `""` instead
 * would defeat every one of those checks.
 */
const emptyToNull = (value: string): string | null => (value.length > 0 ? value : null);

/**
 * Saves the payment details students are shown.
 *
 * EDIT IN PLACE, DO NOT SUPERSEDE
 * The obvious alternative — insert a new active row, deactivate the old one — was rejected.
 * PostgREST gives us no transaction, so a supersede that fails halfway leaves the site with
 * *zero* active payment settings, and a student then cannot see where to pay at all.
 * Updating the one active row cannot produce that state.
 *
 * `.select()` after the update is what makes the fallback correct: an UPDATE matching no
 * rows is not an error in PostgREST, so without asking for the rows back there would be no
 * way to tell "updated the active row" from "there was no active row". Same reason
 * deleteCourse selects.
 */
export const savePaymentSettings = async (
  input: PaymentSettingsInput,
): Promise<PaymentSettings> => {
  const supabase = getSupabaseClient();

  const payload = {
    bank_name: input.bank_name,
    account_name: input.account_name,
    account_number: input.account_number,
    additional_details: emptyToNull(input.additional_details),
    currency: input.currency,
    payment_instructions: input.payment_instructions,
    review_window_hours: input.review_window_hours,
    support_whatsapp_number: emptyToNull(input.support_whatsapp_number),
  };

  const updated = await supabase
    .from("payment_settings")
    .update(payload)
    .eq("is_active", true)
    .select(PAYMENT_SETTINGS_COLUMNS);

  if (updated.error) {
    throw toSettingsError(
      updated.error,
      "Something went wrong saving the payment details. Please try again.",
    );
  }

  const existing = updated.data?.[0];

  if (existing) {
    return existing as PaymentSettings;
  }

  // No active row to update — a first run, or a database whose only rows are inactive
  // history. `is_active: true` is set here rather than relied on as a column default so the
  // intent is legible at the call site.
  const inserted = await supabase
    .from("payment_settings")
    .insert({ ...payload, is_active: true })
    .select(PAYMENT_SETTINGS_COLUMNS)
    .single();

  if (inserted.error) {
    throw toSettingsError(
      inserted.error,
      "Something went wrong saving the payment details. Please try again.",
    );
  }

  return inserted.data as PaymentSettings;
};

/**
 * Reads the single admin_settings row.
 *
 * `null` is a real answer, not a failure: the table can legitimately be empty, and
 * `maybeSingle()` keeps that from being an error. Everything downstream treats a missing row
 * as "enrollments are on", which is both the column's own default and the behaviour before
 * the pause existed — deleting the settings row must not take enrollments down with it.
 */
export const fetchAdminSettings = async (): Promise<AdminSettings | null> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("admin_settings")
    .select(ADMIN_SETTINGS_COLUMNS)
    .maybeSingle();

  if (error) {
    throw toSettingsError(error, "Could not load the site settings.");
  }

  return (data as AdminSettings | null) ?? null;
};

/**
 * Saves the single admin_settings row, creating it if it does not exist.
 *
 * An upsert rather than the update-then-insert dance used for payment settings, because
 * this table was built for it. 003's own comment on the primary key: the fixed `boolean`
 * key exists "because this table holds exactly one row, and a constant key makes 'upsert
 * the settings' a plain `on conflict (id)` instead of an index over a constant expression."
 *
 * `id: true` is the conflict target, and the only value the `check (id)` constraint permits.
 * The upsert needs both the INSERT and UPDATE policies from 003; a non-admin fails either
 * way.
 */
export const saveAdminSettings = async (
  input: SiteSettingsInput,
): Promise<AdminSettings> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("admin_settings")
    .upsert(
      {
        id: true,
        notification_email: emptyToNull(input.notification_email),
        enrollment_enabled: input.enrollment_enabled,
        enrollment_paused_message: emptyToNull(input.enrollment_paused_message),
      },
      { onConflict: "id" },
    )
    .select(ADMIN_SETTINGS_COLUMNS)
    .single();

  if (error) {
    throw toSettingsError(
      error,
      "Something went wrong saving the site settings. Please try again.",
    );
  }

  return data as AdminSettings;
};
