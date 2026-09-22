# Backend (Google Sheets) — Gente & Gestão (People Analytics)

Versão alternativa da API do Dashboard People Analytics que usa uma planilha
do Google Sheets como banco de dados, em vez do Postgres/CockroachDB do
`../backend`. **Projeto novo e independente**: não compartilha Worker, Pages
nem banco com `../backend` — os dois podem rodar ao mesmo tempo sem conflito.

```
Frontend → Cloudflare Worker → Hono → Google Apps Script (Web App) → Planilha
```

Pensado para times que preferem editar os dados diretamente na planilha em
vez de (ou além de) usar as telas do dashboard.

## Como o acesso à planilha funciona

Não usamos a API oficial do Google Sheets nem uma service account do Google
Cloud (evita ter que criar projeto/chave lá). Em vez disso, um pequeno script
do **Google Apps Script** (`apps-script/Code.gs`) fica vinculado à própria
planilha, publicado como "Web App": ele roda com a identidade de quem o
publicou (a pessoa dona da planilha), então já tem acesso a ela sem
autenticação adicional. O Worker chama essa URL enviando um segredo
combinado (`APPS_SCRIPT_SECRET`) — sem ele, ninguém com a URL consegue
ler/gravar nada.

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
- **Latência**: cada chamada do Worker passa pelo Apps Script (que tem um
  "cold start" próprio) antes de chegar na planilha — um pouco mais lento que
  falar direto com a API do Google, mas imperceptível para uso normal do
  dashboard.
- Cotas do Apps Script (contas pessoais do Google): 6 min de execução por
  chamada e um total diário de tempo de execução — bem acima do que este uso
  consome.

## Estrutura

```
backend-sheets/
├── apps-script/
│   └── Code.gs           # publicado manualmente no editor do Apps Script (não faz parte do deploy do Worker)
├── src/
│   ├── index.ts          # app Hono, CORS, tratamento de erro, montagem das rotas
│   ├── routes/           # iguais ao ../backend (auth, records, data, users, estados)
│   ├── middleware/       # requireAuth, rate limit de login — iguais ao ../backend
│   ├── services/         # regras de negócio, reescritas para ler/gravar na planilha
│   ├── db/
│   │   ├── sheets.ts     # cliente do Apps Script (chama a Web App, converte valores)
│   │   └── tables.ts     # metadados das "tabelas" (entidades, colunas, aba "usuarios")
│   ├── utils/            # jwt, password, http, errors, validation, pagination — iguais
│   └── types/            # Bindings agora aponta para a URL/segredo do Apps Script
├── scripts/
│   └── seed-sheet.mjs    # cria as abas + cabeçalhos na planilha e o admin inicial
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
```

## Modelo de dados na planilha

Uma aba por `entidade_estado` (`colaboradores_ro`, `vagas_am`, ...) + uma aba
`usuarios`. Linha 1 = cabeçalho com os nomes de coluna (ver `src/db/tables.ts`
para a lista completa por entidade). Coluna A é sempre `id` (uuid). O corpo
das abas é formatado como texto simples pelo `setup` (evita o Sheets
reinterpretar datas/números ao digitar ou colar dados). Editar uma linha
existente ou apagá-la diretamente na planilha é seguro — a API localiza cada
registro pelo `id`, não pela posição da linha.

## Formato das respostas, autenticação e perfis

Iguais ao `../backend` — mesmo formato de resposta (`success`/`data`/`error`,
paginação, erros), mesmo fluxo de login (`POST /api/auth/login` → JWT de 6h em
`Authorization: Bearer <token>`) e os mesmos três perfis (`admin`, `analista`,
`visitante`, com a mesma matriz de permissões). Veja `../backend/README.md`
para a referência completa das rotas — aqui só o que muda:

- Não existem as rotas `/api/registro-alteracoes` e `/api/delta/*`.
- `senha_hash` nunca é retornado, como antes.

## Segurança

- `APPS_SCRIPT_SECRET` e `JWT_SECRET` nunca aparecem em respostas nem em logs.
- Sem o `APPS_SCRIPT_SECRET` correto, o Apps Script recusa qualquer leitura
  ou escrita — mesmo alguém com a URL da Web App não acessa a planilha.
- Erros internos do Apps Script viram `500` genérico.
- CORS configurável por `CORS_ORIGIN`.
