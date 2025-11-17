import Koa from "koa";
import cors = require("@koa/cors");
import bodyParser from "koa-bodyparser";
import { Context } from "koa";
import { timingSafeEqual } from "crypto";

import { isValidAddress } from "../addresses";
import * as constants from "../constants";
import { Faucet } from "../faucet";
import { HttpError } from "./httperror";
import { RequestParser } from "./requestparser";
import { DateValidationError } from "../utils/dates";
import { getExportFilename } from "../utils/csv";
import { database } from "../database";
import { emailService } from "../services/email";

/** This will be passed 1:1 to the user */
export interface ChainConstants {
  readonly nodeUrl: string;
  readonly chainId: string;
}

interface ExportRequestQuery {
  startDate?: string;
  endDate?: string;
}

export class Webserver {
  private readonly api = new Koa();
  private readonly addressCounter = new Map<string, Date>();

  private getCountryFromRequest(context: Context): string {
    return context.get("CF-IPCountry") || "XX";
  }

  private requireApiKey(context: Context): void {

    const headerApiKey = context.get("x-api-key") || (context.headers["x-api-key"] as string | undefined);
    const headerAuth = context.get("authorization") || (context.headers["authorization"] as string | undefined);

    let providedKey: string | undefined;
    if (headerApiKey && headerApiKey.trim().length > 0) {
      providedKey = headerApiKey.trim();
    } else if (headerAuth && headerAuth.trim().length > 0) {
      providedKey = headerAuth.replace(/^Bearer\s+/i, "").trim();
    }

    if (!providedKey) {
      throw new HttpError(401, "Missing API key");
    }

    // Use constant-time comparison to prevent timing attacks
    if (providedKey.length !== constants.apiKey.length) {
      throw new HttpError(403, "Invalid API key");
    }

    const providedKeyBuffer = Buffer.from(providedKey, "utf8");
    const expectedKeyBuffer = Buffer.from(constants.apiKey, "utf8");

    if (!timingSafeEqual(providedKeyBuffer, expectedKeyBuffer)) {
      throw new HttpError(403, "Invalid API key");
    }
  }

  private validateExportQuery(query: unknown): ExportRequestQuery {
    const { startDate, endDate } = query as Record<string, unknown>;

    // Check if dates are strings or undefined
    if (startDate !== undefined && typeof startDate !== "string") {
      throw new HttpError(400, "startDate must be a string");
    }
    if (endDate !== undefined && typeof endDate !== "string") {
      throw new HttpError(400, "endDate must be a string");
    }

    return { startDate, endDate };
  }

  private sanitizeCsvField(field: string | number | boolean | null | undefined): string {
    if (field === null || field === undefined) {
      return "";
    }
    const stringField = String(field);
    // If field contains comma, quotes, or newlines, wrap in quotes and escape existing quotes
    if (stringField.includes(",") || stringField.includes('"') || stringField.includes("\n")) {
      return `"${stringField.replace(/"/g, '""')}"`;
    }
    return stringField;
  }

