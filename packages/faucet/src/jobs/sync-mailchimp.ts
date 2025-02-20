import { db } from '../database/client';
import { requests } from '../database/schema';
import { eq, and } from 'drizzle-orm';
import mailchimp from '@mailchimp/mailchimp_marketing';
import { ErrorResponse as MailchimpError } from 'mailchimp__mailchimp_marketing';

export class MailchimpService {
  constructor() {
    if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SERVER_PREFIX) {
      throw new Error('Mailchimp configuration is missing');
    }

    mailchimp.setConfig({
      apiKey: process.env.MAILCHIMP_API_KEY,
      server: process.env.MAILCHIMP_SERVER_PREFIX,
    });
  }

  async addSubscriber(email: string, name: string, company?: string | null) {
    try {
      if (!process.env.MAILCHIMP_LIST_ID) {
        throw new Error('Mailchimp list ID is missing');
      }
      await mailchimp.lists.addListMember(process.env.MAILCHIMP_LIST_ID, {
        email_address: email,
        status: 'subscribed',
        merge_fields: {
          FNAME: name,
          ...(company && { COMPANY: company }),
        },
      });
    } catch (error) {
      const mailchimpError = (error as any).response?.body as MailchimpError;
      console.error(JSON.stringify({
        message: 'Failed to add subscriber to Mailchimp',
        level: 'error',
        service: 'mailchimp_sync',
        event_type: 'sync_failure',
        error: {
          title: mailchimpError?.title,
          status: mailchimpError?.status,
          detail: mailchimpError?.detail,
          instance: mailchimpError?.instance
        },
        metadata: {
          email,
          timestamp: new Date().toISOString()
        }
      }));
    }
  }
}

const mailchimpService = new MailchimpService();

export class MailchimpSyncJob {
  private static BATCH_SIZE = 100;

  async run() {
    try {
      // Get users who opted in but haven't been synced yet
      const marketingUsers = await db
        .select()
        .from(requests)
        .where(
          and(
            eq(requests.marketing_optin, true),
            eq(requests.mailchimp_synced, false)
          )
        )
        .limit(MailchimpSyncJob.BATCH_SIZE);

      console.log(`Found ${marketingUsers.length} users to sync to Mailchimp`);

      for (const user of marketingUsers) {
        try {
          await mailchimpService.addSubscriber(
            user.email_address,
            user.name,
            user.company
          );

          // Mark user as synced
          await db
            .update(requests)
            .set({ mailchimp_synced: true })
            .where(eq(requests.id, user.id));

        } catch (error) {
          console.error(`Failed to sync user ${user.email_address} to Mailchimp:`, error);
        }
      }

      console.log('Mailchimp sync completed');
    } catch (error) {
      console.error('Failed to run Mailchimp sync job:', error);
    }
  }
}