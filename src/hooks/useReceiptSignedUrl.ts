import { useMutation } from "@tanstack/react-query";

import { createReceiptSignedUrl } from "@/services/adminEnrollment.service";

/**
 * Mints a signed URL for a receipt, on demand.
 *
 * A mutation rather than a query, on purpose. A signed URL is a bearer capability with a
 * 60-second life: react-query would cache it, hand a stale one back after it expired, and
 * keep it in memory long after the administrator finished looking. So it is fetched only
 * when a button is pressed, used immediately, and never stored anywhere — not in state,
 * not in the query cache, not in the database.
 *
 * `download: true` asks Storage for `Content-Disposition: attachment`. Receipts are files
 * a stranger uploaded; the download path must not invite the browser to render one.
 */
export const useReceiptSignedUrl = () => {
  return useMutation({
    mutationFn: ({ receiptPath, download }: { receiptPath: string; download?: boolean }) =>
      createReceiptSignedUrl(receiptPath, { download }),
  });
};
