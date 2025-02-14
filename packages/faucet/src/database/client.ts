import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import * as schema from './schema';

if (!process.env.DB_URL) {
  throw new Error('DB_URL environment variable is required');
}

export const client = new Client({
  connectionString: process.env.DB_URL,
  ssl: process.env.DB_CERT ? {
    ca: process.env.DB_CERT
  } : undefined
});

client.connect();
export const db = drizzle(client, { schema });

process.on('SIGTERM', () => {
  client.end()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}); 
