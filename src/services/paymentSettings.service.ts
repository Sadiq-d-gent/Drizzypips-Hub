import { getUntypedSupabaseClient } from "@/lib/supabase/untypedClient";
import { PaymentSettings } from "@/types/enrollment";

/**
 * Reads the active bank transfer configuration shown on the payment step.
 *
 * The `is_active = true` filter is applied by RLS as well as here. Repeating it in the
 * query is not redundant defence — it is what makes the intent readable at the call
 * site, and it keeps the query correct if an admin ever gains a broader read policy.
 */
export const fetchActivePaymentSettings = async (): Promise<PaymentSettings | null> => {
  const supabase = getUntypedSupabaseClient();

  const { data, error } = await supabase
    .from("payment_settings")
    // `maybeSingle` rather than `single`: an unconfigured project legitimately has no
    // active row, and that must render an explanatory panel rather than throw.
    .select(
      `
      id,
      bank_name,
      account_name,
      account_number,
      additional_details,
      currency,
      payment_instructions,
      review_window_hours,
      support_whatsapp_number,
      is_active,
      created_at,
      updated_at
    `,
    )
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as PaymentSettings | null) ?? null;
};
