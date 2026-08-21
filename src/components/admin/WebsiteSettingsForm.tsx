import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CalendarClock, Eye, Info, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { WEBSITE_DEFAULTS } from "@/lib/constants/homepage";
import {
  combineSessionDateTime,
  countdownBreakdown,
  formatSessionMoment,
  splitSessionDateTime,
} from "@/lib/website/countdown";
import { resolveWebsiteSettings } from "@/lib/website/resolveWebsiteSettings";
import { WebsiteSettingsInput, websiteSettingsSchema } from "@/lib/validation/settings.schema";
import type { WebsiteSettingsContent, WebsiteSettingsRow } from "@/types/website";

type WebsiteSettingsFormProps = {
  /** The single website_settings row, or null when it does not exist yet. */
  settings: WebsiteSettingsRow | null;
  isSubmitting: boolean;
  onSubmit: (values: WebsiteSettingsInput) => void;
};

/**
 * The public copy and outbound links, editable without a deploy.
 *
 * EVERY FIELD IS OPTIONAL, AND BLANK IS A REAL ANSWER
 * A cleared field is stored as NULL and the site falls back to the value it shipped with, so
 * an empty form is valid and renders the homepage exactly as it is today. Each input's
 * placeholder is that compiled-in default, which is how an administrator can see what they
 * are overriding before they type. Nothing here can produce a blank hero.
 *
 * NO CONFIRMATION DIALOG, UNLIKE SiteSettingsForm
 * That form asks before saving because a pause closes the site to every prospective student.
 * Nothing on this card is destructive: the worst a mistake does is show the wrong headline
 * until it is corrected, and clearing a field restores the default rather than emptying the
 * page.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * The support WhatsApp number, which lives in `payment_settings` and is edited on the Payment
 * details card above — two places to set the number students contact after paying would be two
 * sources of truth. The broker logo and its four benefit chips, which are part of the page
 * design. The testimonials, which are real and consented.
 *
 * THE COUNTDOWN IS THE ONE FIELD THAT IS NOT OPTIONAL
 * Not the whole group — the switch defaults to off and an untouched form is still valid — but
 * once it is on, the date and time have to be there. It is the only thing on this card with
 * nothing to fall back to: every other blank means "use the copy the site shipped with", and
 * there is no shipped answer to when the next session is. See the second superRefine in
 * websiteSettingsSchema.
 */
const EMPTY_WEBSITE_SETTINGS: WebsiteSettingsInput = {
  hero_title: "",
  hero_subtitle: "",
  hero_stat_1_value: "",
  hero_stat_1_label: "",
  hero_stat_2_value: "",
  hero_stat_2_label: "",
  hero_stat_3_value: "",
  hero_stat_3_label: "",
  /** Off, matching the column default in 012 — a new install has no session scheduled. */
  countdown_enabled: false,
  countdown_title: "",
  countdown_session_date: "",
  countdown_session_time: "",
  telegram_url: "",
  signal_group_url: "",
  broker_name: "",
  broker_description: "",
  broker_url: "",
  instagram_url: "",
  tiktok_url: "",
  contact_email: "",
  footer_tagline: "",
  footer_copyright: "",
};

/**
 * Row to form values.
 *
 * Every column becomes `""` when null, because that is what an empty text input holds — and
 * `""` is also what the form must show for an unset field, so the placeholder default is
 * visible. saveWebsiteSettings converts back, so a cleared field is stored as NULL rather
 * than an empty string; that distinction is the whole fallback mechanism.
 *
 * Written out rather than derived, so a column renamed in a later migration breaks the
 * typecheck here instead of quietly dropping a field from the form.
 *
 * The countdown moment is the one column that does not map to a field of the same name: it is
 * stored as a single instant and edited as a date and a time, so it is split here and rejoined
 * in saveWebsiteSettings. `splitSessionDateTime` is the exact inverse of the function that
 * built it, so opening this form and saving it untouched stores the same moment.
 */
