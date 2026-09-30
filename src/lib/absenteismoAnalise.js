/* Análise de absenteísmo (modal do KPI): tudo calculado a partir das ocorrências
   do Mapa de Absenteísmo e do Headcount do mês.

   Regras (mostradas no modal):
   - Dias úteis do mês: segunda a sábado (domingo é folga, como no mapa).
   - Dias de ausência de uma ocorrência: Falta, Atestado, Declaração e Acidente de
     trabalho = 1 dia; Meio período = 0,5; Advertência não é ausência (0).
   - Taxa de absenteísmo = dias de ausência ÷ (ativos × dias úteis) × 100.
   - Ativos = colaboradores ativos do Headcount do mês (ou do mais recente anterior,
     se o mês ainda não tem Headcount — ver headcountMonthFor). */
import { getOcorrencias } from "./store";
import { listHeadcountRecords } from "./employees";
import { TIPOS, competenciaYm, headcountMonthFor, isOcorrenciaAusencia } from "./absenteismo";
import { nameKey, ymLabel } from "./utils";

export const DIAS_SEMANA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
/* Ordem de exibição: a semana começa na segunda. */
const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

const PESO_MOTIVO = { Falta: 1, Atestado: 1, Declaração: 1, "Meio Expediente": 0.5 };

export function diasDeAusencia(o) {
  const base = o.motivo && o.motivo !== "Presente" ? (PESO_MOTIVO[o.motivo] ?? 1) : 0;
  return Math.max(base, o.acidente ? 1 : 0);
}

