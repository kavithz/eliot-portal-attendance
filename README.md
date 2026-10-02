# Attendance System

Phase 1 foundation for employee authentication, office/WFH work sessions, attendance history, and protected admin routes.

## Local setup

Requirements: Node.js 20.9 or later, npm, and a reachable PostgreSQL database.

1. Copy `.env.example` to `.env` and replace the placeholders. Set `DATABASE_URL` and `DIRECT_URL` to your database URLs, generate a unique random `SESSION_SECRET` of at least 32 characters (for example, `openssl rand -base64 48`), and set the initial admin's name, email, country code, IANA timezone, and strong password. The example intentionally has no usable database credentials, session secret, or admin password. Keep `.env` private; it is gitignored.
2. Install dependencies with `npm ci`.
3. Generate the Prisma client with `npm run db:generate`.
4. On an empty local database, apply the committed migrations with `npm run db:migrate:deploy`. For any database with existing tables or attendance records, inspect its migration history and schema first; follow [DEPLOYMENT.md](DEPLOYMENT.md) rather than applying migrations blindly.
5. Create the initial admin with `npm run db:seed`. Seeding is create-only; it does not reset an existing account.
6. Start the app with `npm run dev` and open `http://localhost:3000`.

Use `npm run db:migrate -- --name <migration_name>` while developing schema changes. `npm run db:push` is for disposable local prototyping only; do not use it to deploy production schema changes.

## Production deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for the Vercel and Neon setup, environment variables, and migration procedure. The Prisma model is aligned with the checked-in migration sequence, but an existing database with pending or unrecorded migrations must be inspected and reconciled before applying migrations; never baseline it from a schema diff alone.

## System boundaries

- Session timestamps are server-generated instants stored in PostgreSQL `timestamptz` columns. Local dates, classifications, and displayed times use each employee's validated IANA timezone.
- The existing schedule is 08:30–17:30 employee-local time and is shared by Office and WFH sessions.
- Each session receives its own attendance record. Its date-only `workDate` remains unset; the schema intentionally has no one-record-per-day constraint.
- Admin attendance review, corrections, employee management, and reports operate on existing attendance data. Leave, holidays, payroll, and overtime are not configured.