import { db, client } from "./client";
import { requests, emailVerifications, emailVerificationStatusEnum } from "./schema";
import { and, eq, gte, lte, lt, desc } from "drizzle-orm";
import { validateDateRange } from "../utils/dates";
import { createHmac } from "crypto";
import * as constants from "../constants";

export interface TimeFilter {
  startDate?: string;
  endDate?: string;
}

type EmailVerificationStatus = (typeof emailVerificationStatusEnum.enumValues)[number];

const EMAIL_VERIFICATION_STATUS: Record<string, EmailVerificationStatus> = {
  pending: "pending",
  verified: "verified",
  invalidated: "invalidated",
  expired: "expired",
} as const;

export interface FaucetRequest {
  email_address: string;
  first_name: string;
  last_name: string;
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
  async saveRequest(request: FaucetRequest): Promise<number> {
    await client.query("BEGIN");
    try {
      const inserted = await db.insert(requests).values({
        email_address: request.email_address,
        first_name: request.first_name,
        last_name: request.last_name,
        from_address: request.from_address,
        to_address: request.to_address,
        hash: request.hash,
        marketing_optin: request.marketing_optin,
        amount: request.amount,
        denom: request.denom,
        country: request.country,
        company: request.company || null,
      }).returning({ id: requests.id });
      await client.query("COMMIT");
      return inserted[0]!.id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  async getRequests(timeFilter?: TimeFilter): Promise<(typeof requests.$inferSelect)[]> {
    try {
      const { start, end } = validateDateRange(timeFilter?.startDate, timeFilter?.endDate);

      return await db
        .select()
        .from(requests)
        .where(and(gte(requests.created_at, start), lte(requests.created_at, end)))
        .orderBy(requests.created_at);
    } catch (error) {
      console.error("Error fetching requests:", error);
      throw error;
    }
  }

  // Generates a 6-digit OTP code
  private generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Hashes an OTP code
  private hashOTP(otpCode: string): string {

    const secret = constants.otpSecret;
    return createHmac("sha256", secret).update(otpCode).digest("hex");
  }

  // Creates a new email verification record with OTP
  async createEmailVerification(email: string): Promise<string> {
    await client.query("BEGIN");
    try {
      // Invalidate any existing pending OTPs for this email
      await db
        .update(emailVerifications)
        .set({ status: EMAIL_VERIFICATION_STATUS.invalidated })
        .where(
          and(
            eq(emailVerifications.email_address, email),
            eq(emailVerifications.status, EMAIL_VERIFICATION_STATUS.pending),
          ),
        );

      const otpCode = this.generateOTP();
      const otpHash = this.hashOTP(otpCode);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      await db.insert(emailVerifications).values({
        email_address: email,
        otp_code_hash: otpHash,
        status: EMAIL_VERIFICATION_STATUS.pending,
        expires_at: expiresAt,
      });

      await client.query("COMMIT");
      return otpCode;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  // Verifies an OTP code
  async verifyOTP(email: string, otpCode: string): Promise<boolean> {
    await client.query("BEGIN");
    try {
      // Hash the provided OTP code
      const providedOtpHash = this.hashOTP(otpCode);

      // Mark expired OTPs before validation
      await db
        .update(emailVerifications)
        .set({ status: EMAIL_VERIFICATION_STATUS.expired })
        .where(
          and(
            eq(emailVerifications.email_address, email),
            eq(emailVerifications.status, EMAIL_VERIFICATION_STATUS.pending),
            lt(emailVerifications.expires_at, new Date()),
          ),
        );

      // Get pending OTP records for this email, ordered by most recent first
      const verifications = await db
        .select()
        .from(emailVerifications)
        .where(
          and(
            eq(emailVerifications.email_address, email),
            eq(emailVerifications.status, EMAIL_VERIFICATION_STATUS.pending),
          ),
        )
        .orderBy(desc(emailVerifications.created_at));

      if (verifications.length === 0) {
        await client.query("COMMIT");
        return false;
      }

      // Find a matching OTP
      const matchingRecord = verifications.find((record: typeof emailVerifications.$inferSelect) => {
        return record.otp_code_hash === providedOtpHash;
      });

      if (!matchingRecord) {
        await client.query("COMMIT");
        return false;
      }

      // Mark the matching OTP as verified
      await db
        .update(emailVerifications)
        .set({ status: EMAIL_VERIFICATION_STATUS.verified })
        .where(eq(emailVerifications.id, matchingRecord.id));

      // Invalidate any other pending OTPs (should not be any, but for safety)
      await db
        .update(emailVerifications)
        .set({ status: EMAIL_VERIFICATION_STATUS.invalidated })
        .where(
          and(
            eq(emailVerifications.email_address, email),
            eq(emailVerifications.status, EMAIL_VERIFICATION_STATUS.pending),
          ),
        );

      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }

  /**
   * Checks if an email has been verified (has at least one verified OTP record)
   */
  async isEmailVerified(email: string): Promise<boolean> {
    try {
      const verified = await db
        .select()
        .from(emailVerifications)
        .where(
          and(
            eq(emailVerifications.email_address, email),
            eq(emailVerifications.status, EMAIL_VERIFICATION_STATUS.verified),
          ),
        )
        .limit(1);

      return verified.length > 0;
    } catch (error) {
      console.error("Error checking email verification:", error);
      throw error;
    }
  }

  /**
   * Automatically verifies an email (for trusted sources like cheqd Studio)
   * Creates a verified record without requiring OTP
   */
  async autoVerifyEmail(email: string): Promise<void> {
    await client.query("BEGIN");
    try {
      // Check if already verified
      const isVerified = await this.isEmailVerified(email);
      if (isVerified) {
        await client.query("COMMIT");
        return;
      }

      // Create a verified record with a dummy OTP hash (never used)
      const dummyOtpHash = this.hashOTP("auto-verified");
      const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      await db.insert(emailVerifications).values({
        email_address: email,
        otp_code_hash: dummyOtpHash,
        status: EMAIL_VERIFICATION_STATUS.verified,
        expires_at: expiresAt,
      });

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

export const database = new DatabaseService();
