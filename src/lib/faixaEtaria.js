export const FAIXAS_IDADE = [
  { label: "0 a 20 anos", max: 20 },
  { label: "21 a 30 anos", max: 30 },
  { label: "31 a 40 anos", max: 40 },
  { label: "41 a 50 anos", max: 50 },
  { label: "51 anos ou mais", max: Infinity }
];

export const SEM_DATA_NASCIMENTO = "Sem data";

export function idadeEm(h, referencia) {
  const nasc = new Date(`${String(h.dataNascimento || "").slice(0, 10)}T00:00:00`);
  if (isNaN(nasc)) return null;
  let idade = referencia.getFullYear() - nasc.getFullYear();
  if (
    referencia.getMonth() < nasc.getMonth() ||
    (referencia.getMonth() === nasc.getMonth() && referencia.getDate() < nasc.getDate())
  ) {
    idade -= 1;
  }
  return idade >= 0 ? idade : null;
}

export function faixaIdadeLabel(h, referencia) {
  const idade = idadeEm(h, referencia);
  if (idade === null) return SEM_DATA_NASCIMENTO;
  return FAIXAS_IDADE.find((f) => idade <= f.max).label;
}