const toFormValues = (settings: WebsiteSettingsRow | null): WebsiteSettingsInput => {
  if (!settings) {
    return EMPTY_WEBSITE_SETTINGS;
  }

  const session = splitSessionDateTime(settings.countdown_session_at);

  return {
    hero_title: settings.hero_title ?? "",
    hero_subtitle: settings.hero_subtitle ?? "",
    hero_stat_1_value: settings.hero_stat_1_value ?? "",
    hero_stat_1_label: settings.hero_stat_1_label ?? "",
    hero_stat_2_value: settings.hero_stat_2_value ?? "",
    hero_stat_2_label: settings.hero_stat_2_label ?? "",
    hero_stat_3_value: settings.hero_stat_3_value ?? "",
    hero_stat_3_label: settings.hero_stat_3_label ?? "",
    countdown_enabled: settings.countdown_enabled,
    countdown_title: settings.countdown_title ?? "",
    countdown_session_date: session.date,
    countdown_session_time: session.time,
    telegram_url: settings.telegram_url ?? "",
    signal_group_url: settings.signal_group_url ?? "",
    broker_name: settings.broker_name ?? "",
    broker_description: settings.broker_description ?? "",
    broker_url: settings.broker_url ?? "",
    instagram_url: settings.instagram_url ?? "",
    tiktok_url: settings.tiktok_url ?? "",
    contact_email: settings.contact_email ?? "",
    footer_tagline: settings.footer_tagline ?? "",
    footer_copyright: settings.footer_copyright ?? "",
  };
};

/**
 * Form values in the shape the resolver reads.
 *
 * Every field but two is already a column, so it passes straight through. The session date and
 * time are joined into the single instant the row holds using `combineSessionDateTime` — the
 * very function `saveWebsiteSettings` calls on the way out — which is what makes the preview
 * below trustworthy: an impossible date resolves to no countdown here for exactly the reason it
 * would store as NULL and render nothing there.
 */
const toPreviewContent = ({
  countdown_session_date: sessionDate,
  countdown_session_time: sessionTime,
  ...columns
}: WebsiteSettingsInput): WebsiteSettingsContent => ({
  ...columns,
  countdown_session_at: combineSessionDateTime(sessionDate, sessionTime),
});

/**
 * The three hero figures, paired with the default each one falls back to.
 *
 * `as const` keeps the field names literal so they typecheck as form paths, and pairing the
 * default here rather than indexing WEBSITE_DEFAULTS.heroStats at render time keeps the
 * mapping between slot and default in one visible place.
 */
const HERO_STAT_SLOTS = [
  {
    valueName: "hero_stat_1_value",
    labelName: "hero_stat_1_label",
    defaults: WEBSITE_DEFAULTS.heroStats[0],
  },
  {
    valueName: "hero_stat_2_value",
    labelName: "hero_stat_2_label",
    defaults: WEBSITE_DEFAULTS.heroStats[1],
  },
  {
    valueName: "hero_stat_3_value",
    labelName: "hero_stat_3_label",
    defaults: WEBSITE_DEFAULTS.heroStats[2],
  },
] as const;

/** Shared input styling, matching PaymentSettingsForm and SiteSettingsForm. */
const INPUT_CLASS = "h-12 rounded-xl border-border bg-card";
const TEXTAREA_CLASS = "rounded-xl border-border bg-card";

/**
 * One labelled group inside the single form.
 *
 * A real `fieldset`/`legend` rather than a heading and a div, because these are six groups of
 * related controls within one form — the case the element exists for. AdminSection is not
 * reused here: that renders an `h2` and belongs to a page, and this whole form is already
 * inside one of them.
 */
const FieldGroup = ({
  title,
  hint,
  divided = false,
  children,
}: {
  title: string;
  hint: string;
  divided?: boolean;
  children: ReactNode;
}) => (
  <fieldset className={divided ? "min-w-0 border-t border-border pt-8" : "min-w-0"}>
    <legend className="text-sm font-semibold text-foreground">{title}</legend>
    <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    <div className="mt-6 space-y-6">{children}</div>
  </fieldset>
);

