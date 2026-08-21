import type { Database } from "@/types/database.types";

/**
 * Public website content types.
 *
 * Deliberately not in src/types/admin.ts, where the plan first put them. Every field in
 * this table is printed on a public page, and HomeHero, Footer, Signals, Telegram and
 * Broker all need these shapes — so importing them from the admin type module would put
 * an admin-named dependency in the student-facing tree for no reason. Same instinct that
 * keeps `PaymentSettings` in src/types/enrollment.ts rather than in admin.ts.
 */

/**
 * `public.website_settings` as both sides read it.
 *
 * One declaration for the admin form and the public pages, because they read the same row
 * through the same query and the same cache. `id` is absent — it is a constant `true`,
 * useful only as the upsert conflict target — and so is `created_at`, which nothing
 * displays. `updated_at` is kept because it is what remounts the admin form from persisted
 * values after a save, the same trick AdminSettings and AdminCourseEdit use.
 *
 * Derived from the generated row type rather than hand-written, so a column renamed in a
 * migration breaks the typecheck here instead of failing silently at runtime.
 */
export type WebsiteSettingsRow = Omit<
  Database["public"]["Tables"]["website_settings"]["Row"],
  "id" | "created_at"
>;

/**
 * The same row without `updated_at` — the resolver's input.
 *
 * Exists so the admin form can preview its own unsaved values through exactly the code path
 * the public pages use. `WebsiteSettingsRow` is assignable to this, so the query path is
 * unchanged, and so is `WebsiteSettingsInput`, whose fields are `string` where these are
 * `string | null`. Without it the form would have to invent an `updated_at` to satisfy a
 * field the resolver never reads.
 */
export type WebsiteSettingsContent = Omit<WebsiteSettingsRow, "updated_at">;

/** One hero figure. Three of these are rendered, always. */
export type HeroStat = {
  value: string;
  label: string;
};

/**
 * A countdown that is actually configured — the resolved form of the three `countdown_*`
 * columns.
 *
 * There is no `enabled` field, and that is the point of the shape: the switch being off, the
 * session moment being unset, and the stored moment being unreadable are three ways of saying
 * "render nothing", and a consumer that had to check a boolean *and* a nullable date could
 * get that wrong in three places. `WebsiteContent.countdown` is this type or `null`, so the
 * hero's whole disabled path is one falsy check.
 *
 * `targetAt` is a canonical ISO instant, normalised by the resolver, so the component parses
 * a value it can trust rather than whatever is in the column.
 */
export type WebsiteCountdown = {
  title: string;
  targetAt: string;
};

/**
 * The row merged with the compiled-in defaults — what a public page actually renders.
 *
 * Every string field is a plain non-empty `string`, never `string | null`. That is the whole
 * point of the resolver: a null column, a blank column, an empty table, a dropped table and a
 * failed query all arrive here as today's live copy, so no consumer needs a fallback of its
 * own and no page can render an empty hero.
 *
 * `countdown` is the one deliberate exception, because it is the one field with no default to
 * fall back to. There is no honest answer to "when is the next session" when nobody has set
 * one, and a fabricated date would be worse than no countdown — so `null` here means the hero
 * renders nothing, and every failure mode above resolves to `null` rather than to a guess.
 */
export type WebsiteContent = {
  heroTitle: string;
  heroSubtitle: string;
  /** Readonly because consumers only map over it, and the defaults are a frozen literal. */
  heroStats: readonly HeroStat[];
  /** `null` when the countdown is switched off, unset, or unreadable. See WebsiteCountdown. */
  countdown: WebsiteCountdown | null;
  telegramUrl: string;
  /** Falls back to `telegramUrl` while no distinct signal group exists. */
  signalGroupUrl: string;
  brokerName: string;
  brokerDescription: string;
  brokerUrl: string;
  instagramUrl: string;
  tiktokUrl: string;
  contactEmail: string;
  footerTagline: string;
  footerCopyright: string;
};
