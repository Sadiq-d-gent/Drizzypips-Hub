import { format } from "date-fns";
import { Download, ExternalLink, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useReceiptSignedUrl } from "@/hooks/useReceiptSignedUrl";
import { RECEIPT_SIGNED_URL_TTL_SECONDS } from "@/lib/constants/admin";
import { describeFileType, formatFileSize, truncateFilename } from "@/lib/enrollment/files";
import { AdminEnrollmentDetail } from "@/types/admin";

type ReceiptPanelProps = {
  enrollment: AdminEnrollmentDetail;
};

/**
 * Receipt metadata and secure access.
 *
 * WHAT IS NOT RENDERED
 * `receipt_path` — the object key inside the private bucket. It is on the record because
 * minting a signed URL needs it, and it is used for nothing else: not displayed, not put in
 * a title attribute, not logged. Only the student's original filename is shown.
 *
 * HOW ACCESS WORKS
 * The bucket is private and stays private; there is no anon read policy on it. A signed URL
 * is minted per click and lives for RECEIPT_SIGNED_URL_TTL_SECONDS. It resolves only
 * because of the "Admins can read receipts" policy on storage.objects, which tests
 * `public.is_admin()` — so a signed-in non-admin gets an error here, not a link.
 *
 * WHY IT OPENS IN A NEW TAB RATHER THAN INLINE
 * A receipt is a file a stranger uploaded. Rendering one inside the admin origin would make
 * any browser bug in image or PDF handling an admin-panel problem. The download button asks
 * Storage for `Content-Disposition: attachment` so the file is saved rather than
 * interpreted; "Open" uses `noopener,noreferrer` so the opened document cannot reach back
 * through `window.opener`.
 */
const ReceiptPanel = ({ enrollment }: ReceiptPanelProps) => {
  const signedUrl = useReceiptSignedUrl();

  const openReceipt = (download: boolean) => {
    if (!enrollment.receipt_path) {
      return;
    }

    signedUrl.mutate(
      { receiptPath: enrollment.receipt_path, download },
      {
        onSuccess: (url) => {
          window.open(url, "_blank", "noopener,noreferrer");
        },
        onError: () => {
          toast.error("Couldn't open that receipt. Please try again.");
        },
      },
    );
  };

  const hasReceipt = Boolean(enrollment.receipt_path);

  return (
    <Card className="rounded-2xl border-border bg-card">
      <CardContent className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Receipt className="h-4 w-4" aria-hidden="true" />
          Payment receipt
        </h2>

        {!hasReceipt ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No receipt was uploaded with this enrollment. The student may have been asked to
            send it another way — check the student note and the status history below.
          </p>
        ) : (
          <>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">File</dt>
                <dd
                  className="mt-1 break-words text-sm text-foreground"
                  title={enrollment.receipt_filename ?? undefined}
                >
                  {enrollment.receipt_filename
                    ? truncateFilename(enrollment.receipt_filename, 40)
                    : "Unnamed file"}
                </dd>
              </div>

              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Type</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {describeFileType(enrollment.receipt_mime_type)}
                </dd>
              </div>

              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Size</dt>
                <dd className="mt-1 text-sm text-foreground">
                  {enrollment.receipt_size_bytes === null
                    ? "Unknown"
                    : formatFileSize(Number(enrollment.receipt_size_bytes))}
                </dd>
              </div>

              <div className="min-w-0">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Uploaded
                </dt>
                <dd className="mt-1 text-sm text-foreground">
                  {enrollment.receipt_uploaded_at
                    ? format(new Date(enrollment.receipt_uploaded_at), "d MMM yyyy, HH:mm")
                    : "—"}
                </dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Button
                onClick={() => openReceipt(false)}
                disabled={signedUrl.isPending}
                className="btn-premium min-h-11 flex-1"
              >
                {signedUrl.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                )}
                View receipt
              </Button>

              <Button
                variant="outline"
                onClick={() => openReceipt(true)}
                disabled={signedUrl.isPending}
                className="min-h-11 flex-1 gap-2 rounded-xl"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Download
              </Button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              Opens a private link that expires after {RECEIPT_SIGNED_URL_TTL_SECONDS} seconds.
              Don't share it — anyone with the link can read the file until it expires.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ReceiptPanel;
