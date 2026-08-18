import {
  ACCEPTED_RECEIPT_EXTENSIONS,
  AcceptedReceiptMimeType,
  RECEIPTS_BUCKET,
} from "@/lib/constants/enrollment";
import { getSupabaseEnv } from "@/lib/env";
import { getUntypedSupabaseClient } from "@/lib/supabase/untypedClient";
import { UploadedReceipt } from "@/types/enrollment";

/**
 * Receipt uploads to the private `receipts` bucket.
 *
 * WHY THE SIGNED-URL ROUTE
 * `storage.from(...).upload()` goes through fetch(), which cannot report upload
 * progress. Receipts are phone photos on mobile connections, so a progress bar is the
 * difference between "working" and "broken" from the student's point of view.
 *
 * So the upload is done in two steps, matching what storage-js does internally
 * (verified against @supabase/storage-js 2.111.0, dist/index.mjs):
 *
 *   1. createSignedUploadUrl(path) — POST /object/upload/sign/<path>, needs
 *      `objects: insert`, which is exactly what the anon policy in
 *      004_create_receipts_storage.sql grants.
 *   2. PUT that URL with the token in the query string, as multipart FormData with
 *      `cacheControl` and the file appended under the empty key. That request needs
 *      no objects permission at all — the token authorises it.
 *
 * Step 2 is issued with XMLHttpRequest instead of fetch purely because XHR exposes
 * `upload.onprogress`. The request is byte-for-byte the same one storage-js would
 * send, so no part of the storage security model is relaxed to get the progress bar.
 */

const UPLOAD_CACHE_CONTROL = "3600";

/**
 * Builds the object key: "<draft uuid>/<object uuid>.<ext>".
 *
 * The shape is enforced twice server-side — by the storage INSERT policy and by
 * public.is_valid_receipt_path() when the path is recorded — so it must stay in sync
 * with both. The random object segment is what makes keys non-enumerable, which
 * matters because anon cannot list the bucket to discover them.
 */
export const buildReceiptPath = (draftId: string, mimeType: AcceptedReceiptMimeType) => {
  const extension = ACCEPTED_RECEIPT_EXTENSIONS[mimeType];
  return `${draftId}/${crypto.randomUUID()}.${extension}`;
};

export type UploadReceiptOptions = {
  file: File;
  draftId: string;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

/**
 * Uploads one receipt and resolves with the metadata that gets recorded on the
 * enrollment. Rejects with a human-readable Error on failure; the caller renders it.
 */
export const uploadReceipt = async ({
  file,
  draftId,
  onProgress,
  signal,
}: UploadReceiptOptions): Promise<UploadedReceipt> => {
  const supabase = getUntypedSupabaseClient();
  const path = buildReceiptPath(draftId, file.type as AcceptedReceiptMimeType);

  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    throw new Error(
      error?.message ?? "We couldn't start the upload. Check your connection and try again.",
    );
  }

  await putWithProgress({
    signedUrl: data.signedUrl,
    file,
    onProgress,
    signal,
  });

  return {
    path: data.path,
    filename: file.name,
    sizeBytes: file.size,
    mimeType: file.type,
  };
};

type PutWithProgressOptions = {
  signedUrl: string;
  file: File;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
};

/**
 * The PUT from step 2, issued via XHR so upload progress is observable.
 *
 * Mirrors storage-js's own request: multipart body carrying `cacheControl` and the
 * file under the empty field name, with the signed token already present in the URL's
 * query string. The apikey header is sent because the Supabase gateway expects it on
 * every request; it is the publishable anon key that is already in the bundle, and it
 * grants nothing beyond what the signed token already authorises.
 */
const putWithProgress = ({ signedUrl, file, onProgress, signal }: PutWithProgressOptions) =>
  new Promise<void>((resolve, reject) => {
    const { supabasePublishableKey } = getSupabaseEnv();

    const body = new FormData();
    body.append("cacheControl", UPLOAD_CACHE_CONTROL);
    body.append("", file);

    const request = new XMLHttpRequest();
    request.open("PUT", signedUrl, true);
    request.setRequestHeader("apikey", supabasePublishableKey);
    // Content-Type is deliberately not set: the browser has to add the multipart
    // boundary itself, and setting the header manually would strip it.

    const abort = () => request.abort();

    const cleanUp = () => {
      signal?.removeEventListener("abort", abort);
    };

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) {
        return;
      }
      // Capped below 100 so the bar cannot claim completion while the server is still
      // responding. The caller sets 100 on resolve.
      const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
      onProgress(percent);
    };

    request.onload = () => {
      cleanUp();

      if (request.status >= 200 && request.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }

      if (request.status === 413) {
        reject(new Error("That file is too large to upload. Choose a smaller file."));
        return;
      }

      reject(
        new Error(
          "The upload was rejected. Check the file type and size, then try again.",
        ),
      );
    };

    request.onerror = () => {
      cleanUp();
      reject(new Error("The upload failed. Check your connection and try again."));
    };

    request.ontimeout = () => {
      cleanUp();
      reject(new Error("The upload timed out. Check your connection and try again."));
    };

    request.onabort = () => {
      cleanUp();
      reject(new DOMException("Upload cancelled", "AbortError"));
    };

    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Upload cancelled", "AbortError"));
        return;
      }
      signal.addEventListener("abort", abort);
    }

    request.send(body);
  });
