import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * The shared Supabase client, with its schema generics widened.
 *
 * WHY THIS EXISTS
 * The four Phase 3 services were written when `Database` in
 * src/types/database.types.ts knew only about `admins` and `courses`, so their tables
 * and RPCs could not be resolved through the typed client. Rather than sprinkle
 * `as any` across four files, the cast was made once, here, where it can be explained.
 * Call sites stay honest by annotating their own return types against the
 * hand-authored shapes in src/types/enrollment.ts.
 *
 * WHY IT IS STILL HERE
 * database.types.ts has since been regenerated (Phase 4) and now covers the whole
 * schema, so this module is no longer necessary — Phase 4 code uses
 * `getSupabaseClient()` directly. Switching the four Phase 3 services over is a safe
 * but unrelated refactor, and Phase 4 was scoped to leave the working enrollment flow
 * alone. It is the obvious next cleanup: re-point them at `getSupabaseClient()` and
 * delete this file. Nothing else should need to change, since the hand-authored types
 * were written to match what generation produces.
 *
 * This widens types only. It is the same client instance, with the same publishable
 * key and the same RLS enforcement — nothing here grants any additional access.
 */
export const getUntypedSupabaseClient = (): SupabaseClient =>
  getSupabaseClient() as unknown as SupabaseClient;
