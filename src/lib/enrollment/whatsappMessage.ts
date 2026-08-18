import { formatCoursePrice } from "@/lib/courses/price";
import { EnrollmentSummary } from "@/types/enrollment";

/**
 * WhatsApp handoff message.
 *
 * The handoff is optional by design: the enrollment is already recorded and under
 * review by the time this is offered, so WhatsApp is a convenience for following up,
 * never a step the student must complete for their submission to count.
 *
 * The message carries the order ID and nothing secret. The access token is deliberately
 * excluded — it is the authorization secret for the confirmation page, and pasting it
 * into a chat thread would hand it to anyone who later sees that conversation.
 */
export const buildEnrollmentWhatsAppMessage = (enrollment: EnrollmentSummary): string => {
  const price = formatCoursePrice(enrollment.price_amount, enrollment.price_currency);

  return [
    `Hello Drizzypips, I've just submitted an enrollment.`,
    ``,
    `Order ID: ${enrollment.order_id}`,
    `Course: ${enrollment.course_title}`,
    `Amount: ${price}`,
    `Name: ${enrollment.student_name}`,
    ``,
    `I've uploaded my payment receipt and I'm waiting for confirmation. Thank you.`,
  ].join("\n");
};
