/* =========================================================
   Domínio de Departamentos
   ========================================================= */

import { upsertDepartment, deleteDepartment, getDepartments } from "./store";
import { createId, nowLocalISO } from "./utils";

export function listDepartments(state) {
  const all = getDepartments();
  if (state && state !== "todos") {
    return all.filter((d) => (d.estado || null) === state);
  }
  return all.slice();
}

export function nameInUse(name, estado, ignoreId) {
  return listDepartments(estado).find(
    (d) => d.name.toUpperCase() === String(name).toUpperCase() && d.id !== ignoreId
  );
}

export function saveDepartment(data) {
  const now = nowLocalISO();
  const existing = data.id ? getDepartments().find((d) => d.id === data.id) : null;
  if (existing) {
    upsertDepartment({ ...existing, ...data, updatedAt: now });
    return;
  }
  upsertDepartment({
    id: createId(),
    name: data.name,
    shortName: data.shortName,
    estado: data.estado,
    createdAt: now,
    updatedAt: now
  });
}

export function deleteDepartmentRecord(id) {
  deleteDepartment(id);
}
