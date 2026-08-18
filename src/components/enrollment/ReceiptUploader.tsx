import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  ImageIcon,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { ChangeEvent, DragEvent, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  MAX_RECEIPT_SIZE_LABEL,
  RECEIPT_INPUT_ACCEPT,
  RECEIPT_TYPES_LABEL,
} from "@/lib/constants/enrollment";
import { describeFileType, formatFileSize, truncateFilename } from "@/lib/enrollment/files";
import { cn } from "@/lib/utils";
import { ReceiptUploadState } from "@/hooks/useReceiptUpload";

type ReceiptUploaderProps = {
  upload: ReceiptUploadState & {
    selectFile: (file: File) => Promise<void>;
    reset: () => void;
    retry: () => void;
  };
  isSubmitting: boolean;
  submitError: string | null;
  onBack: () => void;
  onSubmit: () => void;
};

/**
 * Step 3: upload the payment receipt and submit.
 *
 * The upload starts the moment a file is chosen, so by the time the student presses
 * Submit the bytes are usually already stored and the submit is a single fast RPC.
 * Submitting is blocked while an upload is in flight — the enrollment records the
 * object path, so it cannot be written before the object exists.
 */
const ReceiptUploader = ({
  upload,
  isSubmitting,
  submitError,
  onBack,
  onSubmit,
}: ReceiptUploaderProps) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];

    if (file) {
      void upload.selectFile(file);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFiles(event.target.files);
    // Cleared so picking the same file twice in a row still fires a change event,
    // which is what makes "retry with the same photo" work.
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  const isUploading = upload.status === "uploading";
  const isUploaded = upload.status === "uploaded";
  const canSubmit = isUploaded && !isSubmitting;

  const renderDropzone = () => (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "rounded-2xl border-2 border-dashed p-8 text-center transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border bg-muted/20",
      )}
    >
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Upload className="h-6 w-6" aria-hidden="true" />
      </span>

      <p className="mt-5 font-medium text-foreground">
        Drag your receipt here, or choose a file
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {RECEIPT_TYPES_LABEL} · up to {MAX_RECEIPT_SIZE_LABEL}
      </p>

      {/* The input is visually hidden rather than display:none so it stays focusable
          and keyboard-operable; the button below simply forwards the click. */}
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={RECEIPT_INPUT_ACCEPT}
        onChange={handleInputChange}
        className="sr-only"
      />

      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        className="mt-6 min-h-11 rounded-xl border-primary text-primary hover:bg-primary hover:text-primary-foreground"
      >
        Choose file
      </Button>
    </div>
  );

  const renderSelectedFile = () => {
    if (!upload.file) {
      return null;
    }

    const isImage = upload.file.type.startsWith("image/");

    return (
      <div className="rounded-2xl border border-border bg-muted/20 p-5">
        <div className="flex items-start gap-4">
          {upload.previewUrl ? (
            <img
              src={upload.previewUrl}
              alt={`Preview of ${upload.file.name}`}
              className="h-20 w-20 shrink-0 rounded-xl border border-border object-cover"
            />
          ) : (
            <span
              className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"
              aria-hidden="true"
            >
              {isImage ? <ImageIcon className="h-7 w-7" /> : <FileText className="h-7 w-7" />}
            </span>
          )}

          <div className="min-w-0 flex-1">
            <p className="break-words font-medium text-foreground" title={upload.file.name}>
              {truncateFilename(upload.file.name)}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {describeFileType(upload.file.type)} · {formatFileSize(upload.file.size)}
            </p>

            {isUploading ? (
              <div className="mt-3">
                <Progress value={upload.progress} className="h-2" />
                <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Uploading… {upload.progress}%
                </p>
              </div>
            ) : null}

            {isUploaded ? (
              <p className="mt-3 flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Upload complete
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {upload.status === "error" ? (
            <Button
              type="button"
              variant="outline"
              onClick={upload.retry}
              className="min-h-11 rounded-xl border-border"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Try again
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            onClick={upload.reset}
            disabled={isSubmitting}
            className="min-h-11 rounded-xl text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {isUploading ? "Cancel" : "Remove"}
          </Button>

          {!isUploading ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => inputRef.current?.click()}
              disabled={isSubmitting}
              className="min-h-11 rounded-xl text-muted-foreground hover:text-foreground"
            >
              Replace
            </Button>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="rounded-3xl border-border bg-card shadow-premium">
        <CardContent className="p-6 sm:p-8">
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Upload your payment receipt
          </h2>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">
            A clear photo or PDF of your transfer confirmation. We check it against our records
            before confirming your enrollment.
          </p>

          <div className="mt-6">{upload.file ? renderSelectedFile() : renderDropzone()}</div>

          {/* Upload state is announced politely: it changes without the student
              taking an action, so an assertive region would interrupt. */}
          <p aria-live="polite" aria-atomic="true" className="sr-only">
            {isUploading ? `Uploading receipt, ${upload.progress} percent complete.` : ""}
            {isUploaded ? "Receipt uploaded successfully." : ""}
            {upload.status === "error" && upload.error ? upload.error : ""}
          </p>

          {upload.error ? (
            <div className="mt-5 flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
              <AlertTriangle
                className="mt-0.5 h-5 w-5 shrink-0 text-destructive"
                aria-hidden="true"
              />
              <p className="text-sm leading-6 text-foreground">{upload.error}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {submitError ? (
        <div
          role="alert"
          className="flex gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">We couldn't submit your enrollment</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{submitError}</p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          disabled={isSubmitting}
          className="min-h-12 rounded-xl border-border sm:w-auto"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </Button>

        <Button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className="btn-premium min-h-12 sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            "Submit enrollment"
          )}
        </Button>
      </div>

      {!isUploaded ? (
        <p className="text-sm text-muted-foreground">
          Upload your receipt to enable submission.
        </p>
      ) : null}
    </div>
  );
};

export default ReceiptUploader;
