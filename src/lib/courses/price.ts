/**
 * Course price presentation.
 *
 * Prices are rendered straight from `courses.price` and `courses.currency`, which the
 * schema stores as `numeric(12,2)` and free-form `text`. Two details matter:
 *
 *   * Cents are shown only when the amount actually has them, so 149.00 reads as
 *     "$149" while 499.99 keeps its cents. Rounding to whole units would misstate
 *     the price a visitor is being quoted.
 *   * Intl.NumberFormat throws a RangeError on a currency code that is not three
 *     letters. The column allows any short string, so an unexpected value must not
 *     be able to break the catalogue render.
 */

const DISPLAY_LOCALE = "en-US";

export const isFreeCourse = (price: number) => price <= 0;

export const formatCoursePrice = (price: number, currency: string): string => {
  const normalizedCurrency = currency?.trim().toUpperCase() || "USD";
  const minimumFractionDigits = Number.isInteger(price) ? 0 : 2;

  try {
    return new Intl.NumberFormat(DISPLAY_LOCALE, {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits,
      maximumFractionDigits: 2,
    }).format(price);
  } catch {
    // Not a usable ISO-4217 code — show the amount beside the raw code instead of failing.
    return `${normalizedCurrency} ${price.toLocaleString(DISPLAY_LOCALE, {
      minimumFractionDigits,
      maximumFractionDigits: 2,
    })}`;
  }
};
