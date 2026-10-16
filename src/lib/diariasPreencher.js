import { getEntriesFor, updateEntry } from "@/lib/store";
import { listHeadcountRecords } from "@/lib/employees";
import { regionalDaFilial } from "@/lib/db";
import { employeeNameKey } from "@/lib/metrics";

const vazio = (v) => !String(v ?? "").trim();
const ymDe = (e) => String((e.meta && e.meta.competencia) || e.date || "").slice(0, 7);

export function preencherDiarias(estado) {
  const caches = new Map();
  const mapa = (st, ym) => {
    const chave = `${st}|${ym}`;
    if (!caches.has(chave)) {
      const porNome = new Map();
      listHeadcountRecords(st, ym || null, { incluirDesligados: true }).forEach((h) => {
        const nome = employeeNameKey(h.colaborador);
        const atual = porNome.get(nome);
        if (nome && (!atual || String(h.mesReferente || "") > String(atual.mesReferente || ""))) porNome.set(nome, h);
      });
      caches.set(chave, porNome);
    }
    return caches.get(chave);
  };

  let preenchidas = 0;
  getEntriesFor("custo_diaria", estado).forEach((e) => {
    const meta = e.meta || {};
    if (!vazio(meta.funcao) && !vazio(meta.filial)) return;
    const nome = employeeNameKey(meta.employeeName);
    if (!nome) return;

    const st = meta.estado || (estado && estado !== "todos" ? estado : "todos");
    const h = mapa(st, ymDe(e)).get(nome) || mapa(st, "").get(nome);
    if (!h) return;

    const patch = {};
    if (vazio(meta.funcao) && !vazio(h.funcao)) patch.funcao = h.funcao;
    if (vazio(meta.filial) && !vazio(h.filial)) patch.filial = h.filial;
    if (!Object.keys(patch).length) return;
    if (vazio(meta.regional)) patch.regional = regionalDaFilial(patch.filial || meta.filial, st === "todos" ? h.estado : st);

    updateEntry("custo_diaria", e.id, { meta: { ...meta, ...patch } });
    preenchidas++;
  });
  return preenchidas;
}
