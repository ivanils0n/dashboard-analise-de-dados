# Backend — Gente & Gestão (People Analytics)

API REST do Dashboard People Analytics.

```
Frontend → Cloudflare Worker → Hono → CockroachDB (SQL direto)
```

## Stack

- **Cloudflare Workers**
- **TypeScript** (strict)
- **Hono**
- **CockroachDB** via driver `pg` (sem ORM)
- Autenticação própria: **PBKDF2-SHA256** (senha) + **JWT HS256**

## Estrutura

```
backend/
├── src/
│   ├── index.ts          # app Hono, CORS, tratamento de erro, montagem das rotas
│   ├── routes/           # definição dos endpoints
│   ├── middleware/       # requireAuth (autenticação/autorização)
│   ├── services/         # regras de negócio (records, users, auth, audit, estados)
│   ├── db/               # conexão (pool.ts) e metadados das tabelas (tables.ts)
│   ├── utils/            # jwt, password, http, errors, validation, pagination
│   └── types/            # tipos (Bindings, TokenPayload, etc.)
├── wrangler.jsonc
├── .dev.vars.example     # modelo (o .dev.vars real NÃO é versionado)
├── package.json
└── tsconfig.json
```

## Configuração

### 1. Banco

Execute o `../sql/schema.sql` no CockroachDB. Ele cria:

- `estados` (referência)
- `lancamentos_*`, `vagas_*`, `colaboradores_*`, `filiais_*`, `departamentos_*` para RO, AM e PA
- `usuarios`
- `registro_alteracoes` (changelog/auditoria)

Usuário inicial: `admin` / `Admin@123`.

### 2. Variáveis (nunca versionadas)

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | sim | Connection string do CockroachDB |
| `JWT_SECRET` | sim | Segredo para assinar os JWT |
| `CORS_ORIGIN` | não | Origens permitidas, separadas por vírgula. Já definida em `wrangler.jsonc` como `https://gente-gestao-modenaesilva.pages.dev,http://localhost:5173`. Sem ela, usa `*` (a auth é por Bearer token, não cookie) |

Desenvolvimento local:

```bash
cp .dev.vars.example .dev.vars
# edite DATABASE_URL e JWT_SECRET
npm run dev
```

