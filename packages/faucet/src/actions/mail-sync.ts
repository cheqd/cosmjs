import { MailchimpService } from "../jobs/mailchimp";
import { syncNewsletterContacts } from "../jobs/scheduler";

const mailchimpService = new MailchimpService();

export async function mailSync(): Promise<void> {
  console.info("Running Mailchimp sync job...");
  await syncNewsletterContacts();
}

export async function upsertSubscriber(
  listId: string,
  email: string,
  name: string,
  requestId: number,
  company?: string | null,
  tags?: readonly string[],
): Promise<void> {
  return mailchimpService.upsertSubscriber(listId, email, name, requestId, company, tags);
}
