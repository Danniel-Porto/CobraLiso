# Cobra Liso

Aplicacao web simples para acompanhar emprestimos entre amigos.

## Stack

- Node.js + Express + EJS
- PostgreSQL
- Drizzle ORM + migrations SQL
- Sessao com `express-session` + `connect-pg-simple`

## Requisitos

- Node.js 20+
- PostgreSQL rodando localmente ou via Docker

## Configuracao rapida

1. Instale dependencias:

```bash
npm install
```

2. Copie o arquivo de ambiente:

```bash
cp .env.example .env
```

No Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

3. Ajuste a `DATABASE_URL` e `SESSION_SECRET` no `.env`.

4. Gere/aplique migrations:

```bash
npm run db:generate
npm run db:migrate
```

5. Crie o admin inicial:

```bash
npm run seed:admin -- "Administrador" "1234"
```

6. Rode a aplicacao:

```bash
npm run dev
```

Abra: `http://localhost:3000`

Login: use `nome + senha`.

## Docker Compose (VPS/local)

1. Configure `.env` com:

```env
DATABASE_URL=postgresql://cobraliso:senha@db:5432/cobraliso
SESSION_SECRET=troque-por-um-segredo-forte
PORT=3000
NODE_ENV=production
```

2. Suba os servicos:

```bash
docker compose up -d --build
```

3. Acesse em `http://<ip-da-vps>:3000`.

## Railway

1. Crie um servico **PostgreSQL** no projeto e conecte `DATABASE_URL` na app (reference variable).
2. Defina `SESSION_SECRET` e `NODE_ENV=production`.
3. O comando `npm start` ja roda `drizzle-kit migrate` antes de subir o servidor.
4. Apos o primeiro deploy, execute uma vez no Railway (**Run Command**):

```bash
npm run seed:admin -- "Administrador" "1234"
```

5. Login: nome + senha (nao diferencia maiusculas/minusculas).

## Regras de negocio principais

- Pagamentos reduzem saldo imediatamente.
- Pagamento pode receber comprovante PDF opcional.
- Tambem e possivel anexar comprovante depois, no historico de transacoes.
- Comprovante fica salvo no Postgres em base64 e pode ser baixado para visualizacao.
- Fechamento mensal aplica juros sobre saldo atual (`saldo * taxa / 100`).
- Nao ha parcelas fixas obrigatorias; o devedor paga quando quiser.
- Simulador no detalhe do emprestimo replica o algoritmo de juros dinamico sem alterar o saldo real.

## Estrutura

- `src/index.js`: bootstrap da aplicacao, sessao e cron mensal.
- `src/db/schema.js`: tabelas `users`, `loans`, `transactions`, `month_closures`.
- `src/services/interest.js`: calculo de juros e simulador.
- `src/services/monthClose.js`: fechamento mensal.
- `src/routes/`: auth, usuarios, emprestimos e pagamentos.
