import { DurableObject } from "cloudflare:workers";
import { bulkWriteViaSheetsApi } from "../services/records";
import type { Estado } from "./tables";
import type { Bindings } from "../types";

// Fila de gravação por aba. Um Durable Object por aba (idFromName(aba)) recebe
// TODAS as gravações em lote dessa aba e as executa uma de cada vez.
//
// Por que existe: a API do Google Sheets não tem lock. Uma gravação localiza a
// linha pelo número (lido um instante antes); se outra gravação apagar uma
// linha acima nesse meio tempo, os números deslocam e a primeira escreve na
// linha errada — sobrescrevendo o registro de outra pessoa. Medido: sem a fila,
// alterar e apagar ao mesmo tempo na mesma aba corrompia a linha em 4 de 5
// tentativas. O Apps Script tinha o LockService para isso; aqui é este objeto.
//
// Um Durable Object é single-thread, mas intercala requisições nos `await` de
// chamadas externas (fetch). Por isso a fila é explícita (`chain`).
export class SheetWriter extends DurableObject<Bindings> {
  private chain: Promise<unknown> = Promise.resolve();

  bulk(entityKey: string, estado: Estado, upserts: unknown[], deletes: unknown[]) {
    const run = this.chain.then(() => bulkWriteViaSheetsApi(this.env, entityKey, estado, upserts, deletes));
    // A fila segue mesmo se esta gravação falhar; o erro vai só para quem chamou.
    this.chain = run.catch(() => {});
    return run;
  }
}
