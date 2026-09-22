// Domínio de Filiais.

import { getBranches, upsertBranch, deleteBranch } from "./store";
import { createId, sameState } from "./utils";

export function listBranches(state) {
  const all = getBranches();
  if (state && state !== "todos") {
    return all.filter((b) => sameState(b.estado, state));
  }
  return all;
}

export function saveBranch(data) {
  const existing = data.id ? getBranches().find((b) => b.id === data.id) : null;
  if (existing) {
    upsertBranch({ ...existing, ...data });
    return;
  }
  upsertBranch({
    id: createId(),
    cnpj: data.cnpj,
    name: data.name,
    shortName: data.shortName,
    manager: data.manager,
    estado: data.estado
  });
}

export function deleteBranchRecord(id) {
  deleteBranch(id);
}
