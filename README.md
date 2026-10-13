# Project Management — Freelance Dashboard

A full-stack project management app for freelancers: track clients, projects, tasks, time and expenses, and see earnings and outstanding invoices in one dashboard.

**Stack:** React · TypeScript · tRPC · Express · PostgreSQL · Drizzle ORM

---

## Features

**Projects & tasks**
- Project boards with **table, calendar, dashboard and budget** views
- Task groups, custom columns, assignees, priorities, due dates and multi-select bulk actions
- Task detail panel with comments, `@mentions` and an activity history
- **Automations**: "when X happens, do Y" rules (e.g. status changed, task created, due date reached)
- Due-soon / overdue notifications and **live updates** across open tabs (Server-Sent Events)

**Freelance business**
- **Clients** with contact details, country, source, currency and default hourly rate
- Project lifecycle: proposal → active → invoiced → paid
- **Time tracking** with a running timer, plus **expenses** and per-project budgets
- **Reports**: 12-month earnings chart, top clients by revenue, outstanding (invoiced but unpaid) and active projects
- **Credentials vault**: store project logins encrypted with AES-256-GCM

**Platform**
- Email/password login with JWT in an `httpOnly` cookie; two-factor (TOTP) support in the API
- Role-based permissions; only admins can create accounts
- Password reset and notification emails via SendGrid (optional)
- English / German UI
- Security headers (Helmet) and per-IP rate limiting

---

## Tech stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query, Recharts, i18next |
| API      | tRPC on Express, Zod validation, Server-Sent Events |
| Auth     | JWT, bcrypt, TOTP (otplib) |
| Database | PostgreSQL with Drizzle ORM and versioned SQL migrations |
| Tooling  | npm workspaces (monorepo), ESLint, GitHub Actions CI |

```
client/    React app
server/    Express + tRPC API — routers → services → database
shared/    TypeScript types shared by client and server
drizzle/   Database schema and migrations
```

---

## Getting started

**Requirements:** Node.js 20+, PostgreSQL 14+

```bash
git clone https://github.com/CodeBuild-Dev/project-management-system.git
cd project-management-system
npm install

cp .env.example .env    # then fill in the values (see below)
npm run db:migrate      # create tables

npm run dev:server      # API on http://localhost:3001
npm run dev             # app on http://localhost:8080 (in a second terminal)
```

Sign in at http://localhost:8080 with the `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` from your `.env`. The account and a default workspace are created when the server starts.

### Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Signs login sessions (16+ random characters) |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Yes | Owner account (password 8+ characters) |
| `RESOURCE_VAULT_KEY` | For the vault | 32-byte base64 key: `openssl rand -base64 32` |
| `SENDGRID_API_KEY`, `MAIL_FROM` | Optional | Password reset and notification emails |
| `FRONTEND_URL` | Optional | Allowed CORS origin (default `http://localhost:8080`) |

See [.env.example](./.env.example). Never commit your `.env` file.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` / `npm run dev:server` | Run the app / API in watch mode |
| `npm run db:migrate` | Apply database migrations |
| `npm run typecheck` | Type-check all packages |
| `npm run build` | Build all packages |
| `npm start` | Run migrations, then start the production server |

---

## Deployment

Deploys to [Railway](https://railway.app) as one service ([railway.json](./railway.json), [nixpacks.toml](./nixpacks.toml)). On start it applies migrations, then Express serves the API and the built React app. Set the environment variables above in the Railway service.

---

## License

[MIT](./LICENSE)
