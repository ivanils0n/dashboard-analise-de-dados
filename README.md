# Gente & Gestão — Dashboard RH

Dashboard estático de **lançamento e análise de dados de Gente e Gestão (RH)**, com design minimalista em preto, branco e acento verde-esmeralda. Todos os dados ficam salvos no `localStorage` do navegador e podem ser exportados para `.xlsx`.

## Funcionalidades

- **Aba Dashboard**: KPIs dos 8 indicadores, gráfico de linha (evolução histórica) e gráfico de barras (panorama atual), tabela de lançamentos com busca.
- **Filtro de período** na dashboard: aplica intervalo de datas aos KPIs, gráficos e lançamentos. Inicia preenchido com o **mês local atual** (1º e último dia). O **Custo de contratação** é exibido como **média** dos lançamentos no período filtrado.
- **Aba Equipe**: cadastro de colaboradores com **Colaborador, Setor, Usuário, Data de entrada, Status (Ativo/Desligado/Afastado)** e **Tipo (Efetivado/Em experiência)**, além do registro de **data/hora de cadastro e última atualização**.
- **Modal "Lançar dados" dinâmico**: cada indicador selecionado no dropdown altera o modal (abas aparecem/somem conforme a necessidade).
- **Exportação e importação** junto ao filtro de período: botão **Baixar ↓** abre menu com **XLSX** (3 planilhas: `Indicadores`, `Lançamentos` e `Equipe`, esta com o custo de contratação por colaborador), **CSV** ou **Baixar template** (modelo de planilha); botão **Importar ↑** abre o menu **Importar planilha** (importa lançamentos e colaboradores verificando duplicados — dados já existentes são ignorados).
- **Persistência em `localStorage`**.
- Design responsivo, moderno e minimalista.

## Indicadores e origem dos dados

| Indicador | Origem | Tipo |
| --- | --- | --- |
| Headcount | **Equipe** (calculado) | colaboradores ativos |
| Turnover | **Equipe** (calculado) | entradas marcadas no cadastro |
| Absenteísmo | **Modal** (manual) | média de faltas/atrasos/afastamentos no período; gráfico de barras mostra cada tipo |
| Tempo médio de contratação | **Modal** (histórico de vagas) | dias entre abertura e fechamento |
| Custo de contratação | **Modal** (vinculado a colaborador) | R$ |
| Tempo de permanência | **Equipe** (calculado) | média em dias dos desligados |
| Turnover no período de experiência | **Equipe** (calculado) | desligados com até 90 dias |
| Retenção | **Equipe** (calculado) | % de ativos e efetivados |

### Como cada modal funciona

- **Absenteísmo**: abas *Período* (data início/fim, com início do mês e hoje por padrão) e *Ocorrência* (Falta, Atraso ou Afastamento + quantidade).
- **Tempo médio de contratação**: aba *Nova vaga* (nome, data e hora de abertura, com botão **Iniciar** para gravar agora) e aba *Histórico* — cada vaga fica **em aberto** até ser fechada (botão **Fechar** grava data/hora local). É possível **editar** e **excluir** vagas.
- **Custo de contratação**: aba *Colaborador* (barra de pesquisa usando os colaboradores da Equipe) e aba *Custo* (valor do investimento).

### Indicadores calculados pela Equipe

- **Headcount**: total de colaboradores com status *Ativo*.
- **Turnover**: total de colaboradores com a caixa *Contar no índice de turnover* marcada.
- **Tempo de permanência**: média em dias entre cadastro e desligamento dos colaboradores *Desligados*.
- **Turnover no período de experiência**: colaboradores *Desligados* com até 90 dias de casa.
- **Retenção**: % de colaboradores com status *Ativo* (efetivados ou em experiência).

Quando um colaborador é marcado como *Desligado*, a data/hora do desligamento é registrada automaticamente. Todos esses índices são recalculados e gravados como snapshots diários nos KPIs e gráficos.

## Estrutura de pastas

```
Gestão de Gente/
├── index.html                    # Página principal (abas Dashboard e Equipe)
├── env.build.js                  # Lê as variáveis injetadas pelo Vite
├── vite.config.js                # Configuração do Vite (base relativa + env)
├── package.json / pnpm-lock.yaml
├── .nojekyll                     # Publicação sem Jekyll no GitHub Pages
├── .env / .env.example           # Credenciais locais (gitignored)
├── sql/schema.sql                # Tabelas + RLS do Supabase
├── .github/workflows/deploy.yml  # Deploy automático no GitHub Pages
├── public/                       # Tudo que vai para o ar (copiado p/ dist/)
│   ├── logo.png
│   ├── css/style.css             # Estilos (preto, branco e acento vermelho)
│   ├── js/
│   │   ├── config.js             # Definição dos indicadores (manual/computado)
│   │   ├── utils.js              # Formatação de valores, datas e horas
│   │   ├── dialog.js             # Modais de confirmação/alerta
│   │   ├── env.js                # Leitor do .env local (fallback de dev)
│   │   ├── supabase-client.js    # Cliente Supabase + sincronização em lote
│   │   ├── storage.js            # Dados em memória + write-through p/ Supabase
│   │   ├── employees.js          # Domínio da equipe e indicadores calculados
│   │   ├── charts.js             # Gráficos de linha, barras e pizza (Chart.js)
│   │   ├── export.js             # Exportação XLSX/CSV e importação (SheetJS)
│   │   ├── ui.js                 # KPIs, tabela, páginas, modal dinâmico e toast
│   │   ├── equipe.js             # Página Equipe (formulário e lista)
│   │   └── app.js                # Inicialização e eventos globais
│   └── libs/
│       ├── chart.umd.min.js      # Chart.js (local)
│       ├── xlsx.full.min.js      # SheetJS (local)
│       └── supabase.min.js       # supabase-js (local)
```

