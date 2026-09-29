import { reactive } from "vue";

const TOAST_DURATION = 3500;
/* Máximo de notificações empilhadas ao mesmo tempo; passando disso, a mais
   antiga sai. */
const MAX_TOASTS = 5;

const state = reactive({
  /* [{ id, message, type, duration }] — a mais antiga primeiro (fica em cima);
     as novas entram embaixo. */
  items: []
});

let nextId = 1;
const timers = new Map();

/* Sem tipo explícito, deduz pelo texto: falhas → "error"; validações e avisos
   → "warning"; o resto (ação concluída) → "success". */
function inferType(message) {
  const text = String(message || "").trim();
  if (/não foi possível|erro|falha|tempo limite/i.test(text)) return "error";
  if (/^(preencha|informe|selecione|a data|nenhum|nenhuma|seu perfil|vaga não)/i.test(text)) return "warning";
  return "success";
}

function hide(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const i = state.items.findIndex((t) => t.id === id);
  if (i !== -1) state.items.splice(i, 1);
}

export function useToast() {
  /* `type`: "success" | "error" | "warning" | "info" | "loading" (opcional).
     Cada chamada cria uma notificação própria, com seu tempo; várias ficam
     empilhadas. `options.sticky`: não some sozinha (sem barra de tempo) — fica
     até `hide(id)`; o "loading" é sempre assim. Devolve o id. */
  function show(message, type, options = {}) {
    const id = nextId++;
    const resolved = type || inferType(message);
    const sticky = !!options.sticky || resolved === "loading";
    state.items.push({
      id,
      message,
      type: resolved,
      duration: sticky ? 0 : TOAST_DURATION
    });
    while (state.items.length > MAX_TOASTS) hide(state.items[0].id);
    if (!sticky) timers.set(id, setTimeout(() => hide(id), TOAST_DURATION));
    return id;
  }

  return { state, show, hide };
}
