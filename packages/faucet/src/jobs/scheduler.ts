import cron from "node-cron";
import { MailchimpSyncJob } from "./sync-mailchimp";

export class Scheduler {
  private job: MailchimpSyncJob;

  constructor() {
    this.job = new MailchimpSyncJob();
  }

  start() {
    console.log("Starting Mailchimp sync scheduler...");
    cron.schedule("0 0 * * *", async () => {
      console.log("Starting Mailchimp sync job...");
      await this.job.run();
    });
  }
}

export const scheduler = new Scheduler();