## Persistência no Supabase

O app funciona 100% offline via `localStorage`, mas agora sincroniza tudo com um banco **Supabase** (Postgres) quando configurado:

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, execute o conteúdo de [`sql/schema.sql`](sql/schema.sql) para criar as tabelas (`lancamentos`, `colaboradores`, `vagas`) e as policies de RLS.
3. Credenciais locais: copie `.env.example` para `.env` com a URL e anon key (**Project Settings → API**). Aceita os nomes `SUPABASE_URL`/`SUPABASE_ANON_KEY` ou `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — o Vite lê o arquivo e injeta tudo no bundle (dev e build):
   ```
   SUPABASE_URL=https://SEU-PROJETO.supabase.co
   SUPABASE_ANON_KEY=sua-anon-key-aqui
   ```
4. Rode o app por HTTP (`pnpm dev`) — a configuração é lida no carregamento e cada lançamento passa a ser gravado também no banco.

Notas:
- O `localStorage` continua servindo de cache offline; ao abrir, os dados do Supabase são verificados de forma econômica (contagens via HEAD) e só a tabela alterada é baixada. Um sync completo ocorre no máximo a cada 10 min.
- Escritas são agrupadas em lote (1 requisição por tabela) e snapshots calculados sem mudança não geram tráfego — otimizado para economizar egress do Supabase.
- Sem `.env` válido (ou aberto via `file://`), o app opera apenas local.
- As policies liberam acesso público às tabelas até que autenticação seja adicionada — use somente a **anon key**, nunca a service_role.
- Estrutura: `js/env.js` (carrega o `.env`), `js/supabase-client.js` (client + sincronização), `js/storage.js` (write-through).

## Como executar

O projeto é 100% estático. Basta abrir o `index.html` no navegador ou usar o servidor incluído:

```bash
pnpm install
pnpm dev
```

## Deploy no GitHub Pages

O deploy usa **GitHub Actions**: a cada push em `main`, o Vite injeta as credenciais dos segredos no bundle durante o build e publica o site.

1. Envie o repositório para o GitHub.
2. Em **Settings → Secrets and variables → Actions**, cadastre os segredos com os mesmos nomes do `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` ⚠️ apenas a anon key, nunca a service_role
3. Em **Settings → Pages → Build and deployment → Source**, selecione **GitHub Actions**.
4. Faça push em `main` (ou rode o workflow manualmente em *Actions → Deploy para GitHub Pages → Run workflow*).

> Alternativa manual: publique pelo método *Deploy from a branch* rodando `npm run build` com as variáveis definidas. O `.nojekyll` incluído garante publicação sem processamento Jekyll.

## Deploy no Cloudflare Pages

O Cloudflare Pages conecta direto no repositório do GitHub e roda o script de build a cada push:

1. No dashboard: **Workers & Pages → Create application → Pages → Connect to Git** e selecione o repositório.
2. Na configuração de build:
   - **Framework preset:** `None`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
3. Em **Settings → Environment variables (Production)**, adicione:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` ⚠️ apenas a anon key, nunca a service_role
4. **Save and Deploy** — o Vite injeta as credenciais no bundle durante o build; nenhum arquivo de credenciais é publicado no site.

## Como adicionar um novo indicador

Tudo é centralizado em `js/config.js`. Adicione um novo objeto ao array `INDICATORS`:

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
  form: "meu_formulario"     // implemente o formulário em ui.js (buildModalForm)
}
```

## Melhorias futuras (sugestões)

- Integração com API/backend ou `IndexedDB` para maior volume de dados.
- Autenticação e controle de acesso por perfil.
- Importação de dados via CSV/Excel.
- Exportação em PDF/CSV além de XLSX.
- Filtros por período e comparação entre períodos.
- Metas e limites (alertas quando um indicador ultrapassa o esperado).
- Gráficos adicionais (pizza/radar) e tema claro/escuro.
- Migração para um framework (React/Vue) quando o escopo crescer.

## Dependências

Bibliotecas incluídas localmente em `libs/`:

- [Chart.js](https://www.chartjs.org/) — gráficos
- [SheetJS](https://sheetjs.com/) — exportação XLSX# gente-gestao
# gente-gestao
