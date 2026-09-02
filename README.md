# Gente & Gestão — Dashboard RH

Dashboard de **lançamento e análise de dados de Gente e Gestão (RH)**. Design minimalista em preto, branco e acento vermelho, com suporte a modo noturno. Reescrito em **Vue 3** (`<script setup>` + Composition API), **vue-router** e **Tailwind CSS**.

## Stack

- **Vue 3** — componentes reutilizáveis, reatividade declarativa
- **Vue Router** — SPA com roteamento por hash (funciona em hospedagem estática sem rewrite)
- **Tailwind CSS v4** — estilização 100% utilitária e responsiva
- **Vite** — build, code-splitting automático por rota e chunks de bibliotecas
- **Chart.js**, **SheetJS (xlsx)** e **@supabase/supabase-js** — via npm (sem CDN)

## Funcionalidades

- **Dashboard**: KPIs dos indicadores, gráfico de linha (evolução histórica), gráfico de barras (panorama atual), gráficos de pizza (Turnover), tabela de lançamentos com busca e filtro de período.
- **Filtro de período**: aplica intervalo de datas aos KPIs, gráficos e lançamentos. Inicia preenchido com o **mês local atual**. O **Custo de contratação** é exibido como **média** dos lançamentos no período filtrado.
- **Filtro por estado** (RO / AM / PA / Todos) no topo, compartilhado por todas as páginas; os dados são baixados do banco sob demanda por estado.
- **Equipe**: cadastro de colaboradores com **Colaborador, Setor, Usuário, Data de entrada, Status (Ativo/Desligado/Afastado)** e **Tipo (Efetivado/Em experiência)**, filial por sigla e registro de data/hora de cadastro e última atualização.
- **Modal "Lançar dados" dinâmico**: cada indicador manual (Absenteísmo, Tempo médio de contratação, Custo de contratação) altera o formulário e as abas do modal.
- **Exportação e importação**: botão de menu com **XLSX** (4 planilhas: `Indicadores`, `Lançamentos`, `Equipe` e `Filiais`), **CSV** e **Baixar template**; **Importar planilha** verifica duplicados (dados já existentes são ignorados).
- **Apresentação**: modo de slides com gráficos por indicador e navegação.
- **Persistência**: `localStorage` como cache offline + **sincronização com Supabase** (delta sync).
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
├── src/
│   ├── main.js                   # Bootstrap (dados + auth) e montagem do app
│   ├── App.vue                   # Root: rota + toast + diálogo global
│   ├── assets/main.css           # Tailwind v4 + tokens de tema
│   ├── router/index.js           # Rotas e guardas por perfil
│   ├── lib/                      # Domínio e dados
│   │   ├── config.js             # Indicadores (manual/computado), estados, perfis
│   │   ├── utils.js              # Formatação de valores, datas e horas
│   │   ├── cache.js              # Cache delta por item (localStorage)
│   │   ├── supabase.js           # Cliente Supabase + delta sync + fila em lote
│   │   ├── store.js              # Estado reativo (Vue) + write-through remoto
│   │   ├── employees.js          # Domínio da equipe e indicadores calculados
│   │   ├── filiais.js            # Domínio de filiais
│   │   ├── departamentos.js      # Domínio de departamentos
│   │   ├── auth.js               # Login/perfil/permissões (Supabase Auth)
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
├── sql/schema.sql                # Tabelas + RLS do Supabase
└── .github/workflows/deploy.yml  # Deploy automático no GitHub Pages
```

## Persistência no Supabase

O app funciona 100% offline via `localStorage` (cache delta por registro), mas sincroniza tudo com um banco **Supabase** (Postgres) quando configurado:

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, execute o conteúdo de [`sql/schema.sql`](sql/schema.sql) para criar as tabelas (`lancamentos_*`, `colaboradores_*`, `vagas_*`, `filiais_*`, `departamentos_*`) e as policies de RLS.
3. Credenciais locais: copie `.env.example` para `.env` com a URL e anon key (**Project Settings → API**). Aceita os nomes `SUPABASE_URL`/`SUPABASE_ANON_KEY` ou `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — o Vite lê o arquivo e injeta tudo no bundle (dev e build):
   ```
   SUPABASE_URL=https://SEU-PROJETO.supabase.co
   SUPABASE_ANON_KEY=sua-anon-key-aqui
   ```
4. Rode o app (`npm run dev`) — os dados são carregados e sincronizados automaticamente.

Notas:
- O `localStorage` serve de cache offline; ao abrir, apenas os itens alterados desde a última versão são baixados (delta sync via `gg_delta_sync`). Um download completo ocorre apenas no primeiro acesso ou quando o delta não está disponível.
- Escritas são agrupadas em lote (1 requisição por tabela) e snapshots calculados sem mudança não geram tráfego.
- Sem `.env` válido (ou aberto via `file://`), o app opera apenas local.
- Use somente a **anon key**, nunca a `service_role`.

## Como executar

```bash
npm install
npm run dev
```

Build de produção:

```bash
npm run build   # gera a pasta dist/
npm run preview # serve o build localmente
```

## Deploy no GitHub Pages

O deploy usa **GitHub Actions**: a cada push em `main`, o Vite injeta as credenciais dos segredos no bundle durante o build e publica o site.

1. Envie o repositório para o GitHub.
2. Em **Settings → Secrets and variables → Actions**, cadastre os segredos:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` ⚠️ apenas a anon key, nunca a service_role
3. Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.
4. Faça push em `main` (ou rode o workflow manualmente em *Actions → Deploy para GitHub Pages → Run workflow*).

> O `.nojekyll` incluído garante publicação sem processamento Jekyll. O roteamento por hash (`/#/dashboard`, etc.) dispensa regras de rewrite do servidor.

## Deploy no Cloudflare Pages

1. No dashboard: **Workers & Pages → Create application → Pages → Connect to Git** e selecione o repositório.
2. Na configuração de build:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Em **Settings → Environment variables (Production)**, adicione `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
4. **Save and Deploy**.

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
- [supabase-js](https://supabase.com/docs/reference/javascript/)
