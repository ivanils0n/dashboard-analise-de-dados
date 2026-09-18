<script setup>
import { ref, reactive, computed, watch, onMounted, onActivated } from "vue";
import Badge from "@/components/ui/Badge.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import Modal from "@/components/ui/Modal.vue";
import LoadingOverlay from "@/components/ui/LoadingOverlay.vue";
import DateRangeFilter from "@/components/dashboard/DateRangeFilter.vue";
import { useToast } from "@/composables/useToast";
import { useDialog } from "@/composables/useDialog";
import { useFilters } from "@/composables/useFilters";
import { useEquipeFilters } from "@/composables/useEquipeFilters";
import { DEFAULT_STATE, STATES, STATUS_LABELS, TYPE_LABELS, STATE_NAMES } from "@/lib/config";
import {
  getEmployeeById,
  getBranchById,
  getDepartmentById,
  getEmployees,
  deleteEmployee,
  upsertEmployee,
  addEntry
} from "@/lib/store";
import {
  listDepartments,
  saveEmployee,
  removeEmployee,
  syncAll,
  listEmployees,
  findEmployeesByName,
  normalizePersonName
} from "@/lib/employees";
import { listBranches } from "@/lib/filiais";
import { hydrateState } from "@/lib/db";
import { beginLoading, endLoading } from "@/composables/useLoading";
import { readWorkbookFile, parseEmployeeSheet, downloadEquipeTemplate } from "@/lib/export";
import { todayISO, formatDate, formatDateTime, normalizeText } from "@/lib/utils";

const { show: toast } = useToast();
const { confirm } = useDialog();
const { state: filters } = useFilters();
const { equipeFilter: ef, reset: resetEquipeFilters } = useEquipeFilters();

const form = reactive({
  id: null,
  name: "",
  cargo: "",
  sector: "",
  user: "",
  branch: "",
  hiredAt: todayISO(),
  status: "ativo",
  firedAt: "",
  type: "experiencia",
  estado: "",
  liderImediato: "",
  gerenteRegional: ""
});

const departmentOptions = computed(() => {
  const state = form.estado || (filters.current !== "todos" ? filters.current : DEFAULT_STATE);
  return listDepartments(state);
});

/* Departamentos disponíveis para o filtro da listagem (estado atual). */
const deptFilterOptions = computed(() => listDepartments(filters.current));

const branchOptions = computed(() => {
  const state = form.estado || (filters.current !== "todos" ? filters.current : DEFAULT_STATE);
  return listBranches(state);
});

const showFiredAt = computed(() => form.status === "desligado");

const tableList = computed(() => {
  let list = listEmployees(filters.current);
  const q = normalizeText(ef.search).trim();
  if (q) {
    list = list.filter((e) => {
      const filial = e.filialId ? getBranchById(e.filialId) : null;
      const filialText = filial ? `${filial.shortName} ${filial.name}` : "";
      return normalizeText(`${e.name} ${e.sector} ${e.user} ${filialText}`).includes(q);
    });
  }
  if (ef.department && ef.department !== "todos") {
    const dep = getDepartmentById(ef.department);
    const depName = dep ? dep.name : null;
    list = list.filter((e) => e.departmentId === ef.department || (depName && e.sector === depName));
  }
  if (ef.status !== "todos") {
    list = list.filter((e) => e.status === ef.status);
  }
  if (ef.start || ef.end) {
    list = list.filter((e) => {
      const d = e.hiredAt ? e.hiredAt.split("T")[0] : "";
      if (ef.start && (!d || d < ef.start)) return false;
      if (ef.end && (!d || d > ef.end)) return false;
      return true;
    });
  }
  return list.slice().sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
});

const total = computed(() => listEmployees(filters.current).length);
const ativos = computed(() => listEmployees(filters.current).filter((e) => e.status === "ativo").length);
const desligados = computed(() => listEmployees(filters.current).filter((e) => e.status === "desligado").length);

function resetForm() {
  form.id = null;
  form.name = "";
  form.cargo = "";
  form.sector = "";
  form.user = "";
  form.branch = "";
  form.hiredAt = todayISO();
  form.status = "ativo";
  form.firedAt = "";
  form.type = "experiencia";
  form.estado = filters.current !== "todos" ? filters.current : DEFAULT_STATE;
  form.liderImediato = "";
  form.gerenteRegional = "";
}

onMounted(() => {
  resetForm();
});

/* Mostra a tela de carregamento sempre que a aba é aberta (inclusive ao
   voltar de outra aba, já que o KeepAlive não remonta o componente). */
onActivated(() => {
  beginLoading("Carregando equipe...");
  hydrateState(filters.current)
    .catch(() => {})
    .finally(endLoading);
});

/* Ao trocar de estado, o departamento selecionado pode não existir no novo
   estado — limpa o filtro de departamento da listagem. */
watch(
  () => filters.current,
  () => {
    ef.department = "todos";
  }
);

