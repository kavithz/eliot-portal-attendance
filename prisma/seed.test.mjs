import assert from "node:assert/strict";
import { describe, it } from "node:test";
import seed from "./seed.cjs";

const { planAdminSeed } = seed;

describe("production-safe administrator seed planning", () => {
  it("creates only when no configured, legacy, or other administrator exists", () => {
    assert.equal(planAdminSeed(null, null, null), "create");
  });

  it("leaves an existing active configured admin unchanged even when credentials differ", () => {
    assert.equal(planAdminSeed({ role: "ADMIN", isActive: true }, null, null), "unchanged");
  });

  it("refuses to overwrite an inactive or non-admin account at the configured email", () => {
    assert.throws(() => planAdminSeed({ role: "ADMIN", isActive: false }, null, null), /No changes were made/);
    assert.throws(() => planAdminSeed({ role: "EMPLOYEE", isActive: true }, null, null), /No changes were made/);
  });

  it("refuses to rename a legacy account or create another admin implicitly", () => {
    assert.throws(() => planAdminSeed(null, { id: "legacy" }, null), /Resolve it manually/);
    assert.throws(() => planAdminSeed(null, null, { id: "existing-admin" }), /will not create another/);
  });

  it("refuses to leave two active configured and legacy administrators in place", () => {
    assert.throws(
      () => planAdminSeed({ role: "ADMIN", isActive: true }, { role: "ADMIN", isActive: true }, null),
      /active legacy administrator/,
    );
  });
});