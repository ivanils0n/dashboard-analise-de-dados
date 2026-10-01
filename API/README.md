# Backend (Google Sheets) — Gente & Gestão (People Analytics)

Versão alternativa da API do Dashboard People Analytics que usa uma planilha
do Google Sheets como banco de dados, em vez do Postgres/CockroachDB do
`../backend`. **Projeto novo e independente**: não compartilha Worker, Pages
nem banco com `../backend` — os dois podem rodar ao mesmo tempo sem conflito.

```
Frontend → Cloudflare Worker → Hono → API do Google Sheets → Planilha
                                   ↘ (reserva) Google Apps Script → Planilha
```

Pensado para times que preferem editar os dados diretamente na planilha em
vez de (ou além de) usar as telas do dashboard.

## Como o acesso à planilha funciona

**Caminho principal: API oficial do Google Sheets (v4) com conta de serviço.**
O Worker assina um JWT com a chave da conta de serviço, troca por um token de
acesso (guardado em memória por ~1 h) e chama a API direto
(`src/db/googleSheets.ts`). Leitura da planilha inteira em ~1 s e cada gravação
em ~1 s (o Apps Script levava de 2 a 3 s por chamada). A planilha precisa estar
compartilhada, como **Editor**, com o e-mail da conta de serviço.

- **Leituras**: uma única chamada `values:batchGet` para todas as abas que não
  estão no cache (`readSheetsRaw`).
- **Gravações em lote** (`POST /api/data/:tabela`): lê só a coluna de ids da
  aba, mais as linhas/células estritamente necessárias (linha inteira só para
  mesclar um payload parcial; só o estado para conferir um apagamento), e grava
  com `values:append`, `values:batchUpdate` e `deleteDimension`.
- **Fila de gravação por aba (Durable Object `SheetWriter`,
  `src/db/sheetWriter.ts`)**: a API do Sheets não tem lock — uma gravação
  localiza a linha pelo número lido um instante antes, e se outra pessoa apagar
  uma linha acima nesse intervalo, os números deslocam e a alteração cai na
  linha errada (medido: 4 de 5 tentativas de "apagar + alterar ao mesmo tempo"
  corrompiam uma linha sem a fila). O Durable Object recebe todas as gravações
  em lote de uma aba e as executa uma de cada vez (o Apps Script tinha o
  `LockService` para isso). Com a fila, 0 problemas em 11 corridas de teste.
  É um Durable Object SQLite (disponível no plano gratuito), declarado em
  `wrangler.jsonc`; a migração `v1` é aplicada no primeiro `wrangler deploy`.
  Sem o binding, as gravações rodam direto (sem serialização).
- Sem as variáveis `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` e
  `GOOGLE_SHEET_ID`, ou se uma chamada à API falhar, o Worker **cai
  automaticamente no Apps Script** (abaixo). Reenviar é seguro: o lote é por id
  (id que já existe vira atualização).

**Reserva e manutenção: Google Apps Script** (`apps-script/Code.gs`), publicado
como Web App e vinculado à própria planilha. Ele ainda faz três coisas:

1. Um **gatilho de tempo** (a cada 10 min) que atualiza o cache na KV do
   Cloudflare — é o que faz edições feitas à mão na planilha aparecerem no
   dashboard.
2. O caminho de **reserva** de leitura/escrita, quando a API do Sheets não está
   disponível.
3. A ação `setup` (criar abas/cabeçalhos), usada por `npm run seed`.

O Worker chama o Web App enviando um segredo combinado (`APPS_SCRIPT_SECRET`) —
sem ele, ninguém com a URL consegue ler/gravar nada.

## Diferenças em relação ao `../backend`

- **Sem auditoria/changelog**: não existe `registro_alteracoes` nem as rotas
  `/api/registro-alteracoes` e `/api/delta`. O frontend já lida bem com isso —
  sem o delta, ele simplesmente baixa a lista completa a cada carregamento
  (`/api/data/:tabela`), como já fazia no primeiro acesso ou quando o cache
  local está vazio.
- **Sem transação real entre múltiplas linhas** e **sem índice** — cada
  listagem lê a aba inteira e filtra/pagina em memória no Worker. Adequado ao
  volume de uma planilha de RH; não escala como um banco relacional.
- **Edições feitas direto na planilha** (por uma pessoa, na mão) aparecem
  normalmente nas próximas leituras da API, mas não passam por nenhum log —
  não há como saber quem mudou o quê fora do próprio Google Sheets (Histórico
  de versões do Sheets cobre isso, se precisar).
- **Latência**: com a API do Sheets, leitura completa ~1 s e gravação ~1 s. No
  caminho de reserva (Apps Script) cada chamada leva de 2 a 3 s (cold start).
- Cotas do Apps Script (contas pessoais do Google): 6 min de execução por
  chamada e um total diário de tempo de execução — bem acima do que este uso
  consome.

