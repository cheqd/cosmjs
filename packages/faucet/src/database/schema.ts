import { bigint, boolean, pgEnum, pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const emailVerificationStatusEnum = pgEnum("email_verification_status", [
  "pending",
  "verified",
  "invalidated",
  "expired",
]);

export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  first_name: varchar("first_name", { length: 50 }).notNull(),
  last_name: varchar("last_name", { length: 50 }).notNull().default(""),
  company: varchar("company", { length: 150 }),
  email_address: varchar("email_address", { length: 254 }).notNull(),
  from_address: varchar("from_address", { length: 44 }).notNull(),
  to_address: varchar("to_address", { length: 44 }).notNull(),
  hash: varchar("hash", { length: 64 }).notNull(),
  marketing_optin: boolean("marketing_optin").default(false).notNull(),
  mailchimp_synced: boolean("mailchimp_synced").default(false).notNull(),
  amount: bigint("amount", { mode: "bigint" }).notNull(),
  denom: varchar("denom", { length: 20 }).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  country: varchar("country", { length: 2 }).default("XX").notNull(),
});

export const emailVerifications = pgTable("email_verifications", {
  id: serial("id").primaryKey(),
  email_address: varchar("email_address", { length: 254 }).notNull(),
  otp_code_hash: varchar("otp_code_hash", { length: 64 }).notNull(),
  status: emailVerificationStatusEnum("status").default("pending").notNull(),
  expires_at: timestamp("expires_at").notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});
