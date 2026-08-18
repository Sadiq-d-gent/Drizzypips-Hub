import { format } from "date-fns";

import { ENROLLMENT_STATUS_LABELS } from "@/lib/constants/enrollment";
import { formatCoursePrice } from "@/lib/courses/price";
import { EnrollmentSummary } from "@/types/enrollment";

/**
 * Downloadable enrollment card.
 *
 * Drawn into a canvas and downloaded as a PNG on the student's device. Nothing is
 * stored: the card is entirely derivable from the enrollment record, so persisting a
 * rendered image would add a storage object to keep in sync with a status that changes.
 * Regenerating it on each download costs a few milliseconds and is always current.
 *
 * Canvas rather than a library because no new dependency is in scope for this phase,
 * and the layout is a fixed list of label/value rows — the case a 2D context handles
 * without help.
 *
 * The access token is not drawn on the card. The card is a receipt the student may
 * share with anyone; the token authorises access to their record.
 */

const CARD_WIDTH = 1000;
const CARD_PADDING = 64;
const SCALE = 2;

// Sampled from the design tokens in src/index.css so the card matches the site. They
// are literals here because canvas needs concrete colours, and resolving CSS custom
// properties would tie the export to whichever theme happened to be active.
const COLORS = {
  background: "#0b0f16",
  panel: "#111826",
  border: "#1f2937",
  primary: "#22c55e",
  heading: "#f8fafc",
  label: "#94a3b8",
  value: "#e2e8f0",
  muted: "#64748b",
};

const FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

type CardRow = { label: string; value: string };

const buildRows = (enrollment: EnrollmentSummary): CardRow[] => {
  const rows: CardRow[] = [
    { label: "Order ID", value: enrollment.order_id },
    { label: "Course", value: enrollment.course_title },
    {
      label: "Amount",
      value: formatCoursePrice(enrollment.price_amount, enrollment.price_currency),
    },
    { label: "Status", value: ENROLLMENT_STATUS_LABELS[enrollment.status] ?? enrollment.status },
    { label: "Student", value: enrollment.student_name },
    { label: "Email", value: enrollment.student_email },
    { label: "Phone", value: enrollment.student_phone },
    {
      label: "Submitted",
      value: format(new Date(enrollment.created_at), "d MMM yyyy, HH:mm"),
    },
  ];

  if (enrollment.receipt_filename) {
    rows.push({ label: "Receipt", value: enrollment.receipt_filename });
  }

  return rows;
};

/** Wraps text to a pixel width, so a long course title cannot run off the card. */
const wrapText = (
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] => {
  const words = text.split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = words[0];

  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;

    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }

    lines.push(current);
    current = word;
  }

  lines.push(current);
  return lines;
};

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
};

/**
 * Renders the card and returns it as a PNG blob.
 *
 * Height is computed from the wrapped rows rather than fixed, so a long course title
 * grows the card instead of overlapping the footer.
 */
export const renderEnrollmentCard = async (
  enrollment: EnrollmentSummary,
): Promise<Blob> => {
  const rows = buildRows(enrollment);

  const measuringCanvas = document.createElement("canvas");
  const measuringContext = measuringCanvas.getContext("2d");

  if (!measuringContext) {
    throw new Error("Your browser couldn't generate the card image.");
  }

  const contentWidth = CARD_WIDTH - CARD_PADDING * 2;
  const valueWidth = contentWidth - 260;

  measuringContext.font = `500 26px ${FONT_STACK}`;
  const wrapped = rows.map((row) => ({
    ...row,
    lines: wrapText(measuringContext, row.value, valueWidth),
  }));

  const rowsHeight = wrapped.reduce(
    (total, row) => total + Math.max(1, row.lines.length) * 34 + 30,
    0,
  );

  const headerHeight = 190;
  const footerHeight = 130;
  const cardHeight = headerHeight + rowsHeight + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH * SCALE;
  canvas.height = cardHeight * SCALE;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Your browser couldn't generate the card image.");
  }

  // Draw in CSS pixels and let the transform handle the 2× export, so every coordinate
  // below reads as a layout value rather than a doubled one.
  context.scale(SCALE, SCALE);
  context.textBaseline = "top";

  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, CARD_WIDTH, cardHeight);

  context.fillStyle = COLORS.primary;
  context.fillRect(0, 0, CARD_WIDTH, 8);

  context.fillStyle = COLORS.heading;
  context.font = `700 44px ${FONT_STACK}`;
  context.fillText("Enrollment Receipt", CARD_PADDING, 58);

  context.fillStyle = COLORS.muted;
  context.font = `400 24px ${FONT_STACK}`;
  context.fillText("Drizzypips Hub", CARD_PADDING, 116);

  let y = headerHeight;

  for (const row of wrapped) {
    const blockHeight = Math.max(1, row.lines.length) * 34;

    context.fillStyle = COLORS.panel;
    roundedRect(context, CARD_PADDING - 20, y - 14, contentWidth + 40, blockHeight + 26, 14);
    context.fill();

    context.fillStyle = COLORS.label;
    context.font = `500 22px ${FONT_STACK}`;
    context.fillText(row.label.toUpperCase(), CARD_PADDING, y + 4);

    context.fillStyle = COLORS.value;
    context.font = `500 26px ${FONT_STACK}`;

    row.lines.forEach((line, index) => {
      context.fillText(line, CARD_PADDING + 260, y + index * 34);
    });

    y += blockHeight + 30;
  }

  context.strokeStyle = COLORS.border;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(CARD_PADDING, y + 12);
  context.lineTo(CARD_WIDTH - CARD_PADDING, y + 12);
  context.stroke();

  context.fillStyle = COLORS.muted;
  context.font = `400 21px ${FONT_STACK}`;
  context.fillText(
    "Keep this receipt. Quote your Order ID in any message about this enrollment.",
    CARD_PADDING,
    y + 40,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Your browser couldn't generate the card image."));
    }, "image/png");
  });
};

/** Filename for the downloaded card. Order ID is already filename-safe by construction. */
export const enrollmentCardFilename = (enrollment: EnrollmentSummary) =>
  `drizzypips-enrollment-${enrollment.order_id}.png`;

/**
 * Renders and downloads the card.
 *
 * The object URL is revoked on the next frame rather than immediately: Safari has
 * historically cancelled the download if the URL is released in the same tick as the
 * synthetic click.
 */
export const downloadEnrollmentCard = async (enrollment: EnrollmentSummary) => {
  const blob = await renderEnrollmentCard(enrollment);
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = enrollmentCardFilename(enrollment);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  requestAnimationFrame(() => URL.revokeObjectURL(url));
};