Produção (Cloudflare):

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
npx wrangler secret put CORS_ORIGIN   # opcional
npm run deploy
```

## Scripts

```bash
npm run dev        # wrangler dev (http://127.0.0.1:8787)
npm run typecheck  # tsc --noEmit
npm run deploy     # publica o Worker
```

## Formato das respostas

Sucesso:

```json
{ "success": true, "data": { } }
```

Lista (com paginação):

```json
{
  "success": true,
  "data": [],
  "pagination": { "page": 1, "limit": 50, "total": 0, "totalPages": 0 }
}
```

Erro:

```json
{ "success": false, "error": { "message": "Mensagem", "code": "codigo" } }
```

`senha_hash` **nunca** é retornado.

## Autenticação e perfis

1. `POST /api/auth/login` com `{ "usuario": "admin", "senha": "..." }`.
2. A resposta traz `data.token` (JWT, validade de 6h).
3. Envie em todas as rotas privadas: `Authorization: Bearer <token>`.

| Perfil | Permissões |
| --- | --- |
| `admin` | Tudo: dados (criar/editar/excluir), usuários e auditoria |
| `analista` | Dados: criar e editar. **Não** exclui, **não** gerencia usuários |
| `visitante` | Somente leitura |

### Decisões (quando o schema não define)

- **Exclusão de dados** é restrita a `admin`. O `analista` pode criar/editar.
- **`estados`** é tabela de referência: apenas leitura.
- **`registro_alteracoes`** é escrita automaticamente pelas operações de dados; leitura apenas para `admin`.
- Operações em **`usuarios` não geram changelog** para não registrar `senha_hash`.
- `estado_sigla` é **forçado** ao estado da rota (ex.: `POST /api/colaboradores/ro` grava `RO`).
- `filial_id` / `department_id` são referências "soltas" no schema (sem FK): não são validadas pelo backend.
- Se o corpo não trouxer `id`, um UUID é gerado.

## Rotas

### Saúde

| Método | Rota | Acesso |
| --- | --- | --- |
| GET | `/` | público |
| GET | `/api/test` | público |

### Auth

| Método | Rota | Acesso |
| --- | --- | --- |
| POST | `/api/auth/login` | público |
| GET | `/api/auth/me` | autenticado |
| POST | `/api/auth/change-name` | autenticado |
| POST | `/api/auth/change-password` | autenticado |

### Estados

| Método | Rota | Acesso |
| --- | --- | --- |
| GET | `/api/estados` | autenticado |
| GET | `/api/estados/:sigla` | autenticado |

### Recursos por estado

`:recurso` ∈ `colaboradores`, `vagas`, `filiais`, `departamentos`, `lancamentos`
`:estado` ∈ `ro`, `am`, `pa` (aceita maiúsculas)

| Método | Rota | Acesso |
| --- | --- | --- |
| GET | `/api/:recurso/:estado` | autenticado |
| GET | `/api/:recurso/:estado/:id` | autenticado |
| POST | `/api/:recurso/:estado` | admin, analista |
| PUT | `/api/:recurso/:estado/:id` | admin, analista |
| PATCH | `/api/:recurso/:estado/:id` | admin, analista |
| DELETE | `/api/:recurso/:estado/:id` | admin |

Exemplos: `/api/colaboradores/ro`, `/api/vagas/am?aberta=true`, `/api/lancamentos/pa?indicador_id=absenteismo&data_de=2026-01-01`.

### Usuários (somente admin)

| Método | Rota |
| --- | --- |
| GET | `/api/users` |
| GET | `/api/users/:id` |
| POST | `/api/users` |
| PUT | `/api/users/:id` |
| PATCH | `/api/users/:id` |
| DELETE | `/api/users/:id` |

### Auditoria (somente admin)

| Método | Rota |
| --- | --- |
| GET | `/api/registro-alteracoes` |
| GET | `/api/registro-alteracoes/:id` |

### Sincronização

| Método | Rota | Acesso |
| --- | --- | --- |
| GET | `/api/delta/version` | autenticado |
| GET | `/api/delta/sync?versao=N` | autenticado |

### Lote (sincronização do frontend)

Recebe o nome da tabela no formato `colaboradores_ro`.

| Método | Rota | Acesso |
| --- | --- | --- |
| GET | `/api/data/:tabela` | autenticado |
| POST | `/api/data/:tabela` | admin, analista |

Corpo do POST: `{ "upserts": [...], "deletes": ["id1", "id2"] }`.

## Paginação, filtros e busca

- Paginação: `?page=1&limit=50` (limite máximo **100**).
- Busca textual: `?q=texto`.
- Filtros por recurso:

| Recurso | Filtros |
| --- | --- |
| colaboradores | `status`, `setor`, `cargo`, `department_id`, `filial_id`, `tipo` |
| vagas | `tipo_contratacao`, `filial_id`, `aberta` (`true`/`false`) |
| filiais | `gerente` |
| departamentos | — |
| lancamentos | `indicador_id`, `data_de`, `data_ate` |
| usuarios | `perfil`, `ativo`, `q` |
| registro-alteracoes | `tabela`, `registro_id`, `operacao`, `de`, `ate` |

## Segurança

- Todas as queries usam **parâmetros** (`$1`, `$2`, ...); nomes de tabela/coluna vêm de uma allowlist fixa.
- `DATABASE_URL` e `JWT_SECRET` nunca aparecem em respostas nem em logs.
- Erros internos do banco viram `500` genérico.
- `senha_hash` nunca é retornado.
- CORS configurável por `CORS_ORIGIN`.

## Observações

- Valores `numeric` (ex.: `salario`) são devolvidos como **string** pelo driver `pg` (evita perda de precisão). Converta com `Number()` no frontend.
- A conexão é aberta e fechada **a cada requisição** (`Client`), por ser o modo confiável no runtime do Workers.
