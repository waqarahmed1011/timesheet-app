# Timesheet App

Weekly timesheets for workers and subcontractor crews, with PM then GC approval, a dashboard, a permanent weekly archive, and PDF/Excel downloads. See [PLAN.md](PLAN.md) for the full plan and later phases (payroll, certified payroll, job cost, accounting).

## What's in Phase 1

- **Weeks run Sunday to Saturday**, due Monday 10:00 AM Central. Late sheets are accepted and flagged.
- **Each day:** start time, end time, "No lunch taken" checkbox. 30 minutes unpaid lunch is taken off automatically on days of 7.5 hours or more. The day's paid hours are split across project + work phase rows, and the rows must add up. Quarter-hour steps.
- **Who submits:** workers sign their own sheet with a finger signature, or a foreman fills and signs sheets for their own company's crew (including workers with no login).
- **Approvals:** the PM of each project on the sheet approves, then the GC gives final approval and the sheet locks. Approvers type their name to sign. They can send a sheet back with a comment, or edit hours with a required reason (this restarts approvals). Admin can reopen a locked sheet or void a sheet, with a reason.
- **Everything is logged:** every change records who, when, old value, new value and reason. Nothing is deleted.
- **Dashboard:** expected/submitted/approved counts, missing sheets, late sheets, over-40 watch, who approvals are waiting on, hours by project and phase (week, last 4 weeks, project to date).
- **Archive and downloads:** any week as Excel (summary, detail, by project) or a zip of every sheet PDF plus the Excel. Each sheet as PDF. Every generated file is stored with a checksum and can be re-downloaded exactly.
- **Setup screens** for companies, users and roles, workers, projects (number, name, PM, foremen) and work phases with cost codes.

Not yet: pay rates, payroll exports, reminders, offline mode, certified payroll. Those are Phase 2 and 3 in PLAN.md.

## Roles

| Role | Can do |
|---|---|
| Admin | Setup screens, dashboard, archive, audit log, reopen/void, fill any crew sheet |
| GC | Final approval on every sheet, dashboard, archive |
| PM | First approval on sheets with hours on their projects; edit or send back |
| Foreman | Fill and sign sheets for workers in their own company; see all hours on projects they're assigned to |
| Worker | Fill and sign their own sheet; see their history |

## Run it locally

Needs Node 20+ and PostgreSQL.

```bash
npm install
```

```bash
cp .env.example .env
```

Edit `.env`: set `DATABASE_URL`, set `AUTH_SECRET` (run `npx auth secret`), and for local testing set `DEV_LOGIN=1` (lets you pick any user on the login page; never set it in production; it's ignored in production builds anyway).

```bash
npx prisma migrate deploy
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000. The demo users are `gc@example.com` (admin + GC), `pm1@example.com`, `pm2@example.com`, `foreman@example.com`, `subforeman@example.com`, `worker@example.com`.

## Tests

```bash
npm test
```

Unit tests: week boundaries (DST, year rollover), lunch rule, quarter hours, approval rules, permissions.

```bash
npm run test:e2e
```

End-to-end tests in a phone-size browser: submit and sign, two-PM approval then GC lock, reopen, send back and resubmit, PM edit with audit trail, foreman crew sheet, PDF/Excel contents, dashboard. Each run creates a new empty database (`timesheet_e2e_<timestamp>`) on the Postgres in `E2E_PG_URL` (default `postgresql://app:app@localhost:5432/postgres`); it never touches your dev database. Old test databases can be dropped by hand.

## Going live

1. **Database:** create a Supabase project (free tier is OK for Phase 1). Copy the connection string into `DATABASE_URL`. Run `npx prisma migrate deploy` against it.
2. **Google sign-in:** Google Cloud Console > APIs & Services > Credentials > Create OAuth client ID (Web). Authorized redirect URI: `https://YOUR-DOMAIN/api/auth/callback/google`. Put the ID and secret in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
3. **Email sign-in links** (for workers without Google): create a Resend account, verify your domain, set `AUTH_RESEND_KEY` and `AUTH_EMAIL_FROM`.
4. **Hosting:** Netlify or Cloudflare free tier. Vercel's free plan doesn't allow commercial use. Set all the env vars there, plus `COMPANY_NAME`. Do **not** set `DEV_LOGIN`.
5. **First admin:** nobody can sign in until they exist as a user. Add yourself once directly in the database (Supabase table editor: a `User` row with your email and roles `{ADMIN,GC}`), sign in, then add everyone else from Setup.
6. Only people added in Setup > Users can sign in. Each person who fills their own sheet also needs a Worker record linked to their login.

Before storing any pay, SSN or W-4 data (later phases), move off the free database tier to one with real backups. See PLAN.md section 12.
