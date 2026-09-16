import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  describeVerificationSendError,
  useRequestEmailVerification,
  useVerifyEmailCode,
} from "@/hooks/useEmailVerification";
import {
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_CODE_TTL_MINUTES,
  VERIFIED_WINDOW_HOURS,
} from "@/lib/constants/verification";
import { cn } from "@/lib/utils";

type EmailVerificationPanelProps = {
  email: string;
  /** Expiry of an already-completed verification for THIS address, if there is one. */
  verifiedUntil: string | null;
  /** Set when the server refused a submission with EV002, or when a code expired mid-flow. */
  notice: string | null;
  onVerified: (verifiedUntil: string) => void;
  onContinue: () => void;
  onBack: () => void;
};

/**
 * Seconds until `target`, re-evaluated once a second. Returns 0 once it has passed, and
 * stops the interval rather than ticking forever.
 *
 * Purely presentational. The real cooldown and the real expiry are enforced by
 * request_email_verification() and verify_email_code(), so a wrong clock here costs a
 * failed round trip and nothing else.
 */
const useSecondsUntil = (target: string | null) => {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!target) {
      setSecondsLeft(0);
      return;
    }

    const compute = () =>
      Math.max(0, Math.ceil((new Date(target).getTime() - Date.now()) / 1000));

    setSecondsLeft(compute());

    const id = window.setInterval(() => {
      const next = compute();
      setSecondsLeft(next);

      if (next <= 0) {
        window.clearInterval(id);
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [target]);

  return secondsLeft;
};

const formatDuration = (totalSeconds: number) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

/**
 * Step 2: prove the address, before any payment details are shown.
 *
 * WHY THIS STEP EXISTS BUT DOES NOT ENFORCE ANYTHING
 * A student who skips it entirely, or who edits React state to look verified, is still
 * refused: create_enrollment() calls has_verified_email() and raises EV002 otherwise. The
 * step is here so that refusal happens at the right moment — before the student has been
 * told where to send money — instead of at the very end, after paying.
 *
 * The client-side flag below is therefore a UI convenience, never a gate. It only decides
 * whether this component shows the code field or the "we're done here" card.
 */
const EmailVerificationPanel = ({
  email,
  verifiedUntil,
  notice,
  onVerified,
  onContinue,
  onBack,
}: EmailVerificationPanelProps) => {
  const [code, setCode] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [sent, setSent] = useState<{ expires_at: string; resend_after: string } | null>(null);

  const request = useRequestEmailVerification();
  const verify = useVerifyEmailCode();

  const resendSeconds = useSecondsUntil(sent?.resend_after ?? null);
  const expirySeconds = useSecondsUntil(sent?.expires_at ?? null);

  // An existing verification for this address, still inside its window. Re-derived rather
  // than remembered, so a stale value from a previous session can never present itself as
  // a live one.
  const isAlreadyVerified = useMemo(() => {
    if (!verifiedUntil) {
      return false;
    }

    return new Date(verifiedUntil).getTime() > Date.now();
  }, [verifiedUntil]);

  const handleSend = () => {
    setStatusMessage(null);

    request.mutate(email, {
      onSuccess: (result) => {
        setSent(result);
        setCode("");
        setStatusMessage(`We've sent a ${VERIFICATION_CODE_LENGTH}-digit code to ${email}.`);
      },
      onError: (error) => {
        setStatusMessage(describeVerificationSendError(error));
      },
    });
  };

  const handleVerify = () => {
    if (code.length !== VERIFICATION_CODE_LENGTH) {
      setStatusMessage(`Enter the ${VERIFICATION_CODE_LENGTH}-digit code from your email.`);
      return;
    }

    setStatusMessage(null);

    verify.mutate(
      { email, code },
      {
        onSuccess: (result) => {
          switch (result.status) {
            case "verified":
              if (result.verified_until) {
                onVerified(result.verified_until);
              }
              return;
            case "incorrect":
              setStatusMessage(
                result.attempts_remaining > 0
                  ? `That code isn't right. You have ${result.attempts_remaining} ${result.attempts_remaining === 1 ? "attempt" : "attempts"} left.`
                  : "That code isn't right, and you've used your attempts. Request a new code.",
              );
              return;
            case "expired":
              setStatusMessage("That code has expired. Request a new one.");
              return;
            case "too_many_attempts":
              setStatusMessage(
                "Too many incorrect attempts. Request a new code to try again.",
              );
              return;
            case "no_code":
              setStatusMessage(
                "We don't have a code waiting for this address. Request a new one.",
              );
              return;
          }
        },
        onError: () => {
          setStatusMessage(
            "We couldn't check that code. Please check your connection and try again.",
          );
        },
      },
    );
  };

  if (isAlreadyVerified) {
    return (
      <Card className="rounded-3xl border-border bg-card shadow-premium">
        <CardContent className="p-6 sm:p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success/10 text-success">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </span>

          <h2 className="mt-5 text-xl font-bold tracking-tight text-foreground">
            {email} is verified
          </h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            You're clear to continue. This verification stays valid for about{" "}
            {VERIFIED_WINDOW_HOURS} hours, so you won't need another code to finish this
            enrollment.
          </p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              className="min-h-12 rounded-xl border-border sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back
            </Button>

            <Button type="button" onClick={onContinue} className="btn-premium min-h-12 sm:w-auto">
              Continue to payment
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-3xl border-border bg-card shadow-premium">
      <CardContent className="p-6 sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <ShieldCheck className="h-6 w-6" aria-hidden="true" />
        </span>

        <h2 className="mt-5 text-xl font-bold tracking-tight text-foreground">
          Verify your email address
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          We'll send a {VERIFICATION_CODE_LENGTH}-digit code to{" "}
          <span className="font-medium text-foreground">{email}</span>. Enter it here to
          continue. This keeps your enrollment confirmation and updates going to an address
          you actually control.
        </p>

        {notice ? (
          <div
            role="alert"
            className="mt-6 flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
          >
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
              aria-hidden="true"
            />
            <p className="text-sm leading-6 text-foreground">{notice}</p>
          </div>
        ) : null}

        {email.trim() === "" ? (
          <p className="mt-6 text-sm leading-6 text-destructive">
            We don't have an email address for this enrollment yet. Go back and add one.
          </p>
        ) : !sent ? (
          <Button
            type="button"
            onClick={handleSend}
            disabled={request.isPending}
            className="btn-premium mt-6 min-h-12"
          >
            {request.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" aria-hidden="true" />
                Send me a code
              </>
            )}
          </Button>
        ) : (
          <div className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="enrollment-verification-code"
                className="text-sm font-medium text-foreground"
              >
                Verification code
              </label>

              <InputOTP
                id="enrollment-verification-code"
                value={code}
                onChange={setCode}
                maxLength={VERIFICATION_CODE_LENGTH}
                pattern={REGEXP_ONLY_DIGITS}
                inputMode="numeric"
                autoComplete="one-time-code"
                containerClassName="mt-3"
                disabled={verify.isPending}
              >
                <InputOTPGroup className="gap-2">
                  {Array.from({ length: VERIFICATION_CODE_LENGTH }).map((_, index) => (
                    <InputOTPSlot
                      key={index}
                      index={index}
                      className={cn(
                        "h-12 w-11 rounded-xl border text-lg font-semibold sm:w-12",
                        "border-border bg-card first:border-l",
                      )}
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                onClick={handleVerify}
                disabled={verify.isPending || code.length !== VERIFICATION_CODE_LENGTH}
                className="btn-premium min-h-12 sm:w-auto"
              >
                {verify.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Checking…
                  </>
                ) : (
                  "Verify and continue"
                )}
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleSend}
                disabled={request.isPending || resendSeconds > 0}
                className="min-h-12 rounded-xl border-border sm:w-auto"
              >
                {resendSeconds > 0
                  ? `Resend in ${formatDuration(resendSeconds)}`
                  : request.isPending
                    ? "Sending…"
                    : "Resend code"}
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              {expirySeconds > 0
                ? `This code expires in ${formatDuration(expirySeconds)}.`
                : "This code has expired. Request a new one."}{" "}
              It may take a minute to arrive; check your spam folder if you don't see it.
            </p>
          </div>
        )}

        {/* Announced rather than focused: these are the result of an action the student
            just took, so a screen reader should hear them without losing its place. */}
        <p aria-live="polite" aria-atomic="true" className="sr-only">
          {statusMessage ?? ""}
        </p>

        {statusMessage ? (
          <p className="mt-5 text-sm leading-6 text-muted-foreground">{statusMessage}</p>
        ) : null}

        <div className="mt-8 border-t border-border pt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="-ml-3 min-h-11 rounded-xl text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to your details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EmailVerificationPanel;