watch(
  () => form.status,
  () => {
    if (form.status === "desligado" && !form.firedAt) form.firedAt = todayISO();
  }
);

function fillForm(employee) {
  form.id = employee.id;
  form.name = employee.name;
  form.sector = employee.sector;
  form.user = employee.user;
  form.hiredAt = employee.hiredAt ? employee.hiredAt.split("T")[0] : "";
  form.status = employee.status;
  form.firedAt = employee.firedAt ? employee.firedAt.split("T")[0] : "";
  form.type = employee.type;
  form.cargo = employee.cargo || "";
  form.estado = employee.estado || "";
  form.liderImediato = employee.liderImediato || "";
  form.gerenteRegional = employee.gerenteRegional || "";
  const filial = employee.filialId ? getBranchById(employee.filialId) : null;
  form.branch = filial ? filial.shortName : "";
}

function resolveBranch(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  return branchOptions.value.find((f) => f.shortName === v) || null;
}

/* ---------- Detecção de colaboradores duplicados no cadastro individual ---------- */
const dupDialogOpen = ref(false);
const dupPendingEmployee = ref(null);
const dupMatches = ref([]);

/* Rótulo da filial de um colaborador (sigla) para exibição. */
function employeeBranchShort(emp) {
  const filial = emp.filialId ? getBranchById(emp.filialId) : null;
  return filial ? filial.shortName : "";
}

function employeeLocationLabel(emp) {
  const parts = [];
  if (emp.sector) parts.push(emp.sector);
  const fil = employeeBranchShort(emp);
  if (fil) parts.push(fil);
  if (emp.estado) parts.push(STATE_NAMES[emp.estado] || emp.estado);
  return parts.join(" · ");
}

function handleSubmit() {
  const filial = resolveBranch(form.branch);
  const sectorOption = form.sector;
  const up = (v) => String(v == null ? "" : v).trim().toUpperCase();
  const data = {
    id: form.id || undefined,
    name: up(form.name),
    sector: up(sectorOption),
    departmentId: null,
    filialId: filial ? filial.id : null,
    user: up(form.user),
    hiredAt: form.hiredAt || null,
    status: form.status,
    type: form.type,
    cargo: up(form.cargo) || null,
    estado: form.estado || null,
    liderImediato: up(form.liderImediato) || null,
    gerenteRegional: up(form.gerenteRegional) || null
  };

  if (departmentOptions.value.length) {
    const dep = departmentOptions.value.find((d) => d.name === sectorOption);
    if (dep) data.departmentId = dep.id;
  }

  if (data.status === "desligado" && form.firedAt) {
    data.firedAt = form.firedAt + "T00:00:00";
  }

  if (!data.name || !data.sector || !data.user) return toast("Preencha todos os campos obrigatórios.");
  if (!data.estado) return toast("Selecione o estado do colaborador.");
  data.hiredAt = data.hiredAt ? data.hiredAt + "T00:00:00" : null;

  /* Novo cadastro: avisa quando já existem colaboradores com o MESMO nome
     (ignorando maiúsculas/minúsculas, acentos e espaços). */
  if (!data.id) {
    const matches = findEmployeesByName(data.name);
    if (matches.length) {
      dupPendingEmployee.value = data;
      dupMatches.value = matches;
      dupDialogOpen.value = true;
      return;
    }
  }

  commitEmployee(data);
}

function commitEmployee(data) {
  saveEmployee(data);
  syncAll();
  resetForm();
  toast(data.id ? "Colaborador atualizado." : "Colaborador cadastrado.");
}

/* Cadastra mesmo havendo duplicados (escolha explícita do usuário). */
function confirmDuplicateAdd() {
  const data = dupPendingEmployee.value;
  if (!data) return;
  dupDialogOpen.value = false;
  dupPendingEmployee.value = null;
  dupMatches.value = [];
  commitEmployee(data);
}

function cancelDuplicateAdd() {
  dupDialogOpen.value = false;
  dupPendingEmployee.value = null;
  dupMatches.value = [];
}

/* ---------- Importação de colaboradores com revisão de duplicados ---------- */
const importFileInput = ref(null);
const importReviewOpen = ref(false);
const importCandidates = ref([]);
const importing = ref(false);

const importSelectedCount = computed(() => importCandidates.value.filter((c) => c.include).length);

/* Situações possíveis de uma linha. Uma linha pode ter VÁRIAS situações ao
   mesmo tempo (ex.: repetida na planilha E usuário já existe no estado). */
const IMPORT_SITUATION_LABELS = {
  novo: "Novo",
  duplicado: "Duplicado (nome existente)",
  usuario: "Usuário já existe no estado",
  planilha: "Repetido na própria planilha",
  invalido: "Inválido"
};

const IMPORT_SITUATION_ORDER = ["novo", "duplicado", "usuario", "planilha", "invalido"];

