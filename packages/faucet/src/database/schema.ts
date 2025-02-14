import { bigint, boolean, pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

export const requests = pgTable('requests', {
  id: serial('id').primaryKey(),
  email_address: varchar('email_address').notNull(),
  from_address: varchar('from_address', { length: 44 }).notNull(),
  to_address: varchar('to_address', { length: 44 }).notNull(),
  hash: varchar('hash', { length: 64 }).notNull(),
  marketing_optin: boolean('marketing_optin').default(false).notNull(),
  amount: bigint('amount', { mode: 'bigint' }).notNull(),
  denom: varchar('denom', { length: 20 }).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  country: varchar('country', { length: 2 }).default('XX').notNull()
});  