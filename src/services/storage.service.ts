import { getSupabaseClient } from "@/lib/supabase/client";

/**
 * The one place this application deletes a stored object.
 *
 * WHY THIS IS A SERVICE AND NOT AN INLINE CALL
 * Two features need it — replacing a course thumbnail, and deleting an enrollment
 * along with its receipt — and both are destructive. Keeping the call in one function
 * means the reasoning below is written once and cannot drift between the two callers.
 *
 * WHY IT MUST GO THROUGH THE STORAGE API
 * `storage.objects` is bookkeeping for a service that also owns bytes in an object
 * store. Deleting the row in SQL removes the half Postgres can see and orphans the
 * half it cannot. Supabase enforces this: `storage.protect_delete()` is attached to
 * the table as a BEFORE DELETE trigger and raises 42501 — "Direct deletion from
 * storage tables is not allowed. Use the Storage API instead." — unless a session GUC
 * is set. The API path is what sets it, which is why this call is the supported one
 * and a migration-level `delete from storage.objects` is not.
 *
 * Authorisation is the caller's storage DELETE policy, which for both buckets requires
 * public.is_admin(). A signed-in non-admin gets a refusal from the database, not from
 * this function.
 */
export const removeStorageObject = async (bucket: string, path: string): Promise<void> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    throw new Error(error.message);
  }

  /**
   * `remove()` resolves without an error when it deleted nothing at all — an absent
   * key, or a key the caller's policy hides, both come back as an empty array. The
   * distinction matters to the enrollment delete, which must not destroy a payment
   * record while believing it cleaned up the receipt, so an empty result is treated as
   * a failure here rather than reported as success.
   *
   * The one caller that legitimately expects a no-op is a retry after a partial
   * failure, and it handles this by checking for the object's absence first.
   */
  if (!data || data.length === 0) {
    throw new Error("The file was not removed. It may already be gone, or you may not have access to it.");
  }
};

/**
 * Whether an object exists and is visible to the caller.
 *
 * Used to make a retried delete idempotent: if the object is already gone, removing it
 * again is not a failure and the operation should carry on to the database row. There
 * is no `exists` in the Storage API, so this lists the object's own folder and looks
 * for the filename — `list` is a SELECT against storage.objects, so it is subject to
 * the same admin policy as the delete it precedes.
 */
export const storageObjectExists = async (bucket: string, path: string): Promise<boolean> => {
  const supabase = getSupabaseClient();
  const separator = path.lastIndexOf("/");
  const folder = separator === -1 ? "" : path.slice(0, separator);
  const filename = separator === -1 ? path : path.slice(separator + 1);

  const { data, error } = await supabase.storage.from(bucket).list(folder, {
    limit: 100,
    search: filename,
  });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).some((entry) => entry.name === filename);
};
