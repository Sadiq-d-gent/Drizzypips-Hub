import { format } from "date-fns";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Info,
  type LucideIcon,
  Send,
  XCircle,
} from "lucide-react";

import AdminStateCard from "@/components/admin/AdminStateCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailDelivery } from "@/hooks/useAdminEmail";
import {
  EMAIL_LOG_LIMIT,
  EMAIL_MAX_ATTEMPTS,
  EMAIL_STATUS_LABELS,
  EMAIL_STATUS_TONES,
  EMAIL_STUCK_AFTER_MINUTES,
  EMAIL_TEMPLATE_LABELS,
} from "@/lib/constants/admin";
import { cn } from "@/lib/utils";
import { isClaimStale, isEmailStatus } from "@/services/adminEmail.service";
import type { EmailLogEntry } from "@/types/admin";

/**
 * What the system has tried to send, and what became of it.
 *
 * Every email this product sends is written to `email_outbox` by the database first and
 * delivered afterwards by the send-email function, which is what makes a verification code,
 * an enrollment decision and a session reminder survive a provider outage instead of being
 * lost inside the request that triggered them. This panel is the only view of that table, so
 * it is where "did the student get the email" is answered.
 *
 * NOTHING HERE WRITES
 * 014 gives the outbox no INSERT, UPDATE or DELETE policy for any role, deliberately: delivery
 * history is a record, and an administrator who could delete a failure could hide one. Retry,
 * requeue and give-up all live in 018 and are granted to the dispatcher alone. So there is no
 * button on any row, and the panel says so rather than leaving someone looking for one.
 *
 * NO MESSAGE BODIES
 * The log shows who an email was addressed to and what template it used, never its payload.
 * A queued verification email still holds its plaintext code there until delivery redacts it.
 */

const STUCK_AFTER_MS = EMAIL_STUCK_AFTER_MINUTES * 60 * 1000;

const at = (iso: string) => {
  const moment = new Date(iso);

  return Number.isNaN(moment.getTime()) ? "an unrecorded time" : format(moment, "d MMM yyyy, HH:mm");
};

/**
 * The one timestamp that matters for a row, phrased for its status.
 *
 * Each status has a different answer to "when": a delivered email has a delivery time, a
 * claimed one has a claim time, and a queued one has either a future due time or the moment it
 * was written. Showing all four columns on every row would make the reader work out which one
 * applies.
 */
const describeTiming = (entry: EmailLogEntry, now: number): string => {
  // Widened for the same reason LogRow widens it, and it matters more here. A status added by
  // a later migration would otherwise fall through to the queued arm and be described as a
  // retry that is waiting to go out, which is a claim about a row nothing here understands.
  const status: string = entry.status;

  switch (status) {
    case "sent":
      return entry.sent_at ? `Delivered ${at(entry.sent_at)}` : "Delivered";

    case "sending":
      return `Picked up for sending ${at(entry.updated_at)}`;

    case "failed":
      return `Failed after ${entry.attempts} ${entry.attempts === 1 ? "attempt" : "attempts"}, last tried ${at(entry.updated_at)}`;

    case "queued": {
      const dueAt = new Date(entry.send_after).getTime();

      if (Number.isFinite(dueAt) && dueAt > now) {
        return `Waiting until ${at(entry.send_after)}`;
      }

      // A queued row with attempts on it is a retry, not a first send: 018 puts a failed
      // delivery back in the queue until it reaches EMAIL_MAX_ATTEMPTS.
      if (entry.attempts > 0) {
        return `Retrying, ${entry.attempts} of ${EMAIL_MAX_ATTEMPTS} attempts used`;
      }

      return `Queued ${at(entry.created_at)}`;
    }

    default:
      // The one thing true of an unrecognised row is when it last changed. Say that, and let
      // the raw status in the pill beside it carry the rest.
      return `Last updated ${at(entry.updated_at)}`;
  }
};

type CountTile = {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  surface: string;
  tone: string;
};

const LogRow = ({ entry, now }: { entry: EmailLogEntry; now: number }) => {
  // Widened deliberately. The row type says this is the enum, but the rows are cast at the
  // service boundary, so a status added by a later migration would arrive here and index both
  // constant maps to undefined. Widening lets the guard do its job and the row degrade to its
  // raw value instead of rendering an empty pill.
  const rawStatus: string = entry.status;
  const known = isEmailStatus(rawStatus);

  const stale = isClaimStale(entry, STUCK_AFTER_MS);

  return (
    <li className="flex flex-col gap-2 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {EMAIL_TEMPLATE_LABELS[entry.template] ?? entry.template}
        </p>
        <p className="mt-1 break-all text-sm text-muted-foreground">{entry.to_email}</p>
        <p className="mt-1 text-sm text-muted-foreground">{describeTiming(entry, now)}</p>

        {/*
          The provider's own words, shown only on a row that failed. It is the difference
          between "the address does not exist" and "our API key is wrong", and neither is
          guessable from the status.
        */}
        {entry.status === "failed" && entry.last_error ? (
          <p className="mt-2 break-words rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs leading-5 text-muted-foreground">
            {entry.last_error}
          </p>
        ) : null}

        {stale ? (
          <p className="mt-2 text-xs leading-5 text-warning">
            This has been sending for over {EMAIL_STUCK_AFTER_MINUTES} minutes, which usually
            means a send was interrupted. The dispatcher puts rows like this back in the queue
            on its next run.
          </p>
        ) : null}
      </div>

      <span
        className={cn(
          "shrink-0 self-start rounded-xl border px-3 py-1 text-xs font-medium",
          known
            ? EMAIL_STATUS_TONES[rawStatus as keyof typeof EMAIL_STATUS_TONES]
            : "border-border bg-muted text-muted-foreground",
        )}
      >
        {known
          ? EMAIL_STATUS_LABELS[rawStatus as keyof typeof EMAIL_STATUS_LABELS]
          : rawStatus}
      </span>
    </li>
  );
};

