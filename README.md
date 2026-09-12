# Gente & Gestão — Dashboard RH

Dashboard de **lançamento e análise de dados de Gente e Gestão (RH)**. Design minimalista em preto, branco e acento vermelho, com suporte a modo noturno. Reescrito em **Vue 3** (`<script setup>` + Composition API), **vue-router** e **Tailwind CSS**.

## Stack

- **Vue 3** — componentes reutilizáveis, reatividade declarativa
- **Vue Router** — SPA com roteamento por hash (funciona em hospedagem estática sem rewrite)
- **Tailwind CSS v4** — estilização 100% utilitária e responsiva
- **Vite** — build, code-splitting automático por rota e chunks de bibliotecas
- **Cloudflare Workers + Hono** — backend/API (pasta `backend/`)
- **CockroachDB** — banco de dados (PostgreSQL wire), acessado pelo driver `pg`
- **Chart.js** e **SheetJS (xlsx)** — via npm (sem CDN)

## Funcionalidades

- **Dashboard**: KPIs dos indicadores, gráfico de linha (evolução histórica), gráfico de barras (panorama atual), gráficos de pizza (Turnover), tabela de lançamentos com busca e filtro de período.
- **Filtro de período**: aplica intervalo de datas aos KPIs, gráficos e lançamentos. Inicia preenchido com o **mês local atual**. O **Custo de contratação** é exibido como **média** dos lançamentos no período filtrado.
- **Filtro por estado** (RO / AM / PA / Todos) no topo, compartilhado por todas as páginas; os dados são baixados do banco sob demanda por estado.
- **Equipe**: cadastro de colaboradores com **Colaborador, Setor, Usuário, Data de entrada, Status (Ativo/Desligado/Afastado)** e **Tipo (Efetivado/Em experiência)**, filial por sigla e registro de data/hora de cadastro e última atualização.
- **Modal "Lançar dados" dinâmico**: cada indicador manual (Absenteísmo, Tempo médio de contratação, Custo de contratação) altera o formulário e as abas do modal.
- **Exportação e importação**: botão de menu com **XLSX** (4 planilhas: `Indicadores`, `Lançamentos`, `Equipe` e `Filiais`), **CSV** e **Baixar template**; **Importar planilha** verifica duplicados (dados já existentes são ignorados).
- **Apresentação**: modo de slides com gráficos por indicador e navegação.
- **Persistência**: `sessionStorage` como cache offline + **sincronização com o CockroachDB** via API (delta sync).
- **Autenticação** por perfil (admin / analista / visitante) e controle de acesso por rota.

## Indicadores e origem dos dados

| Indicador | Origem | Tipo |
| --- | --- | --- |
| Headcount | **Equipe** (calculado) | colaboradores ativos |
| Turnover | **Equipe** (calculado) | entradas marcadas no cadastro |
| Absenteísmo | **Modal** (manual) | média de faltas/atrasos/afastamentos no período |
| Tempo médio de contratação | **Modal** (histórico de vagas) | dias entre abertura e fechamento |
| Custo de contratação | **Modal** (vinculado a colaborador) | R$ |
| Tempo de permanência | **Equipe** (calculado) | média em dias dos desligados |
| Turnover no período de experiência | **Equipe** (calculado) | desligados com até 90 dias |
| Retenção | **Equipe** (calculado) | % de ativos e efetivados |

## Estrutura de pastas

```
├── index.html                    # Ponto de entrada (monta a SPA)
├── vite.config.js                # Vite + Tailwind + variáveis de ambiente
├── backend/                      # API (Cloudflare Worker + Hono)
│   ├── package.json              # hono, pg, wrangler
│   ├── wrangler.toml             # Configuração do Worker (nodejs_compat)
│   ├── .dev.vars.example         # DATABASE_URL / JWT_SECRET (local)
│   └── src/
│       ├── index.js              # App Hono + CORS + rotas
│       ├── lib/
│       │   ├── db.js             # Pool pg (CockroachDB)
│       │   ├── auth.js           # Senha (PBKDF2) + JWT (HS256) + middleware
│       │   └── tables.js         # Allowlist de tabelas/colunas
│       └── routes/
│           ├── auth.js           # login, me, change-name, change-password
│           ├── users.js          # listar/criar/excluir usuários (admin)
│           ├── data.js           # leitura/escrita em lote + changelog
│           └── delta.js          # version, sync
├── src/
│   ├── main.js                   # Bootstrap (dados + auth) e montagem do app
│   ├── App.vue                   # Root: rota + toast + diálogo global
│   ├── assets/main.css           # Tailwind v4 + tokens de tema
│   ├── router/index.js           # Rotas e guardas por perfil
│   ├── lib/                      # Domínio e dados
│   │   ├── config.js             # Indicadores (manual/computado), estados, perfis
│   │   ├── utils.js              # Formatação de valores, datas e horas
│   │   ├── cache.js              # Cache delta por item (sessionStorage)
│   │   ├── api.js                # Cliente HTTP da API (Bearer JWT)
│   │   ├── db.js                 # Delta sync + fila em lote (API)
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
├── sql/schema.sql                # Tabelas do CockroachDB (sem RLS/policies)
└── .github/workflows/deploy.yml  # Deploy estático (opcional)
```

