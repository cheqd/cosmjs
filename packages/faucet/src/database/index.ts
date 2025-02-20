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

  async getRequests(timeFilter?: TimeFilter): Promise<(typeof requests.$inferSelect)[]> {
    try {
      return await db
        .select()
        .from(requests)
        .where(
          timeFilter
            ? and(
                ...[
                  timeFilter.startDate ? gte(requests.created_at, new Date(timeFilter.startDate)) : undefined,
                  timeFilter.endDate ? lte(requests.created_at, new Date(timeFilter.endDate)) : undefined,
                ].filter(Boolean),
              )
            : undefined,
        )
        .orderBy(requests.created_at);
    } catch (error) {
      console.error("Error fetching requests:", error);
      throw error;
    }
  }
}

export const database = new DatabaseService();
