import { ImageOff, Loader2, Trash2, Upload } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { useThumbnailUpload } from "@/hooks/useThumbnailUpload";
import {
  MAX_THUMBNAIL_SIZE_LABEL,
  THUMBNAIL_INPUT_ACCEPT,
  THUMBNAIL_TYPES_LABEL,
} from "@/lib/constants/course-media";
import { deleteCourseThumbnailByUrl } from "@/services/courseThumbnail.service";

type CourseThumbnailFieldProps = {
  value: string | null;
  onChange: (next: string | null) => void;
  /** The thumbnail already saved on the course, absent when creating. */
  persistedUrl?: string | null;
};

/**
 * Pick, preview and clear a course thumbnail.
 *
 * The upload happens on selection rather than on submit, so the admin sees the actual image
 * before committing to it. What the form field then holds is a public URL — the same value
 * courses.thumbnail_url stores — which is why courseCreateSchema can validate it as a URL
 * and why the catalogue can render it directly.
 */
const CourseThumbnailField = ({ value, onChange, persistedUrl }: CourseThumbnailFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * URLs this field uploaded during this editing session.
   *
   * Choosing a second image before saving would strand the first one: nothing references it
   * and, once the field forgets the URL, nothing can name it either. Tracking them here lets
   * each superseded upload be swept immediately.
   *
   * The course's persisted thumbnail is deliberately never in this set. That one is still
   * live on the public site until the save commits, and removing it here would blank the
   * catalogue image for a course whose form might yet be abandoned. useUpdateCourse deletes
   * it after the row has changed.
   */
  const sessionUploads = useRef<Set<string>>(new Set());

  const sweepIfSessionUpload = (url: string | null) => {
    if (!url || !sessionUploads.current.has(url) || url === persistedUrl) {
      return;
    }

    sessionUploads.current.delete(url);
    void deleteCourseThumbnailByUrl(url).catch(() => {
      // Best effort. cleanup_orphan_thumbnails.sql lists whatever survives.
    });
  };

  const upload = useThumbnailUpload((thumbnail) => {
    sweepIfSessionUpload(value);
    sessionUploads.current.add(thumbnail.publicUrl);
    onChange(thumbnail.publicUrl);
  });

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) {
      upload.mutate(file);
    }

    // Cleared so choosing the same file twice in a row still fires a change event.
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl border border-border bg-muted sm:w-56">
          {value ? (
            <img
              src={value}
              alt="Course thumbnail preview"
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <ImageOff className="h-6 w-6" aria-hidden="true" />
              <span className="text-xs">No image</span>
            </div>
          )}

          {upload.isPending ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/70">
              <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
              <span className="sr-only">Uploading image</span>
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11 gap-2 rounded-xl"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {value ? "Replace image" : "Upload image"}
            </Button>

            {value ? (
              <Button
                type="button"
                variant="ghost"
                className="min-h-11 gap-2 rounded-xl text-muted-foreground hover:text-destructive"
                disabled={upload.isPending}
                onClick={() => {
                  sweepIfSessionUpload(value);
                  onChange(null);
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-muted-foreground">
            {THUMBNAIL_TYPES_LABEL}, up to {MAX_THUMBNAIL_SIZE_LABEL}. A wide image works
            best — the catalogue crops to 16:9.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={THUMBNAIL_INPUT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  );
};

export default CourseThumbnailField;
