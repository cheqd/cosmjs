import { db, client } from './client';
import { requests } from './schema';

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

class DatabaseService {
  async saveRequest(request: FaucetRequest): Promise<void> {
    await client.query('BEGIN');
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
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}

export const database = new DatabaseService(); 