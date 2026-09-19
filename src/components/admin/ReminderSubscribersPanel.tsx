import { AlertTriangle, Info } from "lucide-react";

import AdminStateCard from "@/components/admin/AdminStateCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useReminderStats } from "@/hooks/useAdminEmail";
import { cn } from "@/lib/utils";
import { formatSessionMoment } from "@/lib/website/countdown";
import { resolveWebsiteSettings } from "@/lib/website/resolveWebsiteSettings";
import type { WebsiteCountdown, WebsiteSettingsContent } from "@/types/website";

/**
 * Who is waiting on a session reminder, and whether anything will actually reach them.
 *
 * Read-only, and there is no list of addresses here. The counts come from `head` requests
 * that return no row bodies at all, so a subscriber's email address never enters the page.
 * An administrator has no reason to read the list: 017 gives them no way to remove anyone
 * from it, and the one question the settings form above raises, "if I save this, who gets an
 * email", is a number rather than a list.
 *
 * The panel sits under the countdown fields because every sentence in it is about them. Four
 * separate settings have to agree before a single reminder is sent, and each of the four can
 * be switched independently in the form directly above this.
 */

const HOUR_MS = 60 * 60 * 1000;

type DeliveryNote = {
  tone: "info" | "warning";
  text: string;
};

/**
 * What the current settings mean for the people already on the list.
 *
 * Every branch is one of the early returns in 017's `dispatch_session_reminders()`, in the
 * order that function checks them: the countdown switch, a session moment, the reminders
 * switch, then the lead window. Nothing here is inferred from behaviour, and nothing here
 * decides anything either — the function re-reads the live row when it runs.
 *
 * `now` is a parameter for the same reason `countdownBreakdown` takes one: it makes the
 * function pure, and the state it reports is a fact about a moment rather than about a render.
 *
 * Every refusal says what happens to the waiting list, because that is the question the
 * warning raises and the answer is reassuring in all three cases: pending rows are never
 * discarded. They keep `notified_at` null, survive every refusal, and are re-pointed at the
 * next session by 017's reschedule trigger.
 */
const describeDelivery = (
  countdown: WebsiteCountdown | null,
  countdownEnabled: boolean,
  awaiting: number,
  now: number,
): DeliveryNote => {
  const waiting = `${awaiting.toLocaleString("en-US")} ${awaiting === 1 ? "person" : "people"}`;

  if (!countdown) {
    return {
      tone: "warning",
      text: countdownEnabled
        ? "No session moment is set above, so there is nothing to remind anyone about and nothing will be sent. Everyone waiting stays on the list."
        : "The countdown is switched off, so nothing will be sent. Everyone waiting stays on the list, and is emailed for the next session you switch it on for.",
    };
  }

  if (!countdown.remindersEnabled) {
    return {
      tone: "warning",
      text: `Reminders are switched off, so nothing will be sent, including to the ${waiting} already waiting. Switching them back on before the session starts resumes the send.`,
    };
  }

  const target = new Date(countdown.targetAt).getTime();
  const opensAt = target - countdown.reminderLeadHours * HOUR_MS;

  if (now >= target) {
    return {
      tone: "warning",
      text: "The session moment has passed, so the window has closed and nothing further will be sent for it. Setting the next date above reopens it for everyone still waiting.",
    };
  }

  if (now < opensAt) {
    return {
      tone: "info",
      text: `Reminders go out from ${formatSessionMoment(new Date(opensAt).toISOString())}, which is ${countdown.reminderLeadHours} hours before the session.`,
    };
  }

  return {
    tone: "info",
    text: `The sending window is open. The next scheduled run emails the ${waiting} still waiting, then marks them done so nobody is emailed twice.`,
  };
};

type FigureProps = {
  label: string;
  value: number;
  hint: string;
};

const Figure = ({ label, value, hint }: FigureProps) => (
  <Card className="h-full rounded-2xl border-border bg-card">
    <CardContent className="p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">
        {value.toLocaleString("en-US")}
      </p>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p>
    </CardContent>
  </Card>
);

type ReminderSubscribersPanelProps = {
  /**
   * The saved row, not the form's current values.
   *
   * Deliberately the persisted settings: the counts describe what the server would do if the
   * dispatcher ran now, and the server reads this table. Showing them against unsaved edits
   * would describe a state that does not exist yet.
   */
  settings: WebsiteSettingsContent | null;
};

const ReminderSubscribersPanel = ({ settings }: ReminderSubscribersPanelProps) => {
  // Through the resolver rather than off the raw columns, so this panel and the public hero
  // agree on what "there is a session" means, including the cases the column types allow but
  // the product does not: enabled with no moment, and a moment that will not parse.
  const { countdown } = resolveWebsiteSettings(settings);

  const { data, isLoading, isError, refetch, isFetching } = useReminderStats(
    countdown?.targetAt ?? null,
  );

  if (isLoading) {
    return (
      <div aria-hidden="true">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
        <Skeleton className="mt-4 h-20 rounded-2xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <AdminStateCard
        icon={AlertTriangle}
        title="Couldn't load the reminder list"
        description="Something went wrong reading the subscriber counts. Nobody's subscription is affected and reminders are unaffected, please try again."
        tone="destructive"
      >
        <Button
          className="btn-premium min-h-11"
          disabled={isFetching}
          onClick={() => {
            void refetch();
          }}
        >
          {isFetching ? "Trying…" : "Try again"}
        </Button>
      </AdminStateCard>
    );
  }

  const note = describeDelivery(
    countdown,
    Boolean(settings?.countdown_enabled),
    data.awaiting,
    Date.now(),
  );

  // A gap means some pending rows still carry an earlier date. They are still emailed about
  // the session configured above — 017's dispatch selects on `notified_at is null` and nothing
  // else, and stamps the outbox key with the *current* session moment — so this is worth
  // stating precisely rather than raising as a problem with the send.
  const strandedCount =
    data.awaitingForSession === null ? 0 : data.awaiting - data.awaitingForSession;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure
          label="Awaiting a reminder"
          value={data.awaiting}
          hint="Everyone who has signed up and not yet been emailed. This is the number the next send goes to."
        />

        {/*
          Rendered as a dash rather than a zero when no session is configured. "Nobody has
          signed up for this session" and "there is no session to sign up for" are different
          facts, and a 0 states the first when the second is true.
        */}
        {data.awaitingForSession === null ? (
          <Card className="h-full rounded-2xl border-border bg-card">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Signed up for this session</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-muted-foreground">—</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                No session is configured above, so there is nothing to count against.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Figure
            label="Signed up for this session"
            value={data.awaitingForSession}
            hint="Of those waiting, the ones whose signup points at the date currently saved above."
          />
        )}

        <Figure
          label="Signed up in total"
          value={data.total}
          hint="Every subscription ever taken, including the ones already emailed. Nothing is deleted from this list."
        />
      </div>

      <div
        className={cn(
          "mt-4 flex items-start gap-3 rounded-2xl border p-5",
          note.tone === "warning"
            ? "border-warning/40 bg-warning/10"
            : "border-border bg-muted/30",
        )}
      >
        <Info
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            note.tone === "warning" ? "text-warning" : "text-muted-foreground",
          )}
          aria-hidden="true"
        />
        <p className="text-sm leading-6 text-muted-foreground">{note.text}</p>
      </div>

      {strandedCount > 0 ? (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {strandedCount.toLocaleString("en-US")} of them signed up under an earlier date. They
          are still emailed about the session saved above, so there is nothing to fix here.
        </p>
      ) : null}
    </div>
  );
};

export default ReminderSubscribersPanel;