/* Conjunto de situações aplicáveis a uma linha. */
function importFlagsOf(c) {
  const flags = new Set();
  if (!c.item || !c.item.valid) {
    flags.add("invalido");
    return flags;
  }
  if (c.userExists) flags.add("usuario");
  if (c.nameDuplicates && c.nameDuplicates.length) flags.add("duplicado");
  if (c.sheetDup) flags.add("planilha");
  if (flags.size === 0) flags.add("novo");
  return flags;
}

const importNewCount = computed(
  () => importCandidates.value.filter((c) => importFlagsOf(c).has("novo")).length
);
const importDupCount = computed(
  () =>
    importCandidates.value.filter((c) =>
      ["duplicado", "usuario", "planilha"].some((k) => importFlagsOf(c).has(k))
    ).length
);

/* Filtro por situação dentro do modal de revisão. */
const importFilter = ref("todos");

/* Mostra apenas as situações que existem de fato na planilha importada. */
const importFilterOptions = computed(() => {
  const present = new Set();
  importCandidates.value.forEach((c) => importFlagsOf(c).forEach((f) => present.add(f)));
  const options = [{ value: "todos", label: "Todas as situações" }];
  IMPORT_SITUATION_ORDER.forEach((key) => {
    if (present.has(key)) options.push({ value: key, label: IMPORT_SITUATION_LABELS[key] });
  });
  return options;
});

function importRowMatchesSituation(c, situation) {
  if (situation === "todos") return true;
  return importFlagsOf(c).has(situation);
}

/* Chave de nome normalizada para agrupar/ordenar os duplicados. */
function importRowNameKey(c) {
  const name = c.item && c.item.name ? c.item.name : "";
  const key = normalizePersonName(name);
  return key || `__${name}_${c.item ? c.item.user || "" : ""}`;
}

/* Prioridade de "problema" (menor = mais problemático) para ordenar:
   inválido → usuário existe → duplicado (nome) → repetido na planilha → novo. */
function importProblemRank(c) {
  if (!c.item || !c.item.valid) return 0;
  if (c.userExists) return 1;
  if (c.nameDuplicates && c.nameDuplicates.length) return 2;
  if (c.sheetDup) return 3;
  return 4;
}

/* Linhas visíveis: os problemas ficam no TOPO e os duplicados (mesmo nome)
   ficam um abaixo do outro para facilitar a comparação. */
const visibleImportRows = computed(() => {
  const rows = importCandidates.value.filter((c) => importRowMatchesSituation(c, importFilter.value));
  const groups = new Map();
  rows.forEach((r) => {
    const k = importRowNameKey(r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  const ordered = [];
  [...groups.entries()]
    .map(([key, list]) => ({
      key,
      list,
      rank: Math.min(...list.map(importProblemRank))
    }))
    .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key))
    .forEach((g) => ordered.push(...g.list));
  return ordered;
});

const importSelectedVisibleCount = computed(() => visibleImportRows.value.filter((c) => c.include).length);

function startEquipeImport() {
  importFileInput.value?.click();
}

/* Marca/desmarca TODOS os colaboradores que estão VISÍVEIS (respeita o
   filtro de situação selecionado). Linhas inválidas nunca são marcadas. */
function markAllImport(checked) {
  const full = importCandidates.value;
  const visible = new Set(visibleImportRows.value);
  let eligible = 0;
  importCandidates.value = full.map((c) => {
    if (!visible.has(c)) return c;
    if (!c.item || !c.item.valid) return { ...c, include: false };
    eligible++;
    return { ...c, include: checked };
  });
  if (checked && eligible === 0) {
    toast("Nenhuma linha válida para marcar na situação filtrada.");
  }
}

function toggleImportRow(candidate) {
  if (!candidate.item || !candidate.item.valid) return;
  const idx = importCandidates.value.indexOf(candidate);
  if (idx < 0) return;
  const arr = importCandidates.value.slice();
  arr[idx] = { ...arr[idx], include: !arr[idx].include };
  importCandidates.value = arr;
}

function situationHas(c, situation) {
  return importFlagsOf(c).has(situation);
}

async function onEquipeImportFile(e) {
  const file = e.target.files && e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    importing.value = true;
    const wb = await readWorkbookFile(file);
    const sheet = wb.Sheets["Equipe"];
    if (!sheet) {
      toast("Planilha sem a aba “Equipe”. Baixe o modelo para conferir as colunas.");
      return;
    }
    const parsed = parseEmployeeSheet(
      sheet,
      filters.current !== "todos" ? filters.current : null
    );
    if (!parsed.length) {
      toast("Nenhum colaborador encontrado na planilha.");
      return;
    }
    const currentUserKey = (u) => String(u || "").trim().toUpperCase();
    const base = parsed.map((item) => {
      const nameDuplicates = item.valid
        ? findEmployeesByName(item.name).map((emp) => ({
            id: emp.id,
            user: emp.user,
            name: emp.name,
            location: employeeLocationLabel(emp),
            cargo: emp.cargo || emp.sector || ""
          }))
        : [];
      const userExists = item.valid
        ? getEmployees().some(
            (emp) =>
              (emp.estado || null) === item.estado &&
              currentUserKey(emp.user) === currentUserKey(item.user)
          )
        : false;
      return {
        item,
        include: !!item.valid && !userExists,
        nameDuplicates,
        userExists,
        sheetDup: false,
        sheetDupLine: null
      };
    });
    /* Sinaliza nomes repetidos DENTRO da própria planilha. */
    const seenName = new Map();
    base.forEach((c, idx) => {
      if (!c.item || !c.item.valid) return;
      const key = normalizePersonName(c.item.name);
      const first = seenName.get(key);
      if (first !== undefined) {
        base[first] = { ...base[first], sheetDup: true, sheetDupLine: idx + 1 };
        c.sheetDup = true;
        c.sheetDupLine = first + 1;
      } else {
        seenName.set(key, idx);
      }
    });
    /* A 2ª ocorrência (e seguintes) de um mesmo nome na planilha vem
       desmarcada por padrão — o usuário decide se quer mesmo duplicar. */
    base.forEach((c, idx) => {
      if (c.sheetDup && c.sheetDupLine && c.sheetDupLine < idx + 1) {
        c.include = false;
      }
    });
    importFilter.value = "todos";
    importCandidates.value = base;

    const hasDuplicates = base.some((c) => c.userExists || c.nameDuplicates.length || c.sheetDup);

    /* Sem duplicados: adiciona direto, sem abrir o modal de revisão. */
    if (!hasDuplicates) {
      const added = importSelectedCandidates(importCandidates.value.filter((c) => c.include));
      if (added > 0) toast(`${added} colaborador(es) adicionado(s).`);
      importCandidates.value = [];
      return;
    }

    /* Há duplicados: abre a revisão para você escolher o que entra no banco. */
    importReviewOpen.value = true;
  } catch (err) {
    console.error(err);
    toast("Não foi possível ler a planilha. Use o modelo de colaboradores.");
  } finally {
    importing.value = false;
  }
}

