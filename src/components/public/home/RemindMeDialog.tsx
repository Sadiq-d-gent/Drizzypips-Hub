import { zodResolver } from "@hookform/resolvers/zod";
import { BellRing, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { describeReminderError, useSessionReminder } from "@/hooks/useSessionReminder";
import { formatSessionMoment } from "@/lib/website/countdown";
import type { ReminderSubscriptionResult } from "@/types/reminders";

/**
 * "Remind me" beside the homepage countdown.
 *
 * WHAT IT IS ALLOWED TO DECIDE
 * Nothing that matters. It collects an address and shows what the server said. Availability,
 * rate limiting, the session moment the subscription is pointed at and whether an address is
 * already on the list are all answered inside `subscribe_session_reminder()` in 017, against
 * the live row, at the moment of the call. A tab left open while an administrator switches
 * reminders off can still open this dialog; the signup is refused server-side, and the copy
 * for that refusal is the honest one.
 *
 * NOTHING HERE SENDS AN EMAIL, OR SCHEDULES ONE
 * The confirmation is enqueued in the same transaction as the subscription, and the reminder
 * itself is sent by `dispatch_session_reminders()` on the server's schedule. There is no timer
 * in this component and closing the tab has no effect on either, which is the requirement: a
 * browser-based reminder that only fires while a page is open would not be a reminder.
 */

type RemindMeDialogProps = {
  /** The session being counted down to, for the confirmation copy. */
  sessionAt: string;
  /** Hours before the session the email goes out, from website_settings. */
  leadHours: number;
};

/**
 * One field, validated the way adminLoginSchema validates its own.
 *
 * `.trim()` before `.email()` so a pasted address with a trailing space is corrected rather
 * than rejected, and so the value sent matches what 017's regex check will see. This is a
 * courtesy, not a control: the same regex exists as a CHECK constraint on the column, and
 * `describeReminderError` has a branch for the check violation precisely because this schema
 * is not what makes the rule true.
 */
const reminderSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, { message: "Enter your email address." })
    .email({ message: "Enter a valid email address." }),
});

type ReminderInput = z.infer<typeof reminderSchema>;

/**
 * The confirmation, which differs by status but not by much.
 *
 * `already_subscribed` is a success and is worded as one. 017 returns it instead of inserting
 * a second row, so telling a visitor "you are already on the list" is both true and the whole
 * point: pressing the button twice must not produce two emails, and must not look like a
 * failure either.
 */
const confirmationCopy = (
  result: ReminderSubscriptionResult,
  leadHours: number,
): { title: string; body: string } => {
  const moment = formatSessionMoment(result.sessionAt);
  // "the session" rather than a fabricated date, on the same principle as the countdown
  // itself: formatSessionMoment returns "" for anything it cannot read, and a confirmation
  // that named the wrong moment would be worse than one that named none.
  const when = moment ? `the session on ${moment}` : "the session";

  const body = `We'll email you about ${leadHours} ${leadHours === 1 ? "hour" : "hours"} before ${when}. One email, and you can ignore it if plans change.`;

  return result.status === "already_subscribed"
    ? { title: "You're already on the list", body }
    : { title: "Reminder set", body };
};

const RemindMeDialog = ({ sessionAt, leadHours }: RemindMeDialogProps) => {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ReminderSubscriptionResult | null>(null);

  const form = useForm<ReminderInput>({
    resolver: zodResolver(reminderSchema),
    defaultValues: { email: "" },
    mode: "onBlur",
  });

  const subscribe = useSessionReminder();

  /**
   * Reset on close, not on open.
   *
   * A dialog that cleared itself as it appeared would be indistinguishable from this, until the
   * closing animation, during which the form would blank out under the visitor's cursor. This
   * also means a failed attempt keeps the typed address while the dialog stays open, so a
   * visitor hitting the rate limit does not have to type it again to retry.
   */
  useEffect(() => {
    if (!open) {
      form.reset();
      subscribe.reset();
      setResult(null);
    }
    // `form` and `subscribe` are stable across renders; including them would reset on every
    // mutation state change, which is the opposite of the intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /**
   * The session moment changed under an open dialog.
   *
   * An administrator saving a new date invalidates the shared query, so this prop arrives
   * updated mid-session. A confirmation naming the old moment would then be wrong, and 017
   * would have pointed the subscription at the new one anyway, so the confirmation is dropped
   * and the form comes back rather than being quietly left stale.
   */
  useEffect(() => {
    setResult(null);
  }, [sessionAt]);

  const onSubmit = (values: ReminderInput) => {
    subscribe.mutate(values.email, {
      onSuccess: setResult,
    });
  };

  const confirmation = result ? confirmationCopy(result, leadHours) : null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/*
          Hero glass idiom, matching the card it sits in, and `min-h-12` for the same reason
          every other primary control on this site has it: a 48px target is the smallest one
          that is comfortable on a phone.
        */}
        <Button
          type="button"
          variant="outline"
          className="mt-4 min-h-12 w-full border-white/20 bg-white/[0.06] text-white hover:bg-white/[0.12] hover:text-white sm:w-auto"
        >
          <BellRing className="h-4 w-4 shrink-0" aria-hidden="true" />
          Remind me
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        {confirmation ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2
                  className="h-5 w-5 shrink-0 text-success"
                  aria-hidden="true"
                />
                {confirmation.title}
              </DialogTitle>
              <DialogDescription>{confirmation.body}</DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button type="button" className="min-h-12" onClick={() => setOpen(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Get a reminder</DialogTitle>
              <DialogDescription>
                Leave your email address and we'll send one reminder before the session starts.
                Nothing else, and no newsletter.
              </DialogDescription>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          autoComplete="email"
                          inputMode="email"
                          placeholder="you@example.com"
                          className="h-12 rounded-xl"
                          disabled={subscribe.isPending}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/*
                  The server's refusal, rendered as its own block rather than under the field.
                  Neither RM001 nor RM002 is a problem with what was typed, and attaching either
                  to the email input would tell a visitor their address was wrong when it was
                  not. `role="alert"` because it appears after a submission rather than with the
                  form.
                */}
                {subscribe.isError ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm leading-6 text-foreground"
                  >
                    {describeReminderError(subscribe.error)}
                  </p>
                ) : null}

                <DialogFooter>
                  <Button type="submit" className="min-h-12" disabled={subscribe.isPending}>
                    {subscribe.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        Setting up
                      </>
                    ) : (
                      "Remind me"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RemindMeDialog;
