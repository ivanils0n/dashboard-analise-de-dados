# Gente & Gestão — Dashboard RH

Dashboard de **lançamento e análise de dados de Gente e Gestão (RH)**. Design minimalista em preto, branco e acento vermelho, com suporte a modo noturno. Reescrito em **Vue 3** (`<script setup>` + Composition API), **vue-router** e **Tailwind CSS**.

## Stack

- **Vue 3** — componentes reutilizáveis, reatividade declarativa
- **Vue Router** — SPA com roteamento por hash (funciona em hospedagem estática sem rewrite)
- **Tailwind CSS v4** — estilização 100% utilitária e responsiva
- **Vite** — build, code-splitting automático por rota e chunks de bibliotecas
- **Cloudflare Workers + Hono** — backend/API (pasta `backend-sheets/`)
- **Google Sheets** — banco de dados, acessado via um Google Apps Script publicado como Web App
- **Chart.js** e **SheetJS (xlsx)** — via npm (sem CDN)

## Funcionalidades

- **Dashboard**: KPIs dos indicadores, gráfico de linha (evolução histórica), gráfico de barras (panorama atual), gráficos de pizza (Turnover), tabela de lançamentos com busca e filtro de período.
- **Filtro de período**: aplica intervalo de datas aos KPIs, gráficos e lançamentos. Inicia preenchido com o **mês local atual**. O **Custo de contratação** é exibido como a **soma dos salários das vagas (abertas e fechadas)** e dos lançamentos manuais no período filtrado.
- **Filtro por estado** (RO / AM / PA / Todos) no topo, compartilhado por todas as páginas; os dados são baixados do banco sob demanda por estado.
- **Equipe**: cadastro de colaboradores com **Colaborador, Setor, Usuário, Data de entrada, Status (Ativo/Desligado/Afastado)** e **Tipo (Efetivado/Em experiência)**, filial por sigla e registro de data/hora de cadastro e última atualização.
- **Modal "Lançar dados" dinâmico**: cada indicador manual (Absenteísmo, Tempo médio de contratação, Custo de contratação, Turnover, Turnover (Exp)) altera o formulário e as abas do modal.
- **Exportação e importação**: botão de menu com **XLSX** (4 planilhas: `Indicadores`, `Lançamentos`, `Equipe` e `Filiais`), **CSV** e **Baixar template**; **Importar planilha** verifica duplicados (dados já existentes são ignorados).
- **Apresentação**: modo de slides com gráficos por indicador e navegação.
- **Persistência**: `sessionStorage` como cache offline + sincronização com a **planilha Google Sheets** via API (download completo, sem sync incremental).
- **Autenticação** por perfil (admin / analista / visitante) e controle de acesso por rota.

## Indicadores e origem dos dados

| Indicador | Origem | Tipo |
| --- | --- | --- |
| Headcount | **Equipe** (calculado) | colaboradores ativos |
| Turnover | **Modal** (lançamento manual: colaborador, filial, função, último dia de aviso) | desligamentos no período |
| Turnover (Exp) | **Modal** (lançamento manual, mesmos campos do Turnover) | desligamentos em período de experiência no período |
| Absenteísmo | **Modal** (manual) | média de faltas/atrasos/afastamentos no período |
| Tempo médio de contratação | **Modal** (histórico de vagas) | dias entre abertura e fechamento |
| Custo de contratação | **Modal** (salário das vagas abertas/fechadas + lançamentos por colaborador) | R$ (soma) |
| Tempo de permanência | **Equipe** (calculado) | média em dias dos desligados |
| Retenção | **Equipe** (calculado) | % de ativos e efetivados |

## Estrutura de pastas

