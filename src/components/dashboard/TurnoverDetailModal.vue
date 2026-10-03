<script setup>
import { computed } from "vue";
import Modal from "@/components/ui/Modal.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { STATE_NAMES } from "@/lib/config";
import { turnoverEntriesInRange, headcountMovements, findBranchByShortName, listRescisoes } from "@/lib/employees";
import { dateFilter } from "@/composables/useDateFilter";
import { useFilters } from "@/composables/useFilters";
import { formatValue, formatDate, formatCurrency, ymLabel } from "@/lib/utils";
import { regionalLabel } from "@/lib/regionais";

const props = defineProps({
  open: { type: Boolean, default: false },
  kind: { type: String, default: "geral" },
  regional: { type: String, default: "" }
});

const emit = defineEmits(["close"]);

const { state } = useFilters();

const isGeral = computed(() => props.kind === "geral");
const isAdmissao = computed(() => props.kind.startsWith("admissoes"));
const isColaboradores = computed(() => props.kind === "admissoes" || props.kind === "demissoes");
const rateLabel = computed(() => (isGeral.value ? "Geral" : isAdmissao.value ? "Entrada" : "Saída"));
const PERCENT = { type: "percent", decimals: 1 };

const range = computed(() =>
  dateFilter.start ? { start: dateFilter.start, end: dateFilter.end } : null
);

const rows = computed(() =>
  turnoverEntriesInRange(state.current, range.value).filter((t) => !props.regional || t.regional === props.regional).map((t) => {
    const admissoes = Number(t.admitidos) || 0;
    const demissoes = Number(t.demitidos) || 0;
    const ativos = Number(t.ativos) || 0;
    const quantidade = isGeral.value ? (admissoes + demissoes) / 2 : isAdmissao.value ? admissoes : demissoes;
    const branch = t.filial ? findBranchByShortName(t.filial, t.estado) : null;
    return {
      id: t.id,
      mes: t.mesReferencia,
      empresa: branch ? branch.name : t.filial || "—",
      estado: t.estado || "",
      admissoes,
      demissoes,
      quantidade,
      ativos,
      taxa: ativos ? (quantidade / ativos) * 100 : null
    };
  })
);

const rowsVisiveis = computed(() => (isGeral.value ? rows.value : rows.value.filter((r) => r.quantidade > 0)));

const colaboradoresRescisao = computed(() =>
  listRescisoes(state.current, range.value)
    .filter((r) => !props.regional || regionalLabel(r.regionalFilial) === props.regional)
    .map((r) => {
      const branch = r.filial ? findBranchByShortName(r.filial, r.estado) : null;
      return {
        id: r.id,
        colaborador: r.colaborador || "—",
        empresa: branch ? branch.name : r.filial || r.empresa || "—",
        estado: r.estado || "",
        data: r.ultDiaAviso || r.mesReferencia || "",
        motivo: r.motivo || "—",
        ultDiaAviso: r.ultDiaAviso || "",
        valorTotal: (Number(r.valorRescisao) || 0) + (Number(r.grrfConsig) || 0) + (Number(r.multa40) || 0)
      };
    })
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || a.colaborador.localeCompare(b.colaborador))
);

const colunasRescisao = computed(() => !isAdmissao.value && !props.regional);

const colaboradores = computed(() => {
  if (!isColaboradores.value) return [];
  if (colunasRescisao.value) return colaboradoresRescisao.value;
  const mov = headcountMovements(state.current, range.value);
  return (isAdmissao.value ? mov.admissoes : mov.demissoes)
    .filter((h) => !props.regional || regionalLabel(h.regional) === props.regional)
    .map((h) => {
      const branch = h.filial ? findBranchByShortName(h.filial, h.estado) : null;
      return {
        id: h.id,
        colaborador: h.colaborador || "—",
        empresa: branch ? branch.name : h.filial || "—",
        funcao: h.funcao || "—",
        estado: h.estado || "",
        data: (isAdmissao.value ? h.dataAdmissao : h.dataDesligamento) || ""
      };
    })
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || a.colaborador.localeCompare(b.colaborador));
});

const totalAtivos = computed(() => rows.value.reduce((sum, r) => sum + r.ativos, 0));