/* Grava os candidatos selecionados (retorna quantos foram adicionados). */
function importSelectedCandidates(selected) {
  const chosen = selected.filter((c) => c.item && c.item.valid);
  chosen.forEach(({ item }) => {
    /* upsertEmployee preserva o id, a filial e as datas (registro/atualização)
       lidas da planilha; saveEmployee geraria um id novo e descartaria esses
       dados, quebrando o vínculo do custo de contratação. */
    upsertEmployee(item.employee);
    if (item.costValue !== null && item.costValue !== undefined) {
      addEntry("custo_contratacao", {
        date: todayISO(),
        value: item.costValue,
        state: item.estado,
        meta: { employeeId: item.employee.id, employeeName: item.employee.name }
      });
    }
  });
  if (chosen.length) syncAll();
  return chosen.length;
}

async function confirmImportEmployees() {
  const selected = importCandidates.value.filter((c) => c.include && c.item && c.item.valid);
  if (!selected.length) {
    toast("Nenhum colaborador selecionado.");
    return;
  }
  importing.value = true;
  try {
    const added = importSelectedCandidates(selected);
    importReviewOpen.value = false;
    importCandidates.value = [];
    toast(`${added} colaborador(es) adicionado(s).`);
  } finally {
    importing.value = false;
  }
}

async function handleDelete(id) {
  const ok = await confirm({
    title: "Excluir colaborador?",
    message: "Os indicadores da equipe serão recalculados. Essa ação não pode ser desfeita.",
    confirmText: "Excluir",
    danger: true
  });
  if (!ok) return;
  removeEmployee(id);
  resetForm();
  toast("Colaborador excluído.");
}

/* ---------- Seleção múltipla / exclusão em lote ---------- */
const selectedIds = ref(new Set());

const selectedEmployees = computed(() => tableList.value.filter((e) => selectedIds.value.has(e.id)));

const allVisibleSelected = computed(
  () => tableList.value.length > 0 && tableList.value.every((e) => selectedIds.value.has(e.id))
);

function toggleEmployee(id) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function toggleSelectAll() {
  if (allVisibleSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(tableList.value.map((e) => e.id));
  }
}

async function handleBulkDelete() {
  const list = selectedEmployees.value;
  const n = list.length;
  if (!n) return;
  const ok = await confirm({
    title: `Excluir ${n} colaborador(es)?`,
    message: "Os colaboradores selecionados serão removidos e os indicadores da equipe recalculados. Essa ação não pode ser desfeita.",
    confirmText: `Excluir ${n}`,
    danger: true
  });
  if (!ok) return;
  /* Remove em lote sem recalcular os indicadores a cada item. */
  list.forEach((e) => deleteEmployee(e.id));
  selectedIds.value = new Set();
  syncAll();
  resetForm();
  toast(`${n} colaborador(es) excluído(s).`);
}