const WebsiteSettingsForm = ({
  settings,
  isSubmitting,
  onSubmit,
}: WebsiteSettingsFormProps) => {
  const form = useForm<WebsiteSettingsInput>({
    resolver: zodResolver(websiteSettingsSchema),
    defaultValues: toFormValues(settings),
    mode: "onBlur",
  });

  /**
   * The unsaved form values run through the very function the public pages use.
   *
   * This is why resolveWebsiteSettings takes `WebsiteSettingsContent` rather than a full row:
   * the form's values are assignable to it, so the preview cannot drift from what a visitor
   * gets — including the blank-means-default rule and the signal-group fallback. Watching the
   * whole object re-renders the card on each keystroke, which is what makes it live and is
   * affordable on a form this size.
   */
  const preview = resolveWebsiteSettings(toPreviewContent(form.watch()));

  const countdownEnabled = form.watch("countdown_enabled");

  /**
   * How far off the configured session is, as of this render.
   *
   * Not on a timer, deliberately. This is a form, and a preview that ticked once a second
   * would move under an administrator who is reading the field above it; the hero is where a
   * live clock belongs. Recomputed on each keystroke, which is close enough to answer the only
   * question being asked here — is this the moment I meant, and has it already passed.
   *
   * `null` whenever there is no countdown to describe, which is the same condition that makes
   * the hero render nothing.
   */
  const countdownRemaining = preview.countdown
    ? countdownBreakdown(preview.countdown.targetAt, Date.now())
    : null;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8" noValidate>
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm leading-6 text-muted-foreground">
            Every text field is optional. Each one shows the site&apos;s current default as its
            placeholder — leave it blank to keep that default, or type over it to replace it
            everywhere it appears. Clearing a field you have set restores the default rather
            than leaving a gap. The one exception is the session countdown, which needs a date
            and a time while it is switched on, because there is no sensible default for when
            the next session is.
          </p>
        </div>

        <FieldGroup
          title="Hero"
          hint="The first thing a visitor reads, at the top of the homepage."
        >
          <FormField
            control={form.control}
            name="hero_title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Headline</FormLabel>
                <FormControl>
                  <Input {...field} placeholder={WEBSITE_DEFAULTS.heroTitle} className={INPUT_CLASS} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="hero_subtitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Supporting paragraph</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder={WEBSITE_DEFAULTS.heroSubtitle}
                    className={TEXTAREA_CLASS}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">The three figures</p>
            <p className="text-sm text-muted-foreground">
              A figure needs its label and a label needs its figure — fill both or leave both
              blank. Keep figures short; they render large, three across.
            </p>

            <div className="grid gap-6 pt-2 sm:grid-cols-3">
              {HERO_STAT_SLOTS.map((slot) => (
                <div key={slot.valueName} className="min-w-0 space-y-4">
                  <FormField
                    control={form.control}
                    name={slot.valueName}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Figure</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            autoComplete="off"
                            placeholder={slot.defaults.value}
                            className={INPUT_CLASS}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name={slot.labelName}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Label</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            autoComplete="off"
                            placeholder={slot.defaults.label}
                            className={INPUT_CLASS}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>
          </div>

          {/*
            The hero as a visitor gets it, resolved through the public code path — so a blank
            field previews its default rather than previewing nothing.
          */}
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">
                What visitors see at the top of the homepage
              </p>
            </div>

            <p className="mt-4 text-lg font-semibold leading-snug text-foreground">
              {preview.heroTitle}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {preview.heroSubtitle}
            </p>

            <dl className="mt-5 grid grid-cols-3 gap-4">
              {preview.heroStats.map((stat, index) => (
                <div key={index} className="flex min-w-0 flex-col-reverse">
                  <dt className="mt-1 text-xs leading-5 text-muted-foreground">{stat.label}</dt>
                  <dd className="text-2xl font-bold text-foreground">{stat.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </FieldGroup>

        <FieldGroup
          divided
          title="Next mentorship session"
          hint="A live countdown in the homepage hero, under the two buttons. Switched off by default — nothing appears on the site until you turn it on."
        >
          <FormField
            control={form.control}
            name="countdown_enabled"
            render={({ field }) => (
              <FormItem className="flex flex-row items-start justify-between gap-6 rounded-2xl border border-border bg-card p-5">
                <div className="min-w-0 space-y-1">
                  <FormLabel className="text-base">Show the countdown</FormLabel>
                  <FormDescription>
                    {countdownEnabled
                      ? "The hero counts down to the date and time below, in each visitor's own timezone."
                      : "The hero shows no countdown. The date below is kept either way, so a session can be scheduled now and published later."}
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-label="Show the countdown"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="countdown_title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Heading</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={WEBSITE_DEFAULTS.countdownTitle}
                    className={INPUT_CLASS}
                  />
                </FormControl>
                <FormDescription>
                  Sits on one line above the four numbers. Keep it short — on a phone it wraps
                  after about forty characters.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="countdown_session_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session date</FormLabel>
                  <FormControl>
                    <Input {...field} type="date" className={INPUT_CLASS} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="countdown_session_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start time</FormLabel>
                  <FormControl>
                    <Input {...field} type="time" className={INPUT_CLASS} />
                  </FormControl>
                  <FormDescription>
                    Read as your own local time. The preview below repeats it back with the
                    timezone attached, so you can check that is what you meant.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/*
            Resolved through the public code path like the hero preview above, so this card is
            empty under exactly the conditions that make a visitor's hero show nothing.
          */}
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">
                What visitors see under the hero buttons
              </p>
            </div>

            {preview.countdown && countdownRemaining ? (
              <>
                <p className="mt-4 text-sm font-semibold text-foreground">
                  {preview.countdown.title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatSessionMoment(preview.countdown.targetAt)}
                </p>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">
                  {countdownRemaining.reached ? (
                    "The hero reads “Session is starting” — it counts down to zero and stops there rather than showing negative numbers."
                  ) : (
                    <>
                      Counting down from{" "}
                      <span className="font-medium text-foreground">
                        {countdownRemaining.days} days, {countdownRemaining.hours} hours and{" "}
                        {countdownRemaining.minutes} minutes
                      </span>{" "}
                      as of now, to the second.
                    </>
                  )}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {countdownEnabled
                  ? "Nothing yet. Fill in the date and time above and this will show what the hero will."
                  : "Nothing. The countdown is switched off, so the hero looks exactly as it does today."}
              </p>
            )}
          </div>

          {/*
            A warning rather than a validation error, and that is the deliberate choice. The
            schema refuses a switch with no moment, but not a moment in the past: the hero has a
            defined state for it, and refusing it would mean that months after a session an
            administrator could not save an unrelated footer edit without first clearing a field
            they were not thinking about. So this says what will happen and leaves the decision
            where it belongs.
          */}
          {countdownRemaining?.reached ? (
            <div className="flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <p className="text-sm leading-6 text-muted-foreground">
                That moment has already passed. Saving is fine — the hero will say the session is
                starting rather than count backwards — but if the session is over, set the next
                date or switch the countdown off.
              </p>
            </div>
          ) : null}
        </FieldGroup>

        <FieldGroup
          divided
          title="Community links"
          hint="Where the Telegram and Signals pages send people."
        >
          <FormField
            control={form.control}
            name="telegram_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telegram channel</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="url"
                    autoComplete="off"
                    placeholder={WEBSITE_DEFAULTS.telegramUrl}
                    className={INPUT_CLASS}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="signal_group_url"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Signal group</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="url"
                    autoComplete="off"
                    placeholder={preview.telegramUrl}
                    className={INPUT_CLASS}
                  />
                </FormControl>
                <FormDescription>
                  The only field that falls back to another rather than to a fixed default:
                  left blank, the Signals page uses the Telegram channel above (
                  {preview.telegramUrl}), which is what it did before this could be set
                  separately.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldGroup>

        <FieldGroup
          divided
          title="Broker"
          hint="The recommended broker, on the homepage and the Broker page. Its logo and the four benefit chips are part of the page design and stay in the code."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="broker_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Broker name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder={WEBSITE_DEFAULTS.brokerName}
                      className={INPUT_CLASS}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="broker_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sign-up link</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="url"
                      autoComplete="off"
                      placeholder={WEBSITE_DEFAULTS.brokerUrl}
                      className={INPUT_CLASS}
                    />
                  </FormControl>
                  <FormDescription>
                    The affiliate link. Check it after changing it — a wrong one still opens a
                    broker, just not yours.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="broker_description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Why you recommend it</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder={WEBSITE_DEFAULTS.brokerDescription}
                    className={TEXTAREA_CLASS}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldGroup>

        <FieldGroup
          divided
          title="Contact and socials"
          hint="In the footer, on every page. The support WhatsApp number is not here — it is on the Payment details card above, so there is one number students contact."
        >
          <div className="grid gap-6 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="instagram_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Instagram</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="url"
                      autoComplete="off"
                      placeholder={WEBSITE_DEFAULTS.instagramUrl}
                      className={INPUT_CLASS}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tiktok_url"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>TikTok</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="url"
                      autoComplete="off"
                      placeholder={WEBSITE_DEFAULTS.tiktokUrl}
                      className={INPUT_CLASS}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="contact_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contact email</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="off"
                    placeholder={WEBSITE_DEFAULTS.contactEmail}
                    className={INPUT_CLASS}
                  />
                </FormControl>
                <FormDescription>
                  Published in the footer as a mail link, so use an address you actually read.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldGroup>

        <FieldGroup divided title="Footer" hint="The last thing on every page.">
          <FormField
            control={form.control}
            name="footer_tagline"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tagline</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={3}
                    placeholder={WEBSITE_DEFAULTS.footerTagline}
                    className={TEXTAREA_CLASS}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="footer_copyright"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Copyright line</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder={WEBSITE_DEFAULTS.footerCopyright}
                    className={INPUT_CLASS}
                  />
                </FormControl>
                <FormDescription>
                  Left blank this keeps the year current on its own. Set it and the year is
                  yours to update.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FieldGroup>

        <Button type="submit" className="btn-premium min-h-12" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving
            </>
          ) : (
            "Save website content"
          )}
        </Button>
      </form>
    </Form>
  );
};

export default WebsiteSettingsForm;