const EmailDeliveryPanel = () => {
  const { data, isLoading, isError, refetch, isFetching } = useEmailDelivery();

  if (isLoading) {
    return (
      <div aria-hidden="true">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="mt-4 h-64 rounded-3xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <AdminStateCard
        icon={AlertTriangle}
        title="Couldn't load the delivery log"
        description="Something went wrong reading the outbox. No email is affected by this, queued messages are still queued and sending carries on. Please try again."
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

  const { counts, log } = data;
  const total = counts.queued + counts.sending + counts.sent + counts.failed;
  const now = Date.now();

  const tiles: readonly CountTile[] = [
    {
      key: "queued",
      label: EMAIL_STATUS_LABELS.queued,
      value: counts.queued,
      icon: Clock,
      surface: counts.queued > 0 ? "border-warning/30 bg-warning/5" : "border-border bg-card",
      tone: "text-warning",
    },
    {
      key: "sending",
      label: EMAIL_STATUS_LABELS.sending,
      value: counts.sending,
      icon: Send,
      surface: "border-border bg-card",
      tone: "text-primary",
    },
    {
      key: "sent",
      label: EMAIL_STATUS_LABELS.sent,
      value: counts.sent,
      icon: CheckCircle2,
      surface: "border-border bg-card",
      tone: "text-success",
    },
    {
      key: "failed",
      label: EMAIL_STATUS_LABELS.failed,
      value: counts.failed,
      icon: XCircle,
      surface:
        counts.failed > 0 ? "border-destructive/30 bg-destructive/5" : "border-border bg-card",
      tone: "text-destructive",
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.key} className={cn("h-full rounded-2xl", tile.surface)}>
            <CardContent className="flex h-full items-center gap-3 p-4">
              <div
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background/60",
                  tile.tone,
                )}
              >
                <tile.icon className="h-4 w-4" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">{tile.label}</p>
                <p className="mt-0.5 text-2xl font-bold tracking-tight text-foreground">
                  {tile.value.toLocaleString("en-US")}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/*
        Queued messages with nothing ever delivered is the one shape that means the system is
        working and the delivery half is not: the database is doing its job, the sender is not
        running. Worth naming, because every other symptom of it, a student saying no code
        arrived, points at the wrong half.
      */}
      {counts.queued > 0 && counts.sent === 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-5">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          <p className="text-sm leading-6 text-muted-foreground">
            Emails are collecting here and none has been delivered yet. Messages are written by
            the site and sent afterwards by a scheduled background job, so this is what it looks
            like before that job is set up and running. Nothing is lost while it waits.
          </p>
        </div>
      ) : null}

      {counts.failed > 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
          <p className="text-sm leading-6 text-muted-foreground">
            {counts.failed.toLocaleString("en-US")}{" "}
            {counts.failed === 1 ? "message was" : "messages were"} given up on after{" "}
            {EMAIL_MAX_ATTEMPTS} attempts and will not be retried. The reason is on each row
            below. If it names the address, contact the student directly.
          </p>
        </div>
      ) : null}

      <Card className="mt-4 rounded-3xl border-border bg-card">
        <CardContent className="p-6">
          {log.length === 0 ? (
            <AdminStateCard
              icon={Inbox}
              title="No emails yet"
              description="Verification codes, enrollment decisions and session reminders all appear here once the site starts sending them."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold tracking-tight text-foreground">Most recent</h3>
                <p className="text-sm text-muted-foreground">
                  {total > EMAIL_LOG_LIMIT
                    ? `Showing the newest ${log.length} of ${total.toLocaleString("en-US")}`
                    : `${total.toLocaleString("en-US")} in total`}
                </p>
              </div>

              <ul className="mt-2">
                {log.map((entry) => (
                  <LogRow key={entry.id} entry={entry} now={now} />
                ))}
              </ul>
            </>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        This is a record, so there is nothing to edit here. Sending, retrying and giving up are
        all handled automatically, and delivery history is kept rather than cleared.
      </p>
    </div>
  );
};

export default EmailDeliveryPanel;
