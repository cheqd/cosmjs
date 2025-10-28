import {
  assertIsDeliverTxSuccess as assertIsDeliverTxSuccessStargate,
  calculateFee,
  SigningStargateClient,
  StargateClient,
} from "@cosmjs/stargate";
import { isDefined, sleep } from "@cosmjs/utils";
import { scheduler } from "./jobs/scheduler";
import { MailchimpService } from "./jobs/sync-mailchimp";

import * as constants from "./constants";
import { debugAccount, logAccountsState, logSendJob } from "./debugging";
import { PathBuilder } from "./pathbuilder";
import { createClients, createWallets } from "./profile";
import { TokenConfiguration, TokenManager } from "./tokenmanager";
import { MinimalAccount, SendJob } from "./types";
import { Uint53 } from "@cosmjs/math";
import { database, FaucetRequest } from "./database";

export class Faucet {
  public static async make(
    apiUrl: string,
    addressPrefix: string,
    config: TokenConfiguration,
    mnemonic: string,
    pathBuilder: PathBuilder,
    numberOfDistributors: number,
    logging = false,
  ): Promise<Faucet> {
    const wallets = await createWallets(mnemonic, pathBuilder, addressPrefix, numberOfDistributors, logging);
    const clients = await createClients(apiUrl, wallets);
    const readonlyClient = await StargateClient.connect(apiUrl);

    // Start the scheduler
    scheduler.start();

    return new Faucet(addressPrefix, config, clients, readonlyClient, logging);
  }

  public readonly addressPrefix: string;
  public readonly holderAddress: string;
  public readonly distributorAddresses: readonly string[];

  private readonly tokenConfig: TokenConfiguration;
  private readonly tokenManager: TokenManager;
  private readonly readOnlyClient: StargateClient;
  private readonly clients: { [senderAddress: string]: SigningStargateClient };
  private readonly logging: boolean;
  private creditCount = 0;

  private constructor(
    addressPrefix: string,
    config: TokenConfiguration,
    clients: ReadonlyArray<readonly [string, SigningStargateClient]>,
    readonlyClient: StargateClient,
    logging = false,
  ) {
    this.addressPrefix = addressPrefix;
    this.tokenConfig = config;
    this.tokenManager = new TokenManager(config);

    this.readOnlyClient = readonlyClient;
    [this.holderAddress, ...this.distributorAddresses] = clients.map(([address]) => address);
    this.clients = clients.reduce(
      (acc, [senderAddress, client]) => ({ ...acc, [senderAddress]: client }),
      {},
    );
    this.logging = logging;
  }

  /**
   * Returns a list of denoms of tokens owned by the the holder and configured in the faucet
   */
  public async availableTokens(): Promise<string[]> {
    const { balance } = await this.loadAccount(this.holderAddress);
    return balance
      .filter((b) => b.amount !== "0")
      .map((b) => this.tokenConfig.bankTokens.find((token) => token == b.denom))
      .filter(isDefined);
  }

  /**
   * Creates and broadcasts a send transaction. Then waits until the transaction is in a block.
   * Throws an error if the transaction failed.
   */
  public async send(job: SendJob): Promise<string> {
    const client = this.clients[job.sender];
    const fee = calculateFee(constants.gasLimitSend, constants.gasPrice);
    const result = await client.sendTokens(job.sender, job.recipient, [job.amount], fee, constants.memo);
    assertIsDeliverTxSuccessStargate(result);
    return result.transactionHash;
  }

