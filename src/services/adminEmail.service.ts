import { EMAIL_LOG_LIMIT } from "@/lib/constants/admin";
import { getSupabaseClient } from "@/lib/supabase/client";
import type {
  EmailDelivery,
  EmailLogEntry,
  EmailStatus,
  ReminderStats,
} from "@/types/admin";

/**
 * Read-only views of the email outbox and the reminder list, for administrators.
 *
 * WHAT AUTHORIZES ANY OF THIS
 * Nothing in this file, and nothing new anywhere. 014 and 017 each grant `authenticated` a
 * bare SELECT and attach one policy, `using (public.is_admin())`. `anon` holds no privilege
 * of any kind on either table, both migrations revoke them outright rather than relying on
 * RLS alone, so this module is unreachable from a signed-out bundle and returns nothing to a
 * signed-in non-admin. No migration was needed for this panel and no policy was widened to
 * build it.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * Any write. 014 gives the outbox no INSERT, UPDATE or DELETE policy for any role and says
 * why: "an admin deliberately cannot delete delivery history from the panel". Every writer
 * is a SECURITY DEFINER function or the service-role dispatcher, and retrying a send,
 * requeueing an abandoned row and giving up on one are all functions in 018 granted to
 * service_role alone. This panel reports; it does not operate.
 *
 * WHY THE COUNTS ARE `head` REQUESTS AND NOT ONE RPC
 * `admin_enrollment_stats()` does its five counts in a single scan and an
 * `admin_email_stats()` would be the same shape for these. It is not worth a migration:
 * 013-019 are applied but not yet recorded in `supabase_migrations.schema_migrations`, so
 * every additional file makes that reconciliation larger, and a `head: true` count transfers
 * no rows at all, so the cost here is round trips rather than data. They are issued together
 * in one `Promise.all`, so a page waits for the slowest rather than the sum. If this ever
 * needs to be one request, that RPC is the change, not a wider policy.
 */

/**
 * Counted without being read.
 *
 * `head: true` with `count: "exact"` sends no body back: PostgREST answers from `count(*)`
 * evaluated under the same RLS predicate a SELECT would get. So a non-admin counts zero
 * rather than being refused, which is what RLS does everywhere else in this schema and is
 * why the panel's error branch is about the request failing rather than about permission.
 */
const countOutbox = async (status: EmailStatus): Promise<number> => {
  const { count, error } = await getSupabaseClient()
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .eq("status", status);

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
};

/**
 * Columns the delivery log reads.
 *
 * Named rather than `select *` for the reason the enrollment queries name theirs, and with
 * one column specifically in mind: `payload`. A queued verification email still carries its
 * plaintext code there until 018 redacts it on the same UPDATE that marks the row sent, so
 * selecting it would move that code from "in the database until delivery" to "in a browser
 * tab for as long as it is open". Nothing the log shows needs it.
 *
 * `updated_at` is here only because it is when a `sending` row was claimed, which is the
 * comparison 018's requeue_stuck_emails() makes. See isClaimStale.
 */
const LOG_SELECT = `
  id,
  template,
  to_email,
  status,
  attempts,
  last_error,
  send_after,
  sent_at,
  created_at,
  updated_at
`;

/**
 * The four counts and the newest few rows.
 *
 * Ordered `created_at desc` across every status, which is the read
 * `email_outbox_created_at_idx` exists to serve: 014 created it for "the admin delivery log"
 * by name. The counts have no index behind them and scan the table, which is acceptable at
 * an outbox's scale and is the other half of the argument for an RPC if it ever grows past
 * that.
 */
export const fetchEmailDelivery = async (): Promise<EmailDelivery> => {
  const [queued, sending, sent, failed, logResult] = await Promise.all([
    countOutbox("queued"),
    countOutbox("sending"),
    countOutbox("sent"),
    countOutbox("failed"),
    getSupabaseClient()
      .from("email_outbox")
      .select(LOG_SELECT)
      .order("created_at", { ascending: false })
      .limit(EMAIL_LOG_LIMIT),
  ]);

  if (logResult.error) {
    throw new Error(logResult.error.message);
  }

  return {
    counts: { queued, sending, sent, failed },
    log: (logResult.data ?? []) as unknown as EmailLogEntry[],
  };
};

/** One reminder count, narrowed by whichever of the two filters the caller wants. */
const countReminders = async (
  filter: "all" | "awaiting" | { sessionAt: string },
): Promise<number> => {
  let query = getSupabaseClient()
    .from("session_reminders")
    .select("id", { count: "exact", head: true });

  if (filter === "awaiting") {
    query = query.is("notified_at", null);
  } else if (typeof filter === "object") {
    query = query.is("notified_at", null).eq("session_at", filter.sessionAt);
  }

  const { count, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return count ?? 0;
};

/**
 * Reminder subscriber counts, optionally narrowed to one session.
 *
 * `sessionAt` comes from the `website_settings` row the settings page has already loaded, so
 * this issues no second read of it. When it is null, the countdown is off or no session is
 * set, and `awaitingForSession` stays null rather than becoming zero: "nobody has signed up"
 * and "there is nothing to sign up for" are different facts and the panel says different
 * things about them.
 *
 * The session-scoped count matches the exact instant. 017 stores `session_at` as the value
 * copied from `website_settings`, and `resolveWebsiteSettings` normalises the configured
 * moment to an ISO string, so both sides are the same instant written the same way and `eq`
 * is the right comparison rather than a range.
 */
export const fetchReminderStats = async (
  sessionAt: string | null,
): Promise<ReminderStats> => {
  const [awaiting, total, awaitingForSession] = await Promise.all([
    countReminders("awaiting"),
    countReminders("all"),
    sessionAt ? countReminders({ sessionAt }) : Promise.resolve(null),
  ]);

  return { awaiting, total, awaitingForSession };
};

/**
 * Whether a claimed email has been claimed for longer than a dispatcher should take.
 *
 * `updated_at` rather than `send_after`: a row is stamped `sending` by 018's
 * `claim_email_batch()`, and 014's BEFORE UPDATE trigger moves `updated_at` in the same
 * statement, so for a `sending` row that column *is* the claim time. `send_after` is when
 * the row became due, which for a retry is minutes earlier and for a scheduled reminder
 * could be days.
 *
 * Presentation only, and the copy that uses it says "looks stuck" rather than asserting it.
 * `requeue_stuck_emails()` is what decides a row was abandoned and the only thing that can
 * act on one; this exists so the panel can raise the question without implying it will.
 */
export const isClaimStale = (entry: EmailLogEntry, staleAfterMs: number): boolean => {
  if (entry.status !== "sending") {
    return false;
  }

  const claimedAt = new Date(entry.updated_at).getTime();

  return Number.isFinite(claimedAt) && Date.now() - claimedAt > staleAfterMs;
};

/**
 * Narrowing helper for the `status` column.
 *
 * The generated row type has it as the enum, but a log row is rendered by looking its status
 * up in two constant maps, and a status added by a later migration would index both to
 * `undefined`. This is what lets that row render its raw status in a neutral pill instead of
 * a blank one.
 */
export const isEmailStatus = (value: string): value is EmailStatus =>
  value === "queued" || value === "sending" || value === "sent" || value === "failed";
