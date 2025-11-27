import { isNonNullObject } from "@cosmjs/utils";

import { HttpError } from "./httperror";

export interface CreditRequestBodyData {
  /** The base denomination */
  readonly denom: string;
  /** The recipient address */
  readonly address: string;
  /** The amount of tokens to transfer */
  readonly amount: number;
  /** The email address */
  readonly email: string;
  /** Whether the user opted in for marketing */
  readonly marketingOptin: boolean;
  /** The first name of the user */
  readonly firstName: string;
  /** The last name of the user */
  readonly lastName: string;
  /** The company of the user */
  readonly company?: string;
}

export interface RequestOTPBodyData {
  /** The email address */
  readonly email: string;
}

export interface VerifyOTPBodyData {
  /** The email address */
  readonly email: string;
  /** The OTP code */
  readonly otp: string;
}

export class RequestParser {
  public static parseCreditBody(body: unknown): CreditRequestBodyData {
    if (!isNonNullObject(body) || Array.isArray(body)) {
      throw new HttpError(400, "Request body must be a dictionary.");
    }

    const { first_name: firstName, last_name: lastName, company, email, address, denom, amount, marketing_optin: marketingOptin } = body as any;

    if (typeof address !== "string") {
      throw new HttpError(400, "Property 'address' must be a string.");
    }

    if (address.length === 0) {
      throw new HttpError(400, "Property 'address' must not be empty.");
    }

    if (typeof denom !== "string") {
      throw new HttpError(400, "Property 'denom' must be a string.");
    }

    if (denom.length === 0) {
      throw new HttpError(400, "Property 'denom' must not be empty.");
    }

    if (typeof email !== "string") {
      throw new HttpError(400, "Property 'email' must be a string.");
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new Error("Invalid email address format");
    }

    if (amount && typeof amount !== "number") {
      throw new HttpError(400, "Property 'amount' must be a number.");
    }

    if (typeof marketingOptin !== "boolean") {
      throw new HttpError(400, "Property 'marketing_optin' must be a boolean.");
    }

    if (typeof firstName !== "string") {
      throw new HttpError(400, "Property 'first_name' must be a string.");
    }

    if (typeof lastName !== "string") {
      throw new HttpError(400, "Property 'last_name' must be a string.");
    }

    if (company && typeof company !== "string") {
      throw new HttpError(400, "Property 'company' must be a string.");
    }

    return {
      address,
      denom,
      amount,
      email,
      marketingOptin,
      firstName,
      lastName,
      company,
    };
  }

  public static parseRequestOTPBody(body: unknown): RequestOTPBodyData {
    if (!isNonNullObject(body) || Array.isArray(body)) {
      throw new HttpError(400, "Request body must be a dictionary.");
    }

    const { email } = body as any;

    if (typeof email !== "string") {
      throw new HttpError(400, "Property 'email' must be a string.");
    }

    if (email.length === 0) {
      throw new HttpError(400, "Property 'email' must not be empty.");
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new HttpError(400, "Invalid email address format");
    }

    return { email };
  }

  public static parseVerifyOTPBody(body: unknown): VerifyOTPBodyData {
    if (!isNonNullObject(body) || Array.isArray(body)) {
      throw new HttpError(400, "Request body must be a dictionary.");
    }

    const { email, otp } = body as any;

    if (typeof email !== "string") {
      throw new HttpError(400, "Property 'email' must be a string.");
    }

    if (email.length === 0) {
      throw new HttpError(400, "Property 'email' must not be empty.");
    }

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      throw new HttpError(400, "Invalid email address format");
    }

    if (typeof otp !== "string") {
      throw new HttpError(400, "Property 'otp' must be a string.");
    }

    if (otp.length !== 6 || !otp.match(/^\d{6}$/)) {
      throw new HttpError(400, "Property 'otp' must be a 6-digit number.");
    }

    return { email, otp };
  }
}
