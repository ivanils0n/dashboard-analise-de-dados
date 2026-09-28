// Estados são fixos (RO/AM/PA) — não precisam de aba própria na planilha.
const ESTADOS = [
  { sigla: "AM", nome: "Amazonas" },
  { sigla: "PA", nome: "Pará" },
  { sigla: "RO", nome: "Rondônia" }
];

export async function listEstados(_env: unknown) {
  return ESTADOS;
}

export async function getEstado(_env: unknown, sigla: string) {
  const upper = sigla.toUpperCase();
  return ESTADOS.find((estado) => estado.sigla === upper) ?? null;
}