## Estrutura

```
API/
├── apps-script/
│   └── Code.gs           # publicado manualmente no editor do Apps Script (não faz parte do deploy do Worker)
├── src/
│   ├── index.ts          # app Hono, CORS, tratamento de erro, montagem das rotas
│   ├── routes/           # auth, users, data (lote) e cache (refresh manual)
│   ├── middleware/       # requireAuth, rate limit de login
│   ├── services/         # regras de negócio, reescritas para ler/gravar na planilha
│   ├── db/
│   │   ├── googleSheets.ts # cliente da API do Google Sheets (conta de serviço)
│   │   ├── sheetWriter.ts  # Durable Object: fila de gravação por aba (evita corrida entre usuários)
│   │   ├── sheets.ts     # leitura/escrita da planilha (API do Sheets, com reserva no Apps Script) e conversão de valores
│   │   ├── cache.ts      # cache das abas na KV do Cloudflare
│   │   └── tables.ts     # metadados das "tabelas" (entidades, colunas, aba "usuarios")
│   ├── utils/            # jwt, password, http, errors, validation, pagination
│   └── types/            # Bindings (segredos e variáveis do Worker)
├── scripts/
│   ├── seed-sheet.mjs          # cria as abas + cabeçalhos na planilha e o admin inicial
│   └── set-google-secrets.mjs  # cadastra a chave da conta de serviço como segredo do Worker
├── wrangler.jsonc
├── .dev.vars.example
├── package.json
└── tsconfig.json
```

## Configuração

### 1. Publicar o Apps Script

1. Abra (ou crie) a planilha do Google Sheets que vai servir de banco.
2. Menu **Extensões → Apps Script**.
3. Apague o conteúdo padrão de `Code.gs` e cole o conteúdo de
   [`apps-script/Code.gs`](apps-script/Code.gs) deste projeto.
4. **Projeto → Propriedades do projeto → Propriedades do script** → adicione
   `SHARED_SECRET` com uma string aleatória longa (gere uma, ex.: `openssl
   rand -hex 32`). É o mesmo valor que vai em `APPS_SCRIPT_SECRET` no Worker.
5. **Implantar → Nova implantação**, tipo **App da Web**:
   - Executar como: **Eu** (sua conta, dona da planilha).
   - Quem pode acessar: **Qualquer pessoa**.
6. Autorize o acesso quando o Google pedir (é o seu próprio script pedindo
   permissão para editar a sua própria planilha — normal).
7. Copie a URL gerada (termina em `/exec`) — é o `APPS_SCRIPT_URL`.