const totalAdmissoes = computed(() => rows.value.reduce((sum, r) => sum + r.admissoes, 0));
const totalDemissoes = computed(() => rows.value.reduce((sum, r) => sum + r.demissoes, 0));
const entradaTaxa = computed(() => (totalAtivos.value ? (totalAdmissoes.value / totalAtivos.value) * 100 : null));
const saidaTaxa = computed(() => (totalAtivos.value ? (totalDemissoes.value / totalAtivos.value) * 100 : null));
const geralTaxa = computed(() =>
  totalAtivos.value ? ((totalAdmissoes.value + totalDemissoes.value) / 2 / totalAtivos.value) * 100 : null
);

const escopo = computed(() => {
  const st = state.current;
  return !st || st === "todos" ? "Todos os estados" : STATE_NAMES[st] || st;
});
const periodo = computed(() => (dateFilter.start ? ymLabel(String(dateFilter.end || dateFilter.start).slice(0, 7)) : "Todo o período"));

const title = computed(() => {
  const base = isGeral.value ? "Turnover — Geral" : isAdmissao.value ? "Turnover — Admissões" : "Turnover — Demissões";
  return props.regional ? `${base} — ${props.regional}` : base;
});
</script>

<template>
  <Modal
    :title="title"
    :subtitle="`${escopo} · ${periodo}`"
    :open="open"
    max-width="max-w-4xl"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-4">
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent/5 p-4 dark:border-accent/25 dark:bg-accent/10"
      >
        <div class="flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Geral</p>
            <p
              class="text-3xl font-bold tabular-nums"
              :class="isGeral ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'"
            >
              {{ geralTaxa === null ? "—" : formatValue(PERCENT, geralTaxa) }}
            </p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Admissões</p>
            <p
              class="text-3xl font-bold tabular-nums"
              :class="isGeral || isAdmissao ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'"
            >
              {{ totalAdmissoes }}
            </p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Demissões</p>
            <p
              class="text-3xl font-bold tabular-nums"
              :class="isGeral || !isAdmissao ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'"
            >
              {{ totalDemissoes }}
            </p>
          </div>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 text-right">
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Entrada</p>
            <p class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              {{ entradaTaxa === null ? "—" : formatValue(PERCENT, entradaTaxa) }}
            </p>
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Saída</p>
            <p class="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              {{ saidaTaxa === null ? "—" : formatValue(PERCENT, saidaTaxa) }}
            </p>
          </div>
        </div>
      </div>

      <div v-if="isColaboradores && colaboradores.length" class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[26rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Colaborador</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Empresa</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Estado</th>
                <th v-if="!colunasRescisao" class="whitespace-nowrap px-4 py-2.5 font-semibold">{{ isAdmissao ? "Data de admissão" : "Data de desligamento" }}</th>
                <template v-else>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Motivo</th>
                  <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Último dia de aviso</th>
                  <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">Valor total</th>
                </template>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr v-for="c in colaboradores" :key="c.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ c.colaborador }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ c.empresa }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ c.estado || "—" }}</td>
                <td v-if="!colunasRescisao" class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ c.data ? formatDate(c.data) : "—" }}</td>
                <template v-else>
                  <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ c.motivo }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ c.ultDiaAviso ? formatDate(c.ultDiaAviso) : "—" }}</td>
                  <td class="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{{ formatCurrency(c.valorTotal) }}</td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="!isColaboradores && rowsVisiveis.length" class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
        <div class="max-h-[26rem] overflow-auto">
          <table class="w-full min-w-max text-left text-sm">
            <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
              <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Mês</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Empresa</th>
                <th class="whitespace-nowrap px-4 py-2.5 font-semibold">Estado</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold" :class="{ 'text-accent': isGeral || isAdmissao }">Admissões</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold" :class="{ 'text-accent': isGeral || !isAdmissao }">Demissões</th>
                <th class="whitespace-nowrap px-4 py-2.5 text-right font-semibold">{{ rateLabel }} (%)</th>
              </tr>
            </thead>
            <tbody class="uppercase">
              <tr v-for="r in rowsVisiveis" :key="r.id" class="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ r.mes ? ymLabel(r.mes) : "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ r.empresa }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ r.estado || "—" }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums" :class="isGeral || isAdmissao ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'">{{ r.admissoes }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums" :class="isGeral || !isAdmissao ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'">{{ r.demissoes }}</td>
                <td class="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                  {{ r.taxa === null ? "—" : formatValue(PERCENT, r.taxa) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="border-t border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
          {{ rowsVisiveis.length === 1 ? "1 lançamento" : `${rowsVisiveis.length} lançamentos` }}
        </div>
      </div>

      <EmptyState v-else title="Sem informações suficientes" />
    </div>
  </Modal>
</template>