export function shiftYm(ym, delta) {
  const [y, m] = String(ym).split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* Dias úteis (segunda a sábado) de um mês YYYY-MM. */
export function diasUteis(ym) {
  const [y, m] = String(ym).split("-").map(Number);
  const total = new Date(y, m, 0).getDate();
  let n = 0;
  for (let d = 1; d <= total; d++) if (new Date(y, m - 1, d).getDay() !== 0) n++;
  return n;
}

const norm = (v) => String(v ?? "").trim().toUpperCase();
const round1 = (n) => Math.round(n * 10) / 10;
const pct = (num, den) => (den > 0 ? (num / den) * 100 : null);

/* Ocorrências de ausência do mês (pela competência) e do estado, já achatadas. */
export function ocorrenciasDoMes(ym, estado) {
  const uf = String(estado || "").toUpperCase();
  const todos = !uf || uf === "TODOS";
  return getOcorrencias()
    .filter(
      (o) =>
        isOcorrenciaAusencia(o.meta) &&
        competenciaYm(o.meta, o.date) === ym &&
        (todos || String(o.meta.estado || "").toUpperCase() === uf)
    )
    .map((o) => ({
      id: o.id,
      date: o.date,
      colaborador: o.meta.colaborador,
      key: nameKey(o.meta.colaborador),
      setor: o.meta.setor || "",
      filial: o.meta.filial || "",
      estado: String(o.meta.estado || "").toUpperCase() || "—",
      motivo: o.meta.motivo,
      advertencia: !!o.meta.advertencia,
      acidente: !!o.meta.acidente,
      observacao: o.meta.observacao || "",
      dias: diasDeAusencia({ motivo: o.meta.motivo, acidente: !!o.meta.acidente })
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/* Ativos do Headcount usados como base do mês. */
function ativosDoMes(ym, estado) {
  const hc = headcountMonthFor(estado, ym);
  return { rows: listHeadcountRecords(estado, hc.ym), refYm: hc.ym, fallback: hc.fallback };
}

/* Totais de um mês (usado para o mês filtrado, o anterior e a tendência). */
function resumoDoMes(ym, estado) {
  const ocs = ocorrenciasDoMes(ym, estado);
  const ativos = ativosDoMes(ym, estado);
  const uteis = diasUteis(ym);
  const dias = ocs.reduce((s, o) => s + o.dias, 0);
  return {
    ym,
    total: ocs.length,
    dias,
    afetados: new Set(ocs.map((o) => o.key)).size,
    ativos: ativos.rows.length,
    uteis,
    taxa: pct(dias, ativos.rows.length * uteis)
  };
}

/* Agrupa ocorrências + ativos por um rótulo e calcula a taxa de cada grupo. */
function agrupar(ocs, ativosRows, labelOc, labelAtivo, uteis, { incluirSemOcorrencia = false } = {}) {
  const mapa = new Map();
  const get = (label) => {
    if (!mapa.has(label)) mapa.set(label, { label, ocorrencias: 0, dias: 0, ativos: 0, itens: [], afetados: new Set() });
    return mapa.get(label);
  };
  ocs.forEach((o) => {
    const g = get(labelOc(o));
    g.ocorrencias++;
    g.dias += o.dias;
    g.itens.push(o);
    g.afetados.add(o.key);
  });
  ativosRows.forEach((h) => {
    const label = labelAtivo(h);
    if (mapa.has(label) || incluirSemOcorrencia) get(label).ativos++;
  });
  return [...mapa.values()].map((g) => ({
    label: g.label,
    ocorrencias: g.ocorrencias,
    dias: g.dias,
    ativos: g.ativos,
    afetados: g.afetados.size,
    itens: g.itens,
    taxa: pct(g.dias, g.ativos * uteis)
  }));
}

const porTaxa = (a, b) => (b.taxa ?? -1) - (a.taxa ?? -1) || b.ocorrencias - a.ocorrencias || a.label.localeCompare(b.label, "pt-BR");

export function analiseAbsenteismo(ym, estado) {
  const uf = String(estado || "todos");
  const ocs = ocorrenciasDoMes(ym, uf);
  const ativos = ativosDoMes(ym, uf);
  const uteis = diasUteis(ym);

  // Headcount por nome (gênero, admissão, função/filial de referência)
  const hcPorNome = new Map();
  ativos.rows.forEach((h) => hcPorNome.set(nameKey(h.colaborador), h));

  // Enriquecimento: função/filial da própria ocorrência, senão as do Headcount
  const itens = ocs.map((o) => {
    const h = hcPorNome.get(o.key);
    return {
      ...o,
      setor: norm(o.setor || (h && h.funcao)) || "SEM FUNÇÃO",
      filial: norm(o.filial || (h && h.filial)) || "SEM FILIAL",
      genero: h && h.genero ? String(h.genero).toLowerCase() : null,
      admissao: h && h.dataAdmissao ? String(h.dataAdmissao).slice(0, 10) : null
    };
  });

  const dias = itens.reduce((s, o) => s + o.dias, 0);
  const afetadosSet = new Set(itens.map((o) => o.key));
  const taxa = pct(dias, ativos.rows.length * uteis);

  const prevYm = shiftYm(ym, -1);
  const prev = resumoDoMes(prevYm, uf);

  // ---- distribuições ----
  /* Cada ocorrência cai em UM tipo (a soma das fatias = total): o motivo; sem motivo
     (só marcação), Acidente de trabalho ou Advertência. */
  const tipoPrincipal = (o) =>
    TIPOS.find((t) => t.has(o) && o.motivo && o.motivo !== "Presente" && t.value === o.motivo) ||
    (o.acidente ? TIPOS.find((t) => t.key === "acidente") : null) ||
    (o.advertencia ? TIPOS.find((t) => t.key === "advertencia") : null) ||
    TIPOS.find((t) => t.has(o));
  const porMotivo = TIPOS.map((t) => {
    const lista = itens.filter((o) => tipoPrincipal(o) === t);
    return { tipo: t, label: t.label, value: lista.length, color: t.hex, itens: lista };
  }).filter((d) => d.value > 0);

  const porEstado = [];
  const estMap = new Map();
  itens.forEach((o) => {
    if (!estMap.has(o.estado)) estMap.set(o.estado, []);
    estMap.get(o.estado).push(o);
  });
  estMap.forEach((list, label) => porEstado.push({ label, value: list.length, itens: list }));
  porEstado.sort((a, b) => b.value - a.value);

  const GENEROS = { masculino: "Masculino", feminino: "Feminino" };
  const porGenero = agrupar(
    itens,
    ativos.rows,
    (o) => GENEROS[o.genero] || "Não informado",
    (h) => GENEROS[String(h.genero || "").toLowerCase()] || "Não informado",
    uteis,
    { incluirSemOcorrencia: true }
  )
    .filter((g) => g.ocorrencias > 0 || g.ativos > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));

  const porFuncao = agrupar(itens, ativos.rows, (o) => o.setor, (h) => norm(h.funcao) || "SEM FUNÇÃO", uteis).sort(porTaxa);

  const prevItens = ocorrenciasDoMes(prevYm, uf);
  const prevAtivos = ativosDoMes(prevYm, uf);
  const prevFilial = new Map(
    agrupar(
      prevItens.map((o) => ({ ...o, filial: norm(o.filial) || "SEM FILIAL" })),
      prevAtivos.rows,
      (o) => o.filial,
      (h) => norm(h.filial) || "SEM FILIAL",
      diasUteis(prevYm)
    ).map((g) => [g.label, g])
  );
  const porFilial = agrupar(itens, ativos.rows, (o) => o.filial, (h) => norm(h.filial) || "SEM FILIAL", uteis)
    .map((g) => {
      const p = prevFilial.get(g.label);
      return { ...g, taxaAnterior: p ? p.taxa : null, variacao: g.taxa != null && p && p.taxa != null ? g.taxa - p.taxa : null };
    })
    .sort(porTaxa);

  // ---- quando acontece ----
  const [y, m] = ym.split("-").map(Number);
  const nDias = new Date(y, m, 0).getDate();
  const porDiaDoMes = Array.from({ length: nDias }, (_, i) => ({ label: String(i + 1), dia: i + 1, value: 0, itens: [] }));
  const semana = DIAS_SEMANA.map((label, dow) => ({ label, dow, value: 0, itens: [] }));
  itens.forEach((o) => {
    const d = Number(String(o.date).slice(8, 10));
    if (porDiaDoMes[d - 1]) {
      porDiaDoMes[d - 1].value++;
      porDiaDoMes[d - 1].itens.push(o);
    }
    const dow = new Date(`${o.date}T00:00:00`).getDay();
    if (semana[dow]) {
      semana[dow].value++;
      semana[dow].itens.push(o);
    }
  });
  const porDiaSemana = ORDEM_SEMANA.map((dow) => semana[dow]);

  // ---- tendência (6 meses até o filtrado) ----
  const tendencia = Array.from({ length: 6 }, (_, i) => {
    const mes = shiftYm(ym, i - 5);
    const r = mes === ym ? { ym, total: itens.length, taxa } : resumoDoMes(mes, uf);
    return { ym: mes, label: ymLabel(mes), total: r.total, taxa: r.taxa };
  });

  // ---- reincidentes ----
  const porColab = new Map();
  itens.forEach((o) => {
    if (!porColab.has(o.key)) porColab.set(o.key, { colaborador: o.colaborador, filial: o.filial, setor: o.setor, total: 0, dias: 0, faltas: 0, advertencias: 0, itens: [] });
    const c = porColab.get(o.key);
    c.total++;
    c.dias += o.dias;
    if (o.motivo === "Falta") c.faltas++;
    if (o.advertencia) c.advertencias++;
    c.itens.push(o);
  });
  const reincidentes = [...porColab.values()]
    .sort((a, b) => b.total - a.total || b.dias - a.dias || a.colaborador.localeCompare(b.colaborador, "pt-BR"))
    .slice(0, 10)
    .map((c) => ({ ...c, alerta: c.total >= 3 || c.faltas >= 3 || c.advertencias >= 1 }));
  const comTresOuMais = [...porColab.values()].filter((c) => c.total >= 3).length;

  // ---- período de experiência (até 90 dias de casa na data da ocorrência) ----
  const emExperiencia = itens.filter((o) => {
    if (!o.admissao) return false;
    const dias = (new Date(`${o.date}T00:00:00`) - new Date(`${o.admissao}T00:00:00`)) / 86400000;
    return dias >= 0 && dias <= 90;
  });
  const experiencia = {
    emExperiencia,
    demais: itens.filter((o) => !emExperiencia.includes(o)),
    pctDasOcorrencias: pct(emExperiencia.length, itens.length)
  };

  // ---- textos de destaque ----
  const insights = [];
  const delta = (cur, ant) => (ant > 0 ? ((cur - ant) / ant) * 100 : null);
  const dTotal = delta(itens.length, prev.total);
  if (itens.length === 0) {
    insights.push({ tone: "ok", text: `Nenhuma ocorrência de absenteísmo em ${ymLabel(ym)}.` });
  } else {
    if (dTotal != null) {
      insights.push({
        tone: dTotal > 10 ? "warn" : dTotal < -10 ? "ok" : "info",
        text: `${itens.length} ${itens.length === 1 ? "ocorrência" : "ocorrências"} em ${ymLabel(ym)}, ${dTotal >= 0 ? "alta" : "queda"} de ${Math.abs(round1(dTotal)).toString().replace(".", ",")}% contra ${ymLabel(prevYm)} (${prev.total}).`
      });
    }
    const top = porFilial[0];
    if (top && top.taxa != null) {
      insights.push({
        tone: "warn",
        text: `${top.label} tem a maior taxa de absenteísmo: ${round1(top.taxa).toString().replace(".", ",")}% (${top.ocorrencias} ${top.ocorrencias === 1 ? "ocorrência" : "ocorrências"}).`
      });
    }
    const top3 = [...porFilial].sort((a, b) => b.ocorrencias - a.ocorrencias).slice(0, 3);
    if (porFilial.length > 3) {
      const share = pct(top3.reduce((s, g) => s + g.ocorrencias, 0), itens.length);
      insights.push({ tone: "info", text: `As 3 filiais com mais ocorrências (${top3.map((g) => g.label).join(", ")}) concentram ${Math.round(share)}% do total.` });
    }
    const diaTop = [...porDiaSemana].sort((a, b) => b.value - a.value)[0];
    if (diaTop && diaTop.value > 0 && itens.length >= 5) {
      insights.push({ tone: "info", text: `${diaTop.label} é o dia da semana com mais ocorrências (${Math.round(pct(diaTop.value, itens.length))}% do mês).` });
    }
    const motivoTop = [...porMotivo].sort((a, b) => b.value - a.value)[0];
    if (motivoTop) {
      insights.push({ tone: "info", text: `${motivoTop.label} é o tipo mais frequente: ${Math.round(pct(motivoTop.value, itens.length))}% das ocorrências.` });
    }
    if (comTresOuMais > 0) {
      insights.push({ tone: "warn", text: `${comTresOuMais} ${comTresOuMais === 1 ? "colaborador tem" : "colaboradores têm"} 3 ou mais ocorrências no mês.` });
    }
    if (experiencia.emExperiencia.length > 0) {
      insights.push({ tone: "info", text: `${experiencia.emExperiencia.length} ${experiencia.emExperiencia.length === 1 ? "ocorrência é" : "ocorrências são"} de quem está em período de experiência (até 90 dias de casa).` });
    }
  }

  return {
    ym,
    estado: uf,
    uteis,
    ativos: ativos.rows.length,
    headcountRef: { ym: ativos.refYm, fallback: ativos.fallback },
    itens,
    total: itens.length,
    dias,
    taxa,
    afetados: afetadosSet.size,
    mediaPorAfetado: afetadosSet.size ? itens.length / afetadosSet.size : null,
    prev,
    variacao: {
      total: dTotal,
      taxa: taxa != null && prev.taxa != null ? taxa - prev.taxa : null,
      dias: delta(dias, prev.dias),
      afetados: delta(afetadosSet.size, prev.afetados)
    },
    porMotivo,
    porEstado,
    porGenero,
    porFuncao,
    porFilial,
    porDiaDoMes,
    porDiaSemana,
    tendencia,
    reincidentes,
    comTresOuMais,
    experiencia,
    insights
  };
}