  /** Use one of the distributor accounts to send tokens to user */
  public async credit(
    email: string,
    name: string,
    toAddress: string,
    denom: string,
    amount: number,
    marketingOptin: boolean,
    country: string,
    company?: string,
  ): Promise<void> {
    if (this.distributorAddresses.length === 0) {
      throw new Error("No distributor account available");
    }

    const sender = this.distributorAddresses[this.getCreditCount() % this.distributorAddresses.length];

    const tokenAmount = this.tokenManager.creditAmount(denom, new Uint53(1), amount);
    const job: SendJob = {
      sender: sender,
      recipient: toAddress,
      amount: tokenAmount,
    };
    if (this.logging) logSendJob(job);

    try {
      const result = await this.send(job);

      const faucetRequest: FaucetRequest = {
        email_address: email,
        name: name,
        from_address: sender,
        to_address: toAddress,
        hash: result,
        denom: tokenAmount.denom,
        marketing_optin: marketingOptin,
        amount: BigInt(tokenAmount.amount),
        country: country,
        company: company || "",
      };

      // Save request info into database
      await database.saveRequest(faucetRequest);

      // Trigger Mailchimp flow (upsert subscriber with tags only; no scheduler/job run here)
      if (company !== 'Requested via cheqd Studio') {
        try {
          const mailchimpService = new MailchimpService();
          const tags: string[] = ["Testnet-Faucet"];
          await mailchimpService.upsertSubscriberWithTags(email, name, company, tags);
        } catch (error) {
          console.error("Mailchimp flow failed:", error);
        }
      }

      // Trigger Zapier webhook to save request info into Pipedrive
      const webhookUrl = constants.zapierWebhookUrl;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email: email,
              name: name,
              company: company,
              country: country,
              address: toAddress,
            }),
          });
        } catch (error) {
          console.error("Zapier webhook not defined:", error);
        }
      }
    } catch (error) {
      console.error("Failed to process credit request:", error);
      throw error;
    }
  }

  /** Returns a list to token denoms which are configured */
  public configuredTokens(): string[] {
    return Array.from(this.tokenConfig.bankTokens);
  }

  public async loadAccount(address: string): Promise<MinimalAccount> {
    const balance = await this.readOnlyClient.getAllBalances(address);
    return {
      address: address,
      balance: balance,
    };
  }

  public async loadAccounts(): Promise<readonly MinimalAccount[]> {
    const addresses = [this.holderAddress, ...this.distributorAddresses];
    return Promise.all(addresses.map(this.loadAccount.bind(this)));
  }

  public async refill(): Promise<void> {
    if (this.logging) {
      console.info(`Connected to network: ${await this.readOnlyClient.getChainId()}`);
      console.info(`Tokens on network: ${this.configuredTokens().join(", ")}`);
    }

    const accounts = await this.loadAccounts();
    if (this.logging) logAccountsState(accounts);
    const [_, ...distributorAccounts] = accounts;

    const availableTokenDenoms = await this.availableTokens();
    if (this.logging) console.info("Available tokens:", availableTokenDenoms);

    const jobs: SendJob[] = [];
    for (const denom of availableTokenDenoms) {
      const refillDistibutors = distributorAccounts.filter((account) =>
        this.tokenManager.needsRefill(account, denom),
      );

      if (this.logging) {
        console.info(`Refilling ${denom} of:`);
        console.info(
          refillDistibutors.length
            ? refillDistibutors.map((r) => `  ${debugAccount(r)}`).join("\n")
            : "  none",
        );
      }
      for (const refillDistibutor of refillDistibutors) {
        jobs.push({
          sender: this.holderAddress,
          recipient: refillDistibutor.address,
          amount: this.tokenManager.refillAmount(denom),
        });
      }
    }
    if (jobs.length > 0) {
      for (const job of jobs) {
        if (this.logging) logSendJob(job);
        // don't crash faucet when one send fails
        try {
          await this.send(job);
        } catch (error) {
          console.error(error);
        }
        await sleep(75);
      }

      if (this.logging) {
        console.info("Done refilling accounts.");
        logAccountsState(await this.loadAccounts());
      }
    } else {
      if (this.logging) {
        console.info("Nothing to be done. Anyways, thanks for checking.");
      }
    }
  }

  /** returns an integer >= 0 that increments and is unique for this instance */
  private getCreditCount(): number {
    return this.creditCount++;
  }

  public async getRequests(query: { startDate?: string; endDate?: string }) {
    return database.getRequests(query);
  }
}