  private async handleExportRequest(context: Context, faucet: Faucet): Promise<void> {
    if (context.request.method !== "GET") {
      throw new HttpError(405, "This endpoint requires a GET request", false);
    }

    const query = this.validateExportQuery(context.query);

    try {
      const requests = await faucet.getRequests(query);

      const headers = [
        "Timestamp",
        "Email",
        "FirstName",
        "LastName",
        "Company",
        "Distributor",
        "Receiver",
        "Amount",
        "Denom",
        "Country",
        "Marketing Opt-in",
        "Added to Mailchimp",
      ];

      const csvRows = [
        headers.join(","),
        ...requests.map((req) =>
          [
            this.sanitizeCsvField(new Date(req.created_at).toISOString()),
            this.sanitizeCsvField(req.email_address),
            this.sanitizeCsvField(req.first_name),
            this.sanitizeCsvField(req.last_name),
            this.sanitizeCsvField(req.company),
            this.sanitizeCsvField(req.from_address),
            this.sanitizeCsvField(req.to_address),
            this.sanitizeCsvField(req.amount.toString()),
            this.sanitizeCsvField(req.denom),
            this.sanitizeCsvField(req.country),
            this.sanitizeCsvField(req.marketing_optin ? "Yes" : "No"),
            this.sanitizeCsvField(req.mailchimp_synced ? "Yes" : "No"),
          ].join(","),
        ),
      ];

      const filename = getExportFilename(query.startDate, query.endDate);

      context.response.set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filename}`,
        // Prevent caching of export data
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",
      });

      context.response.body = csvRows.join("\n");
    } catch (error) {
      console.error("Failed to export data:", error);

      if (error instanceof DateValidationError) {
        // Date validation errors are safe to expose to users
        throw new HttpError(400, `Invalid date range: ${error.message}`, true);
      }

      // For database or other errors, log details but return generic message
      console.error("Export error details:", error);
      throw new HttpError(500, "Failed to export data. Please try again later.", false);
    }
  }

  public constructor(faucet: Faucet, chainConstants: ChainConstants) {
    this.api.use(cors());
    this.api.use(bodyParser());

    this.api.use(async (context: Context) => {
      switch (context.path) {
        case "/":
        case "/healthz":
          context.response.body =
            "Welcome to the faucet!\n" +
            "\n" +
            "Check the full status via the /status endpoint.\n" +
            "You can get tokens from here by POSTing to /credit.\n" +
            "See https://github.com/cosmos/cosmjs/tree/main/packages/faucet for all further information.\n";
          break;
        case "/status": {
          const [holder, ...distributors] = await faucet.loadAccounts();
          const availableTokens = await faucet.availableTokens();
          const chainTokens = faucet.configuredTokens();
          context.response.body = {
            status: "ok",
            ...chainConstants,
            chainTokens: chainTokens,
            availableTokens: availableTokens,
            holder: holder,
            distributors: distributors,
          };
          break;
        }
        case "/email/request-otp": {
          this.requireApiKey(context);
          if (context.request.method !== "POST") {
            throw new HttpError(405, "Method not allowed");
          }

          if (context.request.type !== "application/json") {
            throw new HttpError(415, "Content-type application/json expected");
          }

          const requestBody = (context.request as any).body;
          const { email } = RequestParser.parseRequestOTPBody(requestBody);

          try {
            const otpCode = await database.createEmailVerification(email);
            await emailService.sendOTP(email, otpCode);
            context.response.body = { status: "ok", message: "OTP sent successfully" };
          } catch (error) {
            console.error("Failed to send OTP:", error);
            throw new HttpError(500, "Failed to send OTP. Please try again later.");
          }
          break;
        }
        case "/email/verify-otp": {
          this.requireApiKey(context);
          if (context.request.method !== "POST") {
            throw new HttpError(405, "Method not allowed");
          }

          if (context.request.type !== "application/json") {
            throw new HttpError(415, "Content-type application/json expected");
          }

          const requestBody = (context.request as any).body;
          const { email, otp } = RequestParser.parseVerifyOTPBody(requestBody);

          try {
            const isValid = await database.verifyOTP(email, otp);
            if (isValid) {
              context.response.body = { status: "ok", message: "Email verified successfully" };
            } else {
              throw new HttpError(400, "Invalid or expired OTP code");
            }
          } catch (error) {
            if (error instanceof HttpError) {
              throw error;
            }
            console.error("Failed to verify OTP:", error);
            throw new HttpError(500, "Failed to verify OTP. Please try again later.");
          }
          break;
        }
        case "/credit": {
          this.requireApiKey(context);
          if (context.request.method !== "POST") {
            throw new HttpError(405, "This endpoint requires a POST request");
          }

          if (context.request.type !== "application/json") {
            throw new HttpError(415, "Content-type application/json expected");
          }

          const requestBody = (context.request as any).body;
          const creditBody = RequestParser.parseCreditBody(requestBody);
          const { address, denom, amount, email, marketingOptin, firstName, lastName, company } = creditBody;
          const country = this.getCountryFromRequest(context);

          // Auto-verify email for cheqd Studio requests, otherwise require email verification
          const isCheqdStudioRequest = company === "Requested via cheqd Studio";
          if (isCheqdStudioRequest) {
            // Automatically verify email for cheqd Studio requests
            await database.autoVerifyEmail(email);
          } else {
            // Check if email is verified for regular requests
            const isEmailVerified = await database.isEmailVerified(email);
            if (!isEmailVerified) {
              throw new HttpError(403, "Email address must be verified before requesting tokens. Please verify your email first.");
            }
          }

          if (!isValidAddress(address, constants.addressPrefix)) {
            throw new HttpError(400, "Address is not in the expected format for this chain.");
          }

          const entry = this.addressCounter.get(address);
          if (entry !== undefined) {
            const cooldownTimeMs = constants.cooldownTime * 1000;
            if (entry.getTime() + cooldownTimeMs > Date.now()) {
              throw new HttpError(
                429,
                `Too many requests for the same address. Please wait ${constants.cooldownTime} seconds.`,
              );
            }
          }

          const availableTokens = await faucet.availableTokens();
          const matchingDenom = availableTokens.find((availableDenom) => availableDenom === denom);
          if (matchingDenom === undefined) {
            throw new HttpError(422, `Token is not available. Available tokens are: ${availableTokens}`);
          }

          try {
            this.addressCounter.set(address, new Date());
            await faucet.credit(email, firstName, lastName, address, denom, amount, marketingOptin, country, company);
            context.response.body = { status: "ok" };
          } catch (error) {
            console.error("Failed to process credit request:", error);
            throw new HttpError(500, "Failed to process credit request");
          }
          break;
        }
        case "/export":
          await this.handleExportRequest(context, faucet);
          break;
        default:
        // koa sends 404 by default
      }
    });
  }

  public start(port: number): void {
    console.info(`Starting webserver on port ${port} ...`);
    this.api.listen(port);
  }
}
