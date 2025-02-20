export class DateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DateValidationError";
  }
}

export function normalizeDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dateStr = `${dateStr}T00:00:00Z`;
  }

  const date = new Date(dateStr);

  if (isNaN(date.getTime())) {
    throw new DateValidationError(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD format.`);
  }

  return date;
}

export function getDefaultDateRange(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  return { start, end };
}

export function validateDateRange(startDate?: string, endDate?: string): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  let end: Date;

  if (!startDate && !endDate) {
    return getDefaultDateRange();
  }

  if (startDate) {
    start = normalizeDate(startDate);
    if (start > now) {
      throw new DateValidationError(
        `Start date (${startDate}) cannot be in the future. Current UTC time is ${now.toISOString()}`,
      );
    }
  } else {
    start = endDate
      ? new Date(normalizeDate(endDate).getTime() - 30 * 24 * 60 * 60 * 1000)
      : getDefaultDateRange().start;
  }

  if (endDate) {
    end = normalizeDate(endDate);
  } else {
    end = now;
  }

  if (start > end) {
    throw new DateValidationError(`Start date (${startDate}) must be before end date (${endDate})`);
  }

  return { start, end };
}
