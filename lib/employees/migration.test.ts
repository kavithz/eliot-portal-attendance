import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const migration = readFileSync(join(
  process.cwd(),
  "prisma/migrations/20261003000002_employee_data_foundation/migration.sql",
), "utf8");

describe("Employee foundation migration", () => {
  it("backfills each existing User using its existing ID and available name/code only", () => {
    assert.match(migration, /INSERT INTO "Employee" \("id", "name", "employeeId", "userId", "createdAt", "updatedAt"\)/);
    assert.match(migration, /SELECT 'employee_' \|\| "id", "name", "employeeCode", "id", "createdAt", "updatedAt"\s+FROM "User"/);
    assert.doesNotMatch(migration, /COALESCE|UPDATE "User"|DROP TABLE|TRUNCATE/);
  });

  it("adds unique constraints without changing attendance tables or User IDs", () => {
    assert.match(migration, /CREATE UNIQUE INDEX "Employee_employeeId_key"/);
    assert.match(migration, /CREATE UNIQUE INDEX "Employee_nic_key"/);
    assert.match(migration, /CREATE UNIQUE INDEX "Employee_userId_key"/);
    assert.doesNotMatch(migration, /ALTER TABLE "AttendanceRecord"|ALTER TABLE "WorkSession"|ALTER TABLE "User"\s+ALTER COLUMN "id"/);
  });
});