function edit(id) {
  const employee = getEmployeeById(id);
  if (employee) fillForm(employee);
}

function statusTone(status) {
  return status === "desligado" ? "dark" : status === "afastado" ? "muted" : "default";
}
</script>

<template>
  <div>
    <!-- ===== HERO ===== -->
    <div class="mb-6 flex flex-wrap items-center justify-between gap-4">
      <h1 class="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Equipe</h1>
      <div class="flex flex-wrap items-center gap-2">
        <Badge tone="accent">{{ total === 1 ? "1 colaborador" : `${total} colaboradores` }}</Badge>
      </div>
    </div>

    <!-- ===== CADASTRO ===== -->
    <section class="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {{ form.id ? "Editar colaborador" : "Novo colaborador" }}
          </h2>
          <p class="mt-0.5 text-xs text-zinc-400 dark:text-zinc-400">
            Headcount, Retenção e demais indicadores são calculados automaticamente. Turnover é lançado manualmente na aba de Lançamento.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="btn-ghost-sm" @click="downloadEquipeTemplate">Baixar modelo</button>
          <button type="button" class="btn-ghost-sm" :disabled="importing" @click="startEquipeImport">
            {{ importing ? "Lendo planilha..." : "Importar colaboradores" }}
          </button>
          <input ref="importFileInput" type="file" hidden accept=".xlsx,.xls,.csv" @change="onEquipeImportFile" />
        </div>
      </div>
      <form class="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3" novalidate @submit.prevent="handleSubmit">
        <div class="flex flex-col gap-1.5">
          <label for="employeeName" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Colaborador</label>
          <input id="employeeName" v-model="form.name" v-upper type="text" class="input-field uppercase" required placeholder="Nome completo" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeCargo" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Cargo</label>
          <input id="employeeCargo" v-model="form.cargo" v-upper type="text" class="input-field uppercase" placeholder="Ex.: Vendedor" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeSector" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Setor (Departamento)</label>
          <select id="employeeSector" v-model="form.sector" class="input-field" required>
            <option v-if="!departmentOptions.length" value="">— Cadastre um departamento (aba Departamentos) —</option>
            <option value="">— Selecione —</option>
            <option v-for="d in departmentOptions" :key="d.id" :value="d.name">
              {{ d.name }}{{ d.shortName ? ` (${d.shortName})` : "" }}
            </option>
          </select>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">Os departamentos são cadastrados na aba Departamentos.</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeBranch" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Filial</label>
          <input
            id="employeeBranch"
            v-model="form.branch"
            v-upper
            type="text"
            class="input-field"
            list="filiaisDatalist"
            placeholder="Digite a sigla da filial..."
            autocomplete="off"
          />
          <datalist id="filiaisDatalist">
            <option v-for="f in branchOptions" :key="f.id" :value="f.shortName"></option>
          </datalist>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">Busque e selecione pela sigla (nome abreviado) da filial.</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeUser" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Usuário</label>
          <input id="employeeUser" v-model="form.user" v-upper type="text" class="input-field" required placeholder="Ex.: 3375" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeHiredAt" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data de entrada</label>
          <input id="employeeHiredAt" v-model="form.hiredAt" type="date" class="input-field" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeStatus" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Status</label>
          <select id="employeeStatus" v-model="form.status" class="input-field">
            <option value="ativo">Ativo</option>
            <option value="desligado">Desligado</option>
            <option value="afastado">Afastado</option>
          </select>
        </div>

        <div v-if="showFiredAt" class="flex flex-col gap-1.5">
          <label for="employeeFiredAt" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Data do desligamento</label>
          <input id="employeeFiredAt" v-model="form.firedAt" type="date" class="input-field" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeType" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Tipo</label>
          <select id="employeeType" v-model="form.type" class="input-field">
            <option value="experiencia">Em experiência</option>
            <option value="efetivado">Efetivado</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeEstado" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Estado</label>
          <select id="employeeEstado" v-model="form.estado" class="input-field">
            <option value="">—</option>
            <option v-for="s in STATES" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeLider" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Líder imediato</label>
          <input id="employeeLider" v-model="form.liderImediato" v-upper type="text" class="input-field" placeholder="Nome do líder" />
        </div>

        <div class="flex flex-col gap-1.5">
          <label for="employeeGerente" class="text-sm font-medium text-zinc-700 dark:text-zinc-200">Gerente regional</label>
          <input id="employeeGerente" v-model="form.gerenteRegional" v-upper type="text" class="input-field" placeholder="Nome do gerente regional" />
        </div>

        <div class="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
          <button type="button" class="btn-ghost" @click="resetForm">Limpar</button>
          <button type="submit" class="btn-primary">Salvar colaborador</button>
        </div>
      </form>
    </section>

    <!-- ===== LISTA ===== -->
    <section class="mt-8 rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 p-5 dark:border-zinc-800">
        <div>
          <h2 class="text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Colaboradores</h2>
          <p class="text-xs text-zinc-400 dark:text-zinc-400">{{ ativos }} ativos · {{ desligados }} desligados</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <select v-model="ef.department" class="input-sm" aria-label="Filtrar por departamento">
            <option value="todos">Departamento: Todos</option>
            <option v-for="d in deptFilterOptions" :key="d.id" :value="d.id">{{ d.name }}</option>
          </select>
          <select v-model="ef.status" class="input-sm" aria-label="Filtrar por status">
            <option value="todos">Status: Todos</option>
            <option value="ativo">Status: Ativos</option>
            <option value="desligado">Status: Desligados</option>
            <option value="afastado">Status: Afastados</option>
          </select>
          <input v-model="ef.search" type="search" class="input-sm" placeholder="Buscar colaborador..." aria-label="Buscar colaborador" />
          <DateRangeFilter :range="ef" title="Período" />
          <button type="button" class="btn-ghost-sm" @click="resetEquipeFilters">Limpar filtro</button>
          <button type="button" class="btn-ghost-sm" :disabled="importing" @click="startEquipeImport">
            {{ importing ? "Lendo planilha..." : "Importar colaboradores" }}
          </button>
        </div>
      </div>

      <div v-if="selectedEmployees.length" class="flex flex-wrap items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-5 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <span class="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-hover dark:text-accent-light">
          {{ selectedEmployees.length }} selecionado(s)
        </span>
        <button
          type="button"
          class="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
          @click="handleBulkDelete"
        >
          Excluir selecionados
        </button>
      </div>

      <div v-if="tableList.length" class="max-h-[420px] overflow-auto">
        <table class="w-full text-left text-sm">
          <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
            <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
              <th class="w-10 px-4 py-3 font-semibold">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer accent-accent"
                  :checked="allVisibleSelected"
                  aria-label="Selecionar todos os colaboradores visíveis"
                  @change="toggleSelectAll"
                />
              </th>
              <th class="px-5 py-3 font-semibold">Colaborador</th>
              <th class="px-5 py-3 font-semibold">Setor</th>
              <th class="px-5 py-3 font-semibold">Filial</th>
              <th class="px-5 py-3 font-semibold">Estado</th>
              <th class="px-5 py-3 font-semibold">Usuário</th>
              <th class="px-5 py-3 font-semibold">Status</th>
              <th class="px-5 py-3 font-semibold">Tipo</th>
              <th class="px-5 py-3 font-semibold">Entrada</th>
              <th class="px-5 py-3 font-semibold">Registro</th>
              <th class="px-5 py-3 font-semibold">Última atualização</th>
              <th class="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in tableList"
              :key="e.id"
              class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
              :class="selectedIds.has(e.id) ? 'bg-accent/5 dark:bg-accent/5' : ''"
            >
              <td class="px-4 py-3">
                <input
                  type="checkbox"
                  class="h-4 w-4 cursor-pointer accent-accent"
                  :checked="selectedIds.has(e.id)"
                  :aria-label="`Selecionar ${e.name}`"
                  @change="toggleEmployee(e.id)"
                />
              </td>
              <td class="px-5 py-3 font-medium text-zinc-900 dark:text-zinc-100">{{ e.name }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ e.sector }}</td>
              <td class="px-5 py-3">
                <Badge v-if="e.filialId && getBranchById(e.filialId)" tone="muted">{{ getBranchById(e.filialId).shortName }}</Badge>
                <span v-else>—</span>
              </td>
              <td class="px-5 py-3">
                <Badge v-if="e.estado" tone="accent">{{ e.estado }}</Badge>
                <span v-else>—</span>
              </td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ e.user }}</td>
              <td class="px-5 py-3"><Badge :tone="statusTone(e.status)">{{ STATUS_LABELS[e.status] || e.status }}</Badge></td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ TYPE_LABELS[e.type] || e.type }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ e.hiredAt ? formatDate(e.hiredAt) : "—" }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ formatDateTime(e.createdAt) }}</td>
              <td class="px-5 py-3 text-zinc-600 dark:text-zinc-300">{{ formatDateTime(e.updatedAt) }}</td>
              <td class="px-5 py-3 text-right">
                <div class="flex justify-end gap-2">
                  <button type="button" class="btn-ghost-sm" @click="edit(e.id)">Editar</button>
                  <button type="button" class="icon-btn-sm" aria-label="Excluir colaborador" @click="handleDelete(e.id)">&times;</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else class="p-5">
        <EmptyState
          title="Nenhum colaborador cadastrado"
          text="Preencha o formulário acima para começar a montar sua equipe."
        />
      </div>
    </section>

    <!-- ===== AVISO DE COLABORADORES DUPLICADOS (cadastro individual) ===== -->
    <Modal
      v-if="dupDialogOpen"
      :open="dupDialogOpen"
      title="Colaborador possivelmente duplicado"
      subtitle="Já existe(m) colaborador(es) com este nome (a comparação ignora maiúsculas, acentos e espaços)."
      @close="cancelDuplicateAdd"
    >
      <div class="flex flex-col gap-3">
        <p class="text-sm text-zinc-600 dark:text-zinc-300">
          Você está cadastrando: <strong class="text-zinc-900 dark:text-zinc-100">{{ dupPendingEmployee?.name || "" }}</strong>
        </p>
        <div class="flex max-h-72 flex-col gap-2 overflow-y-auto">
          <div
            v-for="d in dupMatches"
            :key="d.id"
            class="rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10"
          >
            <div class="flex items-center justify-between gap-2">
              <strong class="text-sm text-zinc-900 dark:text-zinc-100">{{ d.name }}</strong>
              <Badge tone="accent">{{ d.user }}</Badge>
            </div>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {{ employeeLocationLabel(d) }}{{ d.cargo ? ` · ${d.cargo}` : "" }}
            </p>
          </div>
        </div>
        <p class="text-xs text-zinc-500 dark:text-zinc-400">
          Se for outra pessoa com o mesmo nome, você pode cadastrar mesmo assim.
        </p>
        <div class="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button type="button" class="btn-ghost" @click="cancelDuplicateAdd">Cancelar</button>
          <button type="button" class="btn-primary" @click="confirmDuplicateAdd">Cadastrar mesmo assim</button>
        </div>
      </div>
    </Modal>

    <!-- ===== REVISÃO DE IMPORTação DE COLABORADORES ===== -->
    <Modal
      v-if="importReviewOpen"
      :open="importReviewOpen"
      title="Revisar colaboradores da planilha"
      subtitle="Marque quais colaboradores devem ser adicionados. Linhas com nomes já existentes são sinalizadas."
      max-width="max-w-5xl"
      @close="importReviewOpen = false"
    >
      <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm text-zinc-600 dark:text-zinc-300">
            <span class="font-semibold text-zinc-900 dark:text-zinc-100">{{ importCandidates.length }}</span> linha(s) na planilha ·
            <span class="font-semibold text-green-600 dark:text-green-400">{{ importNewCount }}</span> nova(s) ·
            <span class="font-semibold text-amber-600 dark:text-amber-400">{{ importDupCount }}</span> possível(is) duplicado(s)
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <select v-model="importFilter" class="input-sm" aria-label="Filtrar por causa">
              <option v-for="opt in importFilterOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <button type="button" class="btn-ghost-sm" @click="markAllImport(true)">Marcar todos</button>
            <button type="button" class="btn-ghost-sm" @click="markAllImport(false)">Desmarcar todos</button>
            <span v-if="importFilter !== 'todos'" class="text-xs text-zinc-400">
              {{ importSelectedVisibleCount }}/{{ visibleImportRows.length }} marcados no filtro
            </span>
          </div>
        </div>

        <div v-if="visibleImportRows.length" class="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <div class="max-h-[26rem] overflow-auto">
            <table class="w-full text-left text-sm">
              <thead class="sticky top-0 z-10 bg-white dark:bg-zinc-900">
                <tr class="border-b border-zinc-100 text-xs uppercase tracking-wide text-zinc-400 dark:border-zinc-800 dark:text-zinc-400">
                  <th class="w-10 px-4 py-2.5 font-semibold"></th>
                  <th class="px-4 py-2.5 font-semibold">Colaborador</th>
                  <th class="px-4 py-2.5 font-semibold">Usuário</th>
                  <th class="px-4 py-2.5 font-semibold">Estado</th>
                  <th class="px-4 py-2.5 font-semibold">Filial</th>
                  <th class="px-4 py-2.5 font-semibold">Situação</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="c in visibleImportRows"
                  :key="c.item?.id || c.item?.name || c.item?.user"
                  class="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                >
                  <td class="px-4 py-2.5">
                    <input
                      type="checkbox"
                      class="h-4 w-4 cursor-pointer accent-accent"
                      :checked="c.include"
                      :disabled="!c.item || !c.item.valid"
                      :aria-label="`Selecionar ${c.item?.name || 'linha'}`"
                      @change="toggleImportRow(c)"
                    />
                  </td>
                  <td class="px-4 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">{{ c.item?.name || "—" }}</td>
                  <td class="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ c.item?.user || "—" }}</td>
                  <td class="px-4 py-2.5 text-zinc-600 dark:text-zinc-300">{{ c.item?.estado || "—" }}</td>
                  <td class="px-4 py-2.5">
                    <Badge v-if="c.item?.filialId && getBranchById(c.item.filialId)" tone="muted">
                      {{ getBranchById(c.item.filialId).shortName }}
                    </Badge>
                    <span v-else-if="c.item?.filialText" class="text-xs text-amber-600 dark:text-amber-400" title="Filial não encontrada na aba Filiais">
                      {{ c.item.filialText }} (não encontrada)
                    </span>
                    <span v-else>—</span>
                  </td>
                  <td class="px-4 py-2.5">
                    <div v-if="!c.item || !c.item.valid" class="text-xs text-red-600 dark:text-red-400">Inválido (faltam dados)</div>
                    <div v-else class="flex flex-col gap-1">
                      <div class="flex flex-wrap items-center gap-1">
                        <span v-if="situationHas(c, 'novo')" class="badge-green">Novo</span>
                        <span v-if="situationHas(c, 'duplicado')" class="badge-amber">Nome possivelmente duplicado</span>
                        <span v-if="situationHas(c, 'usuario')" class="badge-red">Usuário já existe no estado</span>
                        <span v-if="situationHas(c, 'planilha')" class="badge-amber">Repetido na própria planilha (linha {{ c.sheetDupLine }})</span>
                      </div>
                      <ul
                        v-if="situationHas(c, 'duplicado')"
                        class="text-[11px] text-zinc-500 dark:text-zinc-400"
                      >
                        <li v-for="d in c.nameDuplicates" :key="d.id">• {{ d.name }} ({{ d.user }}) — {{ d.location }}{{ d.cargo ? ` · ${d.cargo}` : "" }}</li>
                      </ul>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else class="rounded-xl border border-dashed border-zinc-200 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          Nenhuma linha corresponde à situação selecionada.
        </div>

        <div class="flex justify-end gap-2 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <button type="button" class="btn-ghost" @click="importReviewOpen = false">Cancelar</button>
          <button type="button" class="btn-primary" :disabled="!importSelectedCount" @click="confirmImportEmployees">
            Adicionar selecionados ({{ importSelectedCount }})
          </button>
        </div>
      </div>
    </Modal>

    <LoadingOverlay :show="importing" label="Importando colaboradores..." />
  </div>
