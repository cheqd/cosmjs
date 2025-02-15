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
  /** The name of the user */
  readonly name: string;
  /** The company of the user */
  readonly company?: string;
}

export class RequestParser {
  public static parseCreditBody(body: unknown): CreditRequestBodyData {
    if (!isNonNullObject(body) || Array.isArray(body)) {
      throw new HttpError(400, "Request body must be a dictionary.");
    }

    const { 
      name,
      company,
      email,
      address,
      denom,
      amount,
      marketing_optin: marketingOptin,
    } = body as any;

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
    
    if (email && typeof email !== "string") {
      throw new HttpError(400, "Property 'email' must be a string.");
    }

    if (!email.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
      throw new HttpError(400, "Invalid email format.");
    }

    if (amount && typeof amount !== "number") {
      throw new HttpError(400, "Property 'amount' must be a number.");
    }

    if (marketingOptin && typeof marketingOptin !== "boolean") {
      throw new HttpError(400, "Property 'marketing_optin' must be a boolean.");
    }
    
    if (name &&typeof name !== "string") {
      throw new HttpError(400, "Property 'name' must be a string.");
    }

    if (typeof company !== "string") {
      throw new HttpError(400, "Property 'company' must be a string.");
    }

    return {
      address,
      denom,
      amount,
      email,
      marketingOptin,
      name,
      company
    };
  }
}
