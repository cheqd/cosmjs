export class DateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateValidationError";
  }
}

/**
 * Normalizes date string to UTC date object
 * Accepts either YYYY-MM-DD or full ISO format
 */
export function normalizeDate(dateStr: string): Date {
  // If only YYYY-MM-DD provided, assume start of day UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dateStr = `${dateStr}T00:00:00Z`;
  }

  const date = new Date(dateStr);

  if (isNaN(date.getTime())) {
    throw new DateValidationError(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD or ISO 8601 format.`);
  }

  return date;
}

/**
 * Returns default date range of last 30 days
 */
export function getDefaultDateRange(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30); // Last 30 days
  return { start, end };
}

/**
 * Validates and normalizes date range
 * - No dates provided: returns last 30 days
 * - Only start date: uses current time as end date
 * - Both dates: validates start is before end
 * @throws DateValidationError if dates are invalid
 */
export function validateDateRange(startDate?: string, endDate?: string): { start: Date; end: Date } {
  // Case 1: No dates provided - return last 30 days
  if (!startDate && !endDate) {
    return getDefaultDateRange();
  }

  const now = new Date();
  let start: Date;
  let end: Date;

  // Case 2: Only start date provided - use current time as end
  if (startDate && !endDate) {
    start = normalizeDate(startDate);
    if (start > now) {
      throw new DateValidationError(
        `Start date (${startDate}) cannot be in the future. Current UTC time is ${now.toISOString()}`,
      );
    }
    end = now;
    return { start, end };
  }

  // Case 3: Both dates provided
  if (startDate && endDate) {
    start = normalizeDate(startDate);
    end = normalizeDate(endDate);

    if (start > end) {
      throw new DateValidationError(`Start date (${startDate}) must be before end date (${endDate})`);
    }

    if (end > now) {
      throw new DateValidationError(
        `End date (${endDate}) cannot be in the future. Current UTC time is ${now.toISOString()}`,
      );
    }

    return { start, end };
  }

  // Case 4: Only end date provided - use last 30 days before end date
  end = endDate ? normalizeDate(endDate) : now;
  if (end > now) {
    throw new DateValidationError(
      `End date (${endDate}) cannot be in the future. Current UTC time is ${now.toISOString()}`,
    );
  }
  start = new Date(end);
  start.setDate(end.getDate() - 30);

  return { start, end };
}