```
├── index.html                    # Ponto de entrada (monta a SPA)
├── vite.config.js                # Vite + Tailwind + variáveis de ambiente
├── backend-sheets/                # API (Cloudflare Worker + Hono)
│   ├── package.json              # hono, wrangler
│   ├── wrangler.jsonc            # Configuração do Worker (nodejs_compat)
│   ├── .dev.vars.example         # APPS_SCRIPT_URL / APPS_SCRIPT_SECRET / JWT_SECRET (local)
│   ├── apps-script/
│   │   └── Code.gs               # Ponte publicada no Google Apps Script (Web App)
│   └── src/
│       ├── index.ts              # App Hono + CORS + rotas
│       ├── db/
│       │   ├── sheets.ts         # Cliente do Apps Script (leitura/escrita na planilha)
│       │   └── tables.ts         # Metadados das entidades/colunas + aba "usuarios"
│       ├── services/             # records, users, auth, estados
│       ├── middleware/           # requireAuth, rate limit de login
│       ├── utils/                # jwt, password, http, errors, validation, pagination
│       └── routes/
│           ├── auth.ts           # login, me, change-name, change-password
│           ├── users.ts          # listar/criar/excluir usuários (admin)
│           ├── records.ts        # CRUD por entidade/estado
│           └── data.ts           # leitura/escrita em lote (usado pelo front)
├── src/
│   ├── main.js                   # Bootstrap (dados + auth) e montagem do app
│   ├── App.vue                   # Root: rota + toast + diálogo global
│   ├── assets/main.css           # Tailwind v4 + tokens de tema
│   ├── router/index.js           # Rotas e guardas por perfil
│   ├── lib/                      # Domínio e dados
│   │   ├── config.js             # Indicadores (manual/computado), estados, perfis
│   │   ├── utils.js              # Formatação de valores, datas e horas
│   │   ├── cache.js              # Cache por item (sessionStorage)
│   │   ├── api.js                # Cliente HTTP da API (Bearer JWT)
│   │   ├── db.js                 # Download completo + fila de escrita em lote (API)
│   │   ├── store.js              # Estado reativo (Vue) + write-through remoto
│   │   ├── employees.js          # Domínio da equipe e indicadores calculados
│   │   ├── filiais.js            # Domínio de filiais
│   │   ├── departamentos.js      # Domínio de departamentos
│   │   ├── auth.js               # Login/perfil/permissões (auth própria)
│   │   ├── charts.js             # Gráficos Chart.js (linha, barras e pizza)
│   │   └── export.js             # Exportação/importação XLSX/CSV (SheetJS)
│   ├── composables/              # Lógica reutilizável
│   │   ├── useAuth.js (c/o lib/auth) · useToast · useDialog · useTheme
│   │   ├── useFilters · useDateFilter · useEquipeFilters
│   │   ├── useFilterDrawer · useDashboardData
│   ├── components/
│   │   ├── layout/               # AppLayout, TopBar, SideBar, StateFilter, UserMenu
│   │   ├── ui/                   # Badge, Modal, ConfirmDialog, Toast, EmptyState
│   │   ├── charts/               # LineChart, BarChart, PieChart, MiniLineChart
│   │   └── dashboard/            # KpiCard, KpiChartCard, LaunchModal,
│   │                             # PresentationModal, FilterDrawer
│   └── views/                    # Login, Dashboard, Equipe, Filiais,
│                                 # Departamentos, Usuários
├── public/logo.png               # Logo (servido na raiz)
└── backend-sheets/apps-script/Code.gs   # Ponte da planilha (fora do deploy do Worker)
```

## Backend: Cloudflare Worker (Hono) + Google Sheets

O front é 100% offline-first (cache em `sessionStorage`), mas sincroniza com uma
**planilha do Google Sheets** através de uma API em **Cloudflare Worker** (framework
**Hono**), na pasta `backend-sheets/`. A planilha nunca é acessada direto pelo
browser: só o Worker fala com ela, por meio de um Google Apps Script publicado
como Web App (ver `backend-sheets/apps-script/Code.gs`).

Passo a passo completo de configuração (criar a planilha, publicar o Apps
Script, variáveis, seed): **[`backend-sheets/README.md`](backend-sheets/README.md)**.

### Rodar localmente

O front (Vite) e o Worker (wrangler) rodam em processos separados:

```bash
npm install                          # front
npm --prefix backend-sheets install  # API
npm run dev:api                      # Worker em http://127.0.0.1:8787
npm run dev                          # front em http://localhost:5173
```

Aponte o front para o Worker no `.env` (padrão do `wrangler dev`):

```
VITE_API_URL=http://127.0.0.1:8787
```

## Autenticação

A autenticação é **própria** (não há Supabase Auth):

- Login em `POST /api/auth/login` (`usuario`/`senha`) → devolve um **JWT (HS256)** com validade de 6h.
- A senha é guardada como **PBKDF2-SHA256** (100.000 iterações) na coluna `senha_hash` da aba `usuarios`.
- O JWT fica apenas no `sessionStorage` (chave `gg-auth`); nada de tokens em disco.
- Perfis: `admin` (tudo), `analista` (edita dados) e `visitante` (somente leitura).

> O usuário inicial é criado pelo script de seed (`npm run seed` em `backend-sheets/`). Veja `backend-sheets/README.md`.

## Deploy

O front (estático) e o Worker (API) são publicados separadamente.

### 1. Worker (API)

```bash
cd backend-sheets
npx wrangler login          # uma vez
npx wrangler secret put APPS_SCRIPT_URL
npx wrangler secret put APPS_SCRIPT_SECRET
npx wrangler secret put JWT_SECRET
npm run deploy              # publica o Worker e mostra a URL pública
```

Anote a URL (ex.: `https://gente-gestao-api-sheets.SEU-SUBDOMINIO.workers.dev`).

### 2. Front

No build, informe a URL do Worker em `VITE_API_URL` (sempre com `https://`):

```bash
VITE_API_URL=https://gente-gestao-api.SEU-SUBDOMINIO.workers.dev npm run build
```

- **Cloudflare Pages**: aponte o projeto para o repositório, build `npm run build`,
  output `dist`, e defina a variável `VITE_API_URL`.

## Como adicionar um novo indicador

Tudo é centralizado em `src/lib/config.js`. Adicione um novo objeto ao array `INDICATORS`:

```js
{
  id: "novo_indicador",
  name: "Novo Indicador",
  desc: "Descrição",
  type: "number",            // number | percent | currency | days | months
  unit: "unidade",
  decimals: 1,
  higherIsBetter: true,
  manual: true,              // aparece no modal de lançamento
  computed: false,
  form: "meu_formulario"     // implemente o formulário em LaunchModal
}
```

## Dependências

- [Vue 3](https://vuejs.org/) + [Vue Router](https://router.vuejs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Chart.js](https://www.chartjs.org/)
- [SheetJS](https://sheetjs.com/)
- [Hono](https://hono.dev/)
- [Google Apps Script](https://developers.google.com/apps-script)
# dashboard-analise-de-dados
