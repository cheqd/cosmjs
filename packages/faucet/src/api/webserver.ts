import Koa from "koa";
import cors = require("@koa/cors");
import bodyParser from "koa-bodyparser";
import { Context } from "koa";

import { isValidAddress } from "../addresses";
import * as constants from "../constants";
import { Faucet } from "../faucet";
import { HttpError } from "./httperror";
import { RequestParser } from "./requestparser";
import { DateValidationError } from "../utils/dates";
import { TimeFilter } from "../database";

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

  private validateExportQuery(query: unknown): ExportRequestQuery {
    const { startDate, endDate } = query as Record<string, unknown>;
    
    // Check if dates are strings or undefined
    if (startDate !== undefined && typeof startDate !== 'string') {
      throw new HttpError(400, "startDate must be a string");
    }
    if (endDate !== undefined && typeof endDate !== 'string') {
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
    if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
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
        "Name",
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
            this.sanitizeCsvField(req.name),
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

      const dateRange = query.startDate && query.endDate 
        ? `${query.startDate}-to-${query.endDate}`
        : 'all-time';
      const filename = `faucet-requests-${dateRange}.csv`;
      
      context.response.set({
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=${filename}`,
        // Prevent caching of export data
        "Cache-Control": "no-store, max-age=0",
        "Pragma": "no-cache"
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

    this.api.use(async (context) => {
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
        case "/credit": {
          if (context.request.method !== "POST") {
            throw new HttpError(405, "This endpoint requires a POST request");
          }

          if (context.request.type !== "application/json") {
            throw new HttpError(415, "Content-type application/json expected");
          }

          const requestBody = (context.request as any).body;
          const creditBody = RequestParser.parseCreditBody(requestBody);
          const { address, denom, amount, email, marketingOptin, name, company } = creditBody;
          const country = this.getCountryFromRequest(context);

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
            await faucet.credit(email, name, address, denom, amount, marketingOptin, country, company);
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
