import { createClient } from "@supabase/supabase-js";

import { getSupabaseEnv } from "@/lib/env";
import { Database } from "@/types/database.types";

let browserClient: ReturnType<typeof createClient<Database>> | null = null;

export const getSupabaseClient = () => {
  if (browserClient) {
    return browserClient;
  }

  const { supabaseUrl, supabasePublishableKey } = getSupabaseEnv();

  browserClient = createClient<Database>(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
};
