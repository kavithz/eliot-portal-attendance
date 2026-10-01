# Attendance System

Phase 1 foundation for employee authentication, office/WFH work sessions, attendance history, and protected admin routes.

## Local setup

Requirements: Node.js 20.9 or later, npm, and a reachable PostgreSQL database.

1. Copy `.env.example` to `.env` and replace the placeholders. Set `DATABASE_URL`, generate a unique random `SESSION_SECRET` of at least 32 characters (for example, `openssl rand -base64 48`), and set the initial admin's name, email, country code, IANA timezone, and strong password. The example intentionally has no usable database credentials, session secret, or admin password. Keep `.env` private; it is gitignored.
2. Install dependencies with `npm ci`.
3. Generate the Prisma client with `npm run db:generate`.
4. Apply the committed schema migrations with `npm run db:migrate:deploy`.
5. Create the initial admin with `npm run db:seed`. Seeding is create-only; it does not reset an existing account.
6. Start the app with `npm run dev` and open `http://localhost:3000`.

Use `npm run db:migrate -- --name <migration_name>` while developing schema changes. `npm run db:push` is for disposable local prototyping only; do not use it to deploy production schema changes.

## Production deployment

Configure these runtime environment variables in the hosting platform before starting the app:

- `DATABASE_URL`: PostgreSQL connection string for the target environment.
- `SESSION_SECRET`: unique random secret of at least 32 characters. Do not reuse the example or a secret from another environment.

For a fresh database, deploy in this order. Use the PostgreSQL provider's TLS-enabled connection string in production; do not disable transport encryption.

1. `npm ci`
2. `npm run db:migrate:deploy`
3. `npm run db:generate`
4. First admin: set the five `ADMIN_*` variables and run `npm run db:seed` once
5. `npm run build`
6. `npm start`

Set `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_COUNTRY_CODE`, `ADMIN_TIME_ZONE`, and `ADMIN_PASSWORD` only when creating the first administrator, then run `npm run db:seed` once. The seed does not update or reactivate an existing account. An account already using the legacy `admin@example.com` address must be reviewed and migrated manually before creating the configured administrator.

For an existing database previously created with `db:push`, do not run `migrate deploy` until it has been backed up and verified against the initial migration. Compare the live schema with the Prisma schema using `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script`. If the schema matches, baseline it with `npx prisma migrate resolve --applied 20261001000000_initial_attendance_schema`, then run `npm run db:migrate:deploy`. If the diff is nonempty, stop and reconcile it deliberately; do not baseline or apply changes blindly.

## System boundaries

- Session timestamps are server-generated instants stored in PostgreSQL `timestamptz` columns. Local dates, classifications, and displayed times use each employee's validated IANA timezone.
- The existing schedule is 08:30–17:30 employee-local time and is shared by Office and WFH sessions.
- Each session receives its own attendance record. Its date-only `workDate` remains unset; the schema intentionally has no one-record-per-day constraint.
- Admin attendance review, corrections, employee management, and reports operate on existing attendance data. Leave, holidays, payroll, and overtime are not configured.