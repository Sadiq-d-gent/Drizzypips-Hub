import { WEBSITE_DEFAULTS } from "@/lib/constants/homepage";
import type {
  WebsiteContent,
  WebsiteCountdown,
  WebsiteSettingsContent,
} from "@/types/website";

/**
 * Merges the `website_settings` row with the compiled-in defaults.
 *
 * WHY THIS IS A PLAIN FUNCTION AND NOT PART OF THE QUERY
 * Every consumer needs the same answer, and the answer has to be defined for inputs the
 * query cannot rule out: no row, a row with some columns null, a row with a column set to
 * `""` by someone editing SQL directly, and no data at all because the request failed. A
 * pure function over `WebsiteSettingsContent | null | undefined` makes all four cases one
 * code path, makes them testable without a client, and lets the admin form preview its own
 * unsaved values through the very code the public pages run.
 *
 * FAIL OPEN, DELIBERATELY
 * `resolveWebsiteSettings(undefined)` returns every default, so a failed query renders the
 * site as it shipped rather than an error page. Nothing in this table is a security
 * boundary or a correctness-critical value — it is marketing copy and outbound links — so
 * the worst case of failing open is stale copy, while the worst case of failing closed is a
 * blank homepage. Note that this is the opposite of the enrollment pause, which fails
 * *closed* precisely because the wrong answer there takes money.
 */

/**
 * Blank to null, mirroring `emptyToNull` at the write boundary.
 *
 * The admin form cannot store `""` — `saveWebsiteSettings` converts it — but a row edited
 * in the SQL editor or through the API can hold one, and `""` is not a headline. Trimming
 * as well, so a field containing only spaces does not blank the hero either.
 */
const orDefault = (value: string | null | undefined, fallback: string): string => {
  const trimmed = value?.trim();

  return trimmed && trimmed.length > 0 ? trimmed : fallback;
};

/**
 * One hero figure, resolved as a pair.
 *
 * A stat is only overridden when *both* halves are present. A value with no label renders
 * as a number meaning nothing, and a label with no value renders as a caption under
 * nothing — so a half-filled slot falls back to the default pair instead of publishing
 * either. The admin form asks for both together for the same reason.
 */
const resolveStat = (
  value: string | null | undefined,
  label: string | null | undefined,
  fallback: { readonly value: string; readonly label: string },
): { value: string; label: string } => {
  const trimmedValue = value?.trim();
  const trimmedLabel = label?.trim();

  if (trimmedValue && trimmedLabel) {
    return { value: trimmedValue, label: trimmedLabel };
  }

  return { value: fallback.value, label: fallback.label };
};

/**
 * The three countdown columns as one nullable object.
 *
 * FOUR WAYS TO GET `null`, AND EVERY ONE OF THEM MEANS "RENDER NOTHING"
 * The switch is off; there is no row at all; the session moment is unset; the stored moment is
 * not a date. Collapsing them here rather than in the hero is what keeps "when disabled,
 * render nothing" a single falsy check at the one place it is rendered — and it means the
 * admin form's live preview disappears under exactly the conditions a visitor's would.
 *
 * The switch is checked first even though the check constraint in 012 makes "enabled with no
 * moment" unstorable. That constraint guards the table; this guards the render, and the
 * resolver's whole contract is that it is defined for inputs the query cannot rule out —
 * including a row written before that constraint existed.
 *
 * WHAT IS NOT CHECKED HERE
 * Whether the moment has already passed. A past session is not a missing one: the hero has a
 * defined state for it, and hiding the card the instant a session begins would take the
 * countdown away from the people arriving *for* that session. `countdownBreakdown` clamps to
 * zero and the card says "Session is starting"; switching it off afterwards is an editorial
 * decision, so it stays with the administrator.
 */
const resolveCountdown = (
  row: WebsiteSettingsContent | null | undefined,
): WebsiteCountdown | null => {
  if (!row?.countdown_enabled) {
    return null;
  }

  const targetAt = row.countdown_session_at?.trim();

  if (!targetAt) {
    return null;
  }

  const moment = new Date(targetAt);

  if (Number.isNaN(moment.getTime())) {
    return null;
  }

  return {
    title: orDefault(row.countdown_title, WEBSITE_DEFAULTS.countdownTitle),
    // Normalised rather than passed through, so the component and the admin preview parse a
    // canonical instant instead of whatever format the column happened to come back in.
    targetAt: moment.toISOString(),
  };
};

export const resolveWebsiteSettings = (
  row: WebsiteSettingsContent | null | undefined,
): WebsiteContent => {
  const telegramUrl = orDefault(row?.telegram_url, WEBSITE_DEFAULTS.telegramUrl);

  return {
    heroTitle: orDefault(row?.hero_title, WEBSITE_DEFAULTS.heroTitle),
    heroSubtitle: orDefault(row?.hero_subtitle, WEBSITE_DEFAULTS.heroSubtitle),
    heroStats: [
      resolveStat(row?.hero_stat_1_value, row?.hero_stat_1_label, WEBSITE_DEFAULTS.heroStats[0]),
      resolveStat(row?.hero_stat_2_value, row?.hero_stat_2_label, WEBSITE_DEFAULTS.heroStats[1]),
      resolveStat(row?.hero_stat_3_value, row?.hero_stat_3_label, WEBSITE_DEFAULTS.heroStats[2]),
    ],
    countdown: resolveCountdown(row),
    telegramUrl,
    // The only field whose fallback is another field rather than a literal: before this
    // column existed the signals page linked to the general Telegram community, and that
    // stays true until someone sets a distinct group link.
    signalGroupUrl: orDefault(row?.signal_group_url, telegramUrl),
    brokerName: orDefault(row?.broker_name, WEBSITE_DEFAULTS.brokerName),
    brokerDescription: orDefault(row?.broker_description, WEBSITE_DEFAULTS.brokerDescription),
    brokerUrl: orDefault(row?.broker_url, WEBSITE_DEFAULTS.brokerUrl),
    instagramUrl: orDefault(row?.instagram_url, WEBSITE_DEFAULTS.instagramUrl),
    tiktokUrl: orDefault(row?.tiktok_url, WEBSITE_DEFAULTS.tiktokUrl),
    contactEmail: orDefault(row?.contact_email, WEBSITE_DEFAULTS.contactEmail),
    footerTagline: orDefault(row?.footer_tagline, WEBSITE_DEFAULTS.footerTagline),
    footerCopyright: orDefault(row?.footer_copyright, WEBSITE_DEFAULTS.footerCopyright),
  };
};
