import { db } from "../database/client";
import { requests } from "../database/schema";
import { eq, and } from "drizzle-orm";
import mailchimp from "@mailchimp/mailchimp_marketing";
import { createHash } from "crypto";

export class MailchimpService {
  constructor() {
    if (!process.env.MAILCHIMP_API_KEY || !process.env.MAILCHIMP_SERVER_PREFIX) {
      throw new Error("Mailchimp configuration is missing");
    }

    mailchimp.setConfig({
      apiKey: process.env.MAILCHIMP_API_KEY,
      server: process.env.MAILCHIMP_SERVER_PREFIX,
    });
  }

  async upsertSubscriber(
    listId: string,
    email: string,
    firstName: string,
    lastName: string,
    requestId: number,
    company?: string | null,
    tags?: readonly string[]
  ): Promise<void> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const subscriberHash = createHash("md5").update(normalizedEmail).digest("hex");

      await mailchimp.lists.setListMember(listId, subscriberHash, {
        email_address: normalizedEmail,
        status_if_new: "subscribed",
        merge_fields: {
          FNAME: firstName,
          LNAME: lastName,
          ...(company && { COMPANY: company }),
        },
      });

      if (tags && tags.length > 0) {
        const current = (await mailchimp.lists.getListMemberTags(listId, subscriberHash)) as any;
        const existingActive = new Set<string>(
          (current?.tags ?? [])
            .filter((t: any) => t.status === "active")
            .map((t: any) => t.name as string),
        );

        const missing = tags.filter((t) => !existingActive.has(t));
        if (missing.length > 0) {
          await mailchimp.lists.updateListMemberTags(
            listId,
            subscriberHash,
            {
              tags: missing.map((t) => ({ name: t, status: "active" as const })),
            },
          );
        }
      }
      // Mark user as synced
      await db.update(requests).set({ mailchimp_synced: true }).where(eq(requests.id, requestId));
      console.info("User's email successfully added to the Mailchimp contacts");
    } catch (error) {
      console.error("Failed to upsert subscriber in Mailchimp:", error);
      throw error;
    }
  }
}
