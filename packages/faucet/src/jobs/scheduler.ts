import cron from "node-cron";
import { db } from "../database/client";
import { requests } from "../database/schema";
import { and, eq } from "drizzle-orm";
import { upsertSubscriber } from "../actions/mail-sync";

export async function syncNewsletterContacts(): Promise<void> {
  try {
    const marketingUsers = await db
      .select()
      .from(requests)
      .where(and(eq(requests.marketing_optin, true), eq(requests.mailchimp_synced, false)));

    console.log(`Found ${marketingUsers.length} users to sync to Mailchimp`);

    if (!process.env.MAILCHIMP_NEWSLETTER_LIST_ID) {
      throw new Error("MAILCHIMP_NEWSLETTER_LIST_ID is missing");
    }

    const listId = process.env.MAILCHIMP_NEWSLETTER_LIST_ID;

    for (const user of marketingUsers) {
      try {
        await upsertSubscriber(
          listId,
          user.email_address,
          user.first_name,
          user.last_name,
          user.id,
          user.company ?? null,
        );
      } catch (error) {
        console.error(`Failed to sync user ${user.email_address} to Mailchimp:`, error);
      }
    }

    console.log("Mailchimp sync completed");
  } catch (error) {
    console.error("Failed to run Mailchimp sync job:", error);
  }
}

export class Scheduler {
  start() {
    console.log("Starting Mailchimp sync scheduler...");
    cron.schedule("0 0 * * *", async () => {
      console.log("Starting Mailchimp sync job...");
      await syncNewsletterContacts();
    });
  }
}

export const scheduler = new Scheduler();
