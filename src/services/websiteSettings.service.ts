import { getSupabaseClient } from "@/lib/supabase/client";
import type { WebsiteSettingsRow } from "@/types/website";

/**
 * The public read of `public.website_settings`.
 *
 * WHY THIS IS ITS OWN MODULE
 * Same reason enrollmentAvailability.service.ts exists: so that importing site copy from a
 * public page cannot drag administrator reads and writes into the same bundle.
 * `saveWebsiteSettings` lives in adminSettings.service.ts, which already owns the singleton
 * upsert and the SQLSTATE mapping. Nothing in this file is reachable only by an admin, and
 * nothing an admin can do is reachable from here.
 *
 * WHY THERE IS NO SECURITY DEFINER FUNCTION HERE
 * Unlike the enrollment pause — where `admin_settings` also holds `notification_email` and
 * therefore has to stay closed to anon behind a narrowing RPC — every column of
 * `website_settings` is content printed on a public page. 011 gives it a flat
 * `using (true)` SELECT policy for `anon, authenticated`, and a function would only restate
 * that in a second place. If a column is ever added that is *not* publishable, it does not
 * belong in this table.
 */

/**
 * Named columns, not `*`.
 *
 * Matches WebsiteSettingsRow exactly. `id` is omitted because it is a constant `true`, and
 * `created_at` because nothing displays it. `updated_at` is included: it is what remounts
 * the admin form from persisted values after a save.
 *
 * Exported so `saveWebsiteSettings` can select the same twenty-one columns back. That import
 * runs admin → public, which is the harmless direction; the split this module exists for is
 * the other one, and a second copy of a twenty-one-name list is exactly the kind of thing that
 * drifts.
 *
 * The three `countdown_*` columns are on the list for the same reason as everything else: 012
 * added them to this table because they are printed in the homepage hero. Note a public page
 * reads all three even though only a configured countdown renders — the switch and the moment
 * are precisely what resolveWebsiteSettings needs in order to decide to render nothing.
 */
export const WEBSITE_SETTINGS_COLUMNS =
  "hero_title, hero_subtitle, hero_stat_1_value, hero_stat_1_label, hero_stat_2_value, hero_stat_2_label, hero_stat_3_value, hero_stat_3_label, countdown_enabled, countdown_title, countdown_session_at, telegram_url, signal_group_url, broker_name, broker_description, broker_url, instagram_url, tiktok_url, contact_email, footer_tagline, footer_copyright, updated_at";

/**
 * Reads the single website_settings row.
 *
 * `null` is a real answer, not a failure — `maybeSingle()` keeps an empty table from being
 * an error, exactly as fetchAdminSettings does. A thrown error is also survivable: this
 * function does not fabricate a row, and resolveWebsiteSettings turns `undefined` into the
 * full set of compiled-in defaults, so the caller renders the site as it shipped.
 */
export const fetchWebsiteSettings = async (): Promise<WebsiteSettingsRow | null> => {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from("website_settings")
    .select(WEBSITE_SETTINGS_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as WebsiteSettingsRow | null) ?? null;
};
