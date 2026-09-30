import { DurableObject } from "cloudflare:workers";
import { bulkWriteViaSheetsApi } from "../services/records";
import type { Estado } from "./tables";
import type { Bindings } from "../types";

export class SheetWriter extends DurableObject<Bindings> {
  private chain: Promise<unknown> = Promise.resolve();

  bulk(entityKey: string, estado: Estado, upserts: unknown[], deletes: unknown[]) {
    const run = this.chain.then(() => bulkWriteViaSheetsApi(this.env, entityKey, estado, upserts, deletes));
    this.chain = run.catch(() => {});
    return run;
  }
}
