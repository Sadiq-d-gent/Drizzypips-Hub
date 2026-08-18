import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { UploadedThumbnail, uploadCourseThumbnail } from "@/services/courseThumbnail.service";

/**
 * Uploads a course thumbnail and hands back its public URL.
 *
 * Deliberately thinner than useReceiptUpload: no progress percentage, no abort signal, no
 * draft id. Those exist because a student uploads a phone photo over a mobile connection
 * and may well change their mind mid-upload. This runs against a 2 MB ceiling on an admin's
 * connection, so a pending state carries all the information a progress bar would.
 *
 * The upload happens when the file is chosen rather than when the form is submitted, so the
 * admin sees the real image before saving. The cost is that abandoning the form leaves an
 * object nothing references — accepted, because the alternative is a form that cannot show
 * what it is about to publish. supabase/maintenance/cleanup_orphan_thumbnails.sql lists
 * anything left behind this way.
 */
export const useThumbnailUpload = (
  onUploaded: (thumbnail: UploadedThumbnail) => void,
) =>
  useMutation({
    mutationFn: (file: File) => uploadCourseThumbnail(file),
    onSuccess: (thumbnail) => {
      onUploaded(thumbnail);
    },
    onError: (error) => {
      /**
       * validateThumbnailFile and the bucket both produce messages written for the admin,
       * so the message is shown as-is. Anything else arrives as a storage-js message, which
       * is terse but not sensitive — it names no path the admin cannot already see.
       */
      toast.error(
        error instanceof Error
          ? error.message
          : "The image couldn't be uploaded. Please try again.",
      );
    },
  });
