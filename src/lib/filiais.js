// Domínio de Filiais.

import { getBranches, upsertBranch, deleteBranch } from "./store";
import { createId, nowLocalISO, sameState } from "./utils";

export function listBranches(state) {
  const all = getBranches();
  if (state && state !== "todos") {
    return all.filter((b) => sameState(b.estado, state));
  }
  return all;
}

export function saveBranch(data) {
  const now = nowLocalISO();
  const existing = data.id ? getBranches().find((b) => b.id === data.id) : null;
  if (existing) {
    upsertBranch({ ...existing, ...data, updatedAt: now });
    return;
  }
  upsertBranch({
    id: createId(),
    branchId: data.branchId,
    cnpj: data.cnpj,
    name: data.name,
    shortName: data.shortName,
    manager: data.manager,
    estado: data.estado,
    createdAt: now,
    updatedAt: now
  });
}

export function deleteBranchRecord(id) {
  deleteBranch(id);
}
