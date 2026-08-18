import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { STUDENT_NOTE_MAX } from "@/lib/constants/enrollment";
import {
  EnrollmentDetailsInput,
  enrollmentDetailsSchema,
} from "@/lib/validation/enrollment.schema";

type EnrollmentDetailsFormProps = {
  defaultValues: EnrollmentDetailsInput;
  onSubmit: (values: EnrollmentDetailsInput) => void;
};

/**
 * Step 1: who is enrolling.
 *
 * Validation runs on blur rather than on every keystroke, so a half-typed email is not
 * flagged as invalid while it is still being typed. react-hook-form wires each message
 * to its input with aria-describedby/aria-invalid through the shadcn Form primitives.
 */
const EnrollmentDetailsForm = ({ defaultValues, onSubmit }: EnrollmentDetailsFormProps) => {
  const form = useForm<EnrollmentDetailsInput>({
    resolver: zodResolver(enrollmentDetailsSchema),
    defaultValues,
    mode: "onBlur",
  });

  const noteLength = form.watch("studentNote")?.length ?? 0;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
        <FormField
          control={form.control}
          name="studentName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  autoComplete="name"
                  placeholder="Ada Lovelace"
                  className="h-12 rounded-xl border-border bg-card"
                />
              </FormControl>
              <FormDescription>Use the name that appears on your payment.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="studentEmail"
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
                  className="h-12 rounded-xl border-border bg-card"
                />
              </FormControl>
              <FormDescription>We'll send your enrollment updates here.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="studentPhone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>WhatsApp number</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+234 903 585 3860"
                  className="h-12 rounded-xl border-border bg-card"
                />
              </FormControl>
              <FormDescription>Include your country code.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="studentNote"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Note <span className="text-muted-foreground">(optional)</span>
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  rows={4}
                  maxLength={STUDENT_NOTE_MAX}
                  placeholder="Anything we should know about your payment?"
                  className="rounded-xl border-border bg-card"
                />
              </FormControl>
              <FormDescription>
                {noteLength}/{STUDENT_NOTE_MAX} characters
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="btn-premium min-h-12 w-full sm:w-auto">
          Continue to payment
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
    </Form>
  );
};

export default EnrollmentDetailsForm;
