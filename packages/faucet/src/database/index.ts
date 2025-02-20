import { db, client } from "./client";
import { requests } from "./schema";
import { and, gte, lte } from "drizzle-orm";

export interface FaucetRequest {
  email_address: string;
  name: string;
  from_address: string;
  to_address: string;
  hash: string;
  marketing_optin: boolean;
  amount: bigint;
  denom: string;
  country: string;
  company?: string | null;
}

interface TimeFilter {
  startDate?: string;
  endDate?: string;
}

export class DateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DateValidationError';
  }
}

function normalizeDate(dateStr: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    dateStr = `${dateStr}T00:00:00Z`;
  }
  
  const date = new Date(dateStr);
  
  // Check if date is valid
  if (isNaN(date.getTime())) {
    throw new DateValidationError(`Invalid date format: ${dateStr}. Expected YYYY-MM-DD format.`);
  }
  
  return date;
}

function getDefaultDateRange(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 30);
  return { start, end };
}

function validateDateRange(startDate?: string, endDate?: string): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  let end: Date;

  // If no dates provided, return last 30 days
  if (!startDate && !endDate) {
    return getDefaultDateRange();
  }

  // Handle start date
  if (startDate) {
    start = normalizeDate(startDate);
    if (start > now) {
      throw new DateValidationError(
        `Start date (${startDate}) cannot be in the future. Current UTC time is ${now.toISOString()}`
      );
    }
  } else {
    // If only end date is provided, use 30 days before end date as start
    start = endDate 
      ? new Date(normalizeDate(endDate).getTime() - (30 * 24 * 60 * 60 * 1000))
      : getDefaultDateRange().start;
  }

  // Handle end date
  if (endDate) {
    end = normalizeDate(endDate);
  } else {
    end = now;
  }

  // Ensure chronological order
  if (start > end) {
    throw new DateValidationError(
      `Start date (${startDate}) must be before end date (${endDate})`
    );
  }

  return { start, end };
}

class DatabaseService {
  async saveRequest(request: FaucetRequest): Promise<void> {
    await client.query("BEGIN");
    try {
      await db.insert(requests).values({
        email_address: request.email_address,
        name: request.name,
        from_address: request.from_address,
        to_address: request.to_address,
        hash: request.hash,
        marketing_optin: request.marketing_optin,
        amount: request.amount,
        denom: request.denom,
        country: request.country,
        company: request.company || null,
      });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  async getRequests(timeFilter?: TimeFilter): Promise<typeof requests.$inferSelect[]> {
    try {
      const { start, end } = validateDateRange(timeFilter?.startDate, timeFilter?.endDate);
      
      return await db
        .select()
        .from(requests)
        .where(
          and(
            gte(requests.created_at, start),
            lte(requests.created_at, end)
          )
        )
        .orderBy(requests.created_at);

    } catch (error) {
      if (error instanceof DateValidationError) {
        throw error;
      }
      console.error("Error fetching requests:", error);
      throw new Error("Database error: " + (error instanceof Error ? error.message : 'Unknown error'));
    }
  }
}

export const database = new DatabaseService();