Sempre que editar `Code.gs`, crie uma **nova implantação** (ou "Gerenciar
implantações" → editar a existente) para publicar a versão nova — só salvar
o arquivo não atualiza a Web App já publicada.

### 2. Variáveis (nunca versionadas)

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `APPS_SCRIPT_URL` | sim | URL da Web App publicada no passo anterior (termina em `/exec`) |
| `APPS_SCRIPT_SECRET` | sim | O mesmo valor colocado em `SHARED_SECRET` nas Propriedades do script |
| `JWT_SECRET` | sim | Segredo para assinar os JWT (diferente do `APPS_SCRIPT_SECRET`) |
| `CORS_ORIGIN` | não | Origens permitidas, separadas por vírgula. Sem ela, usa `*` |
| `GOOGLE_CLIENT_EMAIL` | não* | E-mail da conta de serviço do Google (termina em `.iam.gserviceaccount.com`) |
| `GOOGLE_PRIVATE_KEY` | não* | Chave privada da conta de serviço (campo `private_key` do JSON baixado) |
| `GOOGLE_SHEET_ID` | não* | ID da planilha (trecho da URL entre `/d/` e `/edit`); em produção já vem do `wrangler.jsonc` |

\* Opcionais: sem as três o Worker usa só o Apps Script, bem mais lento. Para
ativar a API do Sheets: crie uma conta de serviço no Google Cloud (Google Sheets
API ativada), baixe a chave JSON, **compartilhe a planilha como Editor** com o
e-mail dela e cadastre os segredos — em produção com
`node scripts/set-google-secrets.mjs "C:\\caminho\\chave.json"` (envia sem
mostrar a chave); no desenvolvimento local, em `.dev.vars` (ver
`.dev.vars.example`). Nunca versione o arquivo JSON.

Desenvolvimento local:

```bash
cp .dev.vars.example .dev.vars
# edite APPS_SCRIPT_URL, APPS_SCRIPT_SECRET, JWT_SECRET
npm install
npm run seed   # cria as abas/cabeçalhos e o usuário admin (lê .dev.vars)
npm run dev    # wrangler dev (http://127.0.0.1:8787)
```

Produção (Cloudflare) — Worker **novo**, nome definido em `wrangler.jsonc`
(`gente-gestao-api-sheets`), não conflita com `gente-gestao-api`:

```bash
npx wrangler secret put APPS_SCRIPT_URL
npx wrangler secret put APPS_SCRIPT_SECRET
npx wrangler secret put JWT_SECRET
npx wrangler secret put CORS_ORIGIN   # opcional
npm run deploy
```

### 3. Frontend apontando para este backend

O frontend (`../src`) já lê a URL da API de `VITE_API_URL` — não precisa
mudar nenhum código. Para usá-lo com este backend, crie um **segundo projeto
Cloudflare Pages** a partir do mesmo repositório (mesmo build, `npm run
build` na raiz) e defina, só nesse projeto:

```
VITE_API_URL=https://gente-gestao-api-sheets.SEU-SUBDOMINIO.workers.dev
```

O Pages/Worker existentes (apontando para `../backend`) continuam intactos.

## Scripts

```bash
npm run dev        # wrangler dev (http://127.0.0.1:8787)
npm run typecheck  # tsc --noEmit
npm run deploy     # publica o Worker
npm run seed        # cria abas/cabeçalhos + admin inicial na planilha configurada
node scripts/set-google-secrets.mjs "<chave.json>"   # segredos da conta de serviço no Cloudflare
```

## Modelo de dados na planilha

Uma aba por entidade (`vagas`, `headcount`, `filiais`, `diarias`,
`treinamentos`, `custo_folha`, `ferias`, `absenteismo`, `rescisoes`) + uma
aba `usuarios`. RO/AM/PA convivem na mesma aba, distinguidos
pela coluna `estado_sigla`; o Worker filtra por estado em memória depois de
ler a aba (ver `matchesEstado` em `src/services/records.ts`). Isso substituiu
o modelo antigo de uma aba por `entidade_estado` (`vagas_ro`, `vagas_am`, ...),
que chegava a 22 abas — a consolidação reduz o número de abas e permite ler
os 3 estados de uma vez (tabela sem sufixo de estado, ex.:
`GET /api/data/vagas`) em vez de uma chamada por estado.

Não existem mais `colaboradores` nem `departamentos` — o cadastro de quem
trabalha onde passou a vir só da importação mensal em `headcount`
(`mes_referencia` + `remuneracao`). A antiga aba genérica `lancamentos`
(`indicador_id` + `meta` json, usada por vários indicadores manuais) também
não existe mais: `diarias`, `treinamentos`, `custo_folha` e `absenteismo` têm
colunas tipadas próprias (a antiga `meses_incompletos`, marcação de "mês
incompleto", foi removida junto com essa função do dashboard). `custo_contratacao` não
tem aba — é calculado ao vivo a partir de `vagas` (salário × vagas fechadas
no período).

Linha 1 = cabeçalho com os nomes de coluna (ver `src/db/tables.ts` para a
lista completa por entidade). Coluna A é sempre `id` (uuid). O corpo das
abas é formatado como texto simples pelo `setup` (evita o Sheets
reinterpretar datas/números ao digitar ou colar dados). Editar uma linha
existente ou apagá-la diretamente na planilha é seguro — a API localiza cada
registro pelo `id`, não pela posição da linha.

As migrações de planilhas antigas (abas por estado, `lancamentos`) já foram
concluídas e seus scripts foram removidos; para uma planilha nova basta
`npm run seed`.

## Rotas, autenticação e perfis

- `POST /api/auth/login` → JWT de 6h em `Authorization: Bearer <token>`;
  `GET /api/auth/me`, `POST /api/auth/change-name` e `/change-password`.
- `GET /api/data/_batch?tables=...` e `GET /api/data/:tabela` — leitura das
  abas (uma chamada para várias tabelas).
- `POST /api/data/:tabela` (ex.: `absenteismo_ro`) — gravação em lote
  (`{ upserts, deletes }`), só para `admin` e `analista`.
- `POST /api/cache/refresh` — recarrega o cache (só `admin`).
- `/api/users` — gestão de usuários (só `admin`).

Formato de resposta `success`/`data`/`error`, com os perfis `admin`, `analista`
e `visitante`. `senha_hash` nunca é retornado. Não existem as rotas
`/api/registro-alteracoes` e `/api/delta/*`.

## Segurança

- `APPS_SCRIPT_SECRET` e `JWT_SECRET` nunca aparecem em respostas nem em logs.
- Sem o `APPS_SCRIPT_SECRET` correto, o Apps Script recusa qualquer leitura
  ou escrita — mesmo alguém com a URL da Web App não acessa a planilha.
- A chave da conta de serviço (`GOOGLE_PRIVATE_KEY`) dá acesso de edição à
  planilha: fica só nos segredos do Worker / `.dev.vars` (ignorado pelo git),
  nunca no repositório nem em respostas.
- Erros internos viram `500` genérico.
- CORS configurável por `CORS_ORIGIN`.
