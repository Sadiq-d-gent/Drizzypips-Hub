/**
 * File display helpers for the receipt upload UI.
 */

/**
 * Formats a byte count for display next to a filename.
 *
 * Uses KB/MB (1024-based) rather than kB/MB (1000-based) because the size limit the
 * student is being measured against — the bucket's 5 MB — is itself 5 × 1024 × 1024.
 * Showing "5.2 MB" for a file the server calls 5 MB would be its own bug report.
 */
export const formatFileSize = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "Unknown size";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;

  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(kilobytes < 10 ? 1 : 0)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(1)} MB`;
};

/** Short, human-readable label for the stored MIME type. */
export const describeFileType = (mimeType: string | null): string => {
  switch (mimeType) {
    case "image/jpeg":
      return "JPEG image";
    case "image/png":
      return "PNG image";
    case "image/webp":
      return "WebP image";
    case "application/pdf":
      return "PDF document";
    default:
      return "File";
  }
};

/**
 * Truncates a long filename from the middle, keeping the extension visible.
 *
 * Phone cameras produce names like "WhatsApp Image 2026-08-10 at 14.32.11.jpeg", which
 * would otherwise either wrap over three lines or hide the extension behind an ellipsis
 * — and the extension is the part that tells the student they picked the right file.
 */
export const truncateFilename = (filename: string, maxLength = 32): string => {
  if (filename.length <= maxLength) {
    return filename;
  }

  const lastDot = filename.lastIndexOf(".");
  const hasExtension = lastDot > 0 && filename.length - lastDot <= 6;

  if (!hasExtension) {
    return `${filename.slice(0, maxLength - 1)}…`;
  }

  const extension = filename.slice(lastDot);
  const stem = filename.slice(0, lastDot);
  const keep = Math.max(4, maxLength - extension.length - 1);

  return `${stem.slice(0, keep)}…${extension}`;
};
