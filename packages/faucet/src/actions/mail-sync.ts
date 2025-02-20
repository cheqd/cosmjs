import { MailchimpSyncJob } from "../jobs/sync-mailchimp";

export async function mailSync(): Promise<void> {
  console.info("Running Mailchimp sync job...");
  const job = new MailchimpSyncJob();
  await job.run();
} 