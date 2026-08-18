import { useCallback, useEffect, useRef, useState } from "react";

import { validateReceiptFile } from "@/lib/validation/enrollment.schema";
import { uploadReceipt } from "@/services/receipt.service";
import { UploadedReceipt } from "@/types/enrollment";

export type ReceiptUploadStatus = "idle" | "uploading" | "uploaded" | "error";

export type ReceiptUploadState = {
  status: ReceiptUploadStatus;
  progress: number;
  error: string | null;
  /** Object URL for image previews, or null for PDFs and when nothing is selected. */
  previewUrl: string | null;
  file: File | null;
  uploaded: UploadedReceipt | null;
};

const initialState: ReceiptUploadState = {
  status: "idle",
  progress: 0,
  error: null,
  previewUrl: null,
  file: null,
  uploaded: null,
};

/**
 * Receipt selection, preview and upload.
 *
 * The upload starts as soon as a file is chosen rather than on submit, so the student
 * waits during a step they are already looking at instead of after pressing "Submit".
 * The cost is orphaned objects when a form is abandoned — handled by the documented
 * manual procedure in supabase/maintenance/cleanup_orphan_receipts.sql.
 */
export const useReceiptUpload = (draftId: string) => {
  const [state, setState] = useState<ReceiptUploadState>(initialState);

  // Object URLs and in-flight requests both need cleanup, and both outlive any single
  // render, so they are held in refs rather than state.
  const previewUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const revokePreview = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Unmount mid-upload (a back navigation, say) must not leave the request running
    // or the object URL leaked.
    return () => {
      abortRef.current?.abort();
      revokePreview();
    };
  }, [revokePreview]);

  const selectFile = useCallback(
    async (file: File) => {
      abortRef.current?.abort();
      revokePreview();

      const validationError = validateReceiptFile(file);

      if (validationError) {
        setState({
          ...initialState,
          status: "error",
          error: validationError,
          file,
        });
        return;
      }

      // Previews are for images only. Rendering a PDF would need an embed or a
      // viewer; the file card shows name, size and type instead, which is enough for
      // the student to confirm they picked the right file.
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
      previewUrlRef.current = previewUrl;

      const controller = new AbortController();
      abortRef.current = controller;

      setState({
        status: "uploading",
        progress: 0,
        error: null,
        previewUrl,
        file,
        uploaded: null,
      });

      try {
        const uploaded = await uploadReceipt({
          file,
          draftId,
          signal: controller.signal,
          onProgress: (progress) =>
            setState((current) =>
              // Ignore progress from a superseded upload: a replace can land a stale
              // callback after the new one has already started.
              current.status === "uploading" ? { ...current, progress } : current,
            ),
        });

        setState((current) => ({
          ...current,
          status: "uploaded",
          progress: 100,
          error: null,
          uploaded,
        }));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          // Superseded or unmounted. The replacement call owns the state now.
          return;
        }

        setState((current) => ({
          ...current,
          status: "error",
          error:
            error instanceof Error
              ? error.message
              : "The upload failed. Check your connection and try again.",
        }));
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    [draftId, revokePreview],
  );

  /**
   * Clears the local selection.
   *
   * Note what this does not do: it cannot delete an already-uploaded object, because
   * anon has no DELETE permission on the bucket by design. A removed-then-replaced
   * receipt leaves the first object orphaned, and the enrollment simply never
   * references it. The cleanup script reconciles those.
   */
  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    revokePreview();
    setState(initialState);
  }, [revokePreview]);

  const retry = useCallback(() => {
    if (state.file) {
      void selectFile(state.file);
    }
  }, [selectFile, state.file]);

  return {
    ...state,
    selectFile,
    reset,
    retry,
  };
};