## Backend: Cloudflare Worker (Hono) + CockroachDB

O front é 100% offline-first (cache em `sessionStorage`), mas sincroniza com um
banco **CockroachDB** através de uma API em **Cloudflare Worker** (framework
**Hono**), na pasta `backend/`. As credenciais do banco nunca vão para o browser:
só o Worker as acessa.

### 1. Criar o banco

1. Crie um cluster no [CockroachDB Cloud](https://cockroachlabs.cloud/) (ou rode local com `cockroach start-single-node`).
2. Em **SQL Shell / SQL Editor**, execute [`sql/schema.sql`](sql/schema.sql). Ele cria as tabelas (`lancamentos_*`, `colaboradores_*`, `vagas_*`, `filiais_*`, `departamentos_*`, `usuarios`, `registro_alteracoes`) **sem RLS/policies** e o usuário inicial `admin` (senha `Admin@123`).
3. Copie a **connection string** (botão *Connect*), no formato:
   `postgresql://usuario:senha@host:26257/defaultdb?sslmode=require`.

### 2. Configurar as variáveis do Worker

Estas variáveis **não** entram no bundle do front:

| Variável | Descrição |
| --- | --- |
| `DATABASE_URL` | Connection string do CockroachDB |
| `JWT_SECRET` | String aleatória longa para assinar os JWT |

- **Local**: copie `backend/.dev.vars.example` para `backend/.dev.vars` e preencha. O arquivo está no `.gitignore`.
- **Produção (Cloudflare)**: **Workers & Pages → seu Worker → Settings → Variables and Secrets**.

### 3. Rodar localmente

O front (Vite) e o Worker (wrangler) rodam em processos separados:

```bash
npm install                    # front
npm --prefix backend install   # API
npm run dev:api                # Worker em http://127.0.0.1:8787
npm run dev                    # front em http://localhost:5173
```

Aponte o front para o Worker no `.env` (padrão do `wrangler dev`):

```
VITE_API_BASE=http://127.0.0.1:8787
```

## Autenticação

A autenticação é **própria** (não há Supabase Auth):

- Login em `POST /api/auth/login` (`usuario`/`senha`) → devolve um **JWT (HS256)** com validade de 6h.
- A senha é guardada como **PBKDF2-SHA256** (100.000 iterações) na coluna `usuarios.senha_hash`.
- O JWT fica apenas no `sessionStorage` (chave `gg-auth`); nada de tokens em disco.
- Perfis: `admin` (tudo), `analista` (edita dados) e `visitante` (somente leitura).

> O usuário inicial é `admin` / `Admin@123`. **Troque a senha** no primeiro acesso (menu do avatar).

## Deploy

O front (estático) e o Worker (API) são publicados separadamente.

### 1. Worker (API)

```bash
cd backend
npx wrangler login          # uma vez
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
npm run deploy              # publica o Worker e mostra a URL pública
```

Anote a URL (ex.: `https://gente-gestao-api.SEU-SUBDOMINIO.workers.dev`).

### 2. Front

No build, informe a URL do Worker em `VITE_API_BASE`:

```bash
VITE_API_BASE=https://gente-gestao-api.SEU-SUBDOMINIO.workers.dev npm run build
```

- **Cloudflare Pages**: aponte o projeto para o repositório, build `npm run build`,
  output `dist`, e defina a variável `VITE_API_BASE`.
- **GitHub Pages**: cadastre o segredo `VITE_API_BASE` (URL pública do Worker) em
  **Settings → Secrets and variables → Actions**; o workflow injeta no build.

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
- [node-postgres (pg)](https://node-postgres.com/)
- [CockroachDB](https://www.cockroachlabs.com/)