</template>

<style scoped>
.input-field {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  background-color: #fff;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: rgb(24 24 27);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input-field:focus {
  border-color: #E8AF3E;
  box-shadow: 0 0 0 2px rgb(232 175 62 / 0.2);
}
:global(.dark) .input-field {
  border-color: rgb(63 63 70);
  background-color: rgb(9 9 11);
  color: rgb(244 244 245);
}
.input-sm {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  background-color: #fff;
  padding: 0.375rem 0.6rem;
  font-size: 0.8125rem;
  color: rgb(24 24 27);
  outline: none;
}
:global(.dark) .input-sm {
  border-color: rgb(63 63 70);
  background-color: rgb(9 9 11);
  color: rgb(244 244 245);
}
.btn-primary {
  border-radius: 0.5rem;
  background-color: #E8AF3E;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: #fff;
  transition: background-color 0.15s;
}
.btn-primary:hover {
  background-color: #B7791F;
}
.btn-ghost {
  border-radius: 0.5rem;
  border: 1px solid rgb(212 212 216);
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(63 63 70);
  transition: background-color 0.15s;
}
.btn-ghost:hover {
  background-color: rgb(244 244 245);
}
:global(.dark) .btn-ghost {
  border-color: rgb(63 63 70);
  color: rgb(228 228 231);
}
:global(.dark) .btn-ghost:hover {
  background-color: rgb(39 39 42);
}
.btn-ghost-sm {
  border-radius: 0.5rem;
  padding: 0.3rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 500;
  color: rgb(63 63 70);
  transition: background-color 0.15s;
}
.btn-ghost-sm:hover {
  background-color: rgb(244 244 245);
}
:global(.dark) .btn-ghost-sm {
  color: rgb(228 228 231);
}
:global(.dark) .btn-ghost-sm:hover {
  background-color: rgb(39 39 42);
}
.icon-btn-sm {
  display: flex;
  height: 1.9rem;
  width: 1.9rem;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  font-size: 1rem;
  line-height: 1;
  color: rgb(113 113 122);
  transition: background-color 0.15s, color 0.15s;
}
.icon-btn-sm:hover {
  background-color: rgb(244 244 245);
  color: rgb(24 24 27);
}
:global(.dark) .icon-btn-sm {
  color: rgb(161 161 170);
}
:global(.dark) .icon-btn-sm:hover {
  background-color: rgb(39 39 42);
  color: rgb(244 244 245);
}
.badge-green {
  border-radius: 9999px;
  background-color: rgb(220 252 231);
  padding: 0.15rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgb(21 128 61);
}
.badge-amber {
  border-radius: 9999px;
  background-color: rgb(254 243 199);
  padding: 0.15rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgb(180 83 9);
}
.badge-red {
  border-radius: 9999px;
  background-color: rgb(254 226 226);
  padding: 0.15rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgb(185 28 28);
}
:global(.dark) .badge-green {
  background-color: rgb(20 83 45);
  color: rgb(134 239 172);
}
:global(.dark) .badge-amber {
  background-color: rgb(69 26 3);
  color: rgb(252 211 77);
}
:global(.dark) .badge-red {
  background-color: rgb(69 10 10);
  color: rgb(252 165 165);
}
.btn-ghost-sm:disabled,
.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
