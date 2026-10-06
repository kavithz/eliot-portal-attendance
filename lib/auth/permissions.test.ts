import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "@prisma/client";
import { hasPermission } from "./permissions";

describe("role permissions", () => {
  it("preserves ADMIN as the full-access compatibility role", () => {
    assert.equal(hasPermission(Role.ADMIN, "employee:manage"), true);
    assert.equal(hasPermission(Role.ADMIN, "leave:approve"), true);
    assert.equal(hasPermission(Role.ADMIN, "payroll:export"), true);
  });

  it("grants HR Administrator the SRS HR management capabilities", () => {
    assert.equal(hasPermission(Role.HR_ADMINISTRATOR, "employee:manage"), true);
    assert.equal(hasPermission(Role.HR_ADMINISTRATOR, "attendance:manage"), true);
    assert.equal(hasPermission(Role.HR_ADMINISTRATOR, "leave:manage"), true);
    assert.equal(hasPermission(Role.HR_ADMINISTRATOR, "shift:manage"), true);
    assert.equal(hasPermission(Role.HR_ADMINISTRATOR, "reports:read"), true);
    assert.equal(hasPermission(Role.HR_ADMINISTRATOR, "leave:approve"), true);
  });

  it("limits Department Manager permissions to the SRS department duties", () => {
    assert.equal(hasPermission(Role.DEPARTMENT_MANAGER, "attendance:department:read"), true);
    assert.equal(hasPermission(Role.DEPARTMENT_MANAGER, "leave:approve"), true);
    assert.equal(hasPermission(Role.DEPARTMENT_MANAGER, "attendance:manage"), false);
    assert.equal(hasPermission(Role.DEPARTMENT_MANAGER, "employee:manage"), false);
  });

  it("limits Supervisor permissions to assigned employee work and request review", () => {
    assert.equal(hasPermission(Role.SUPERVISOR, "attendance:assigned:read"), true);
    assert.equal(hasPermission(Role.SUPERVISOR, "leave:approve"), true);
    assert.equal(hasPermission(Role.SUPERVISOR, "attendance:department:read"), false);
    assert.equal(hasPermission(Role.SUPERVISOR, "leave:manage"), false);
  });

  it("keeps Employee permissions self-service only", () => {
    assert.equal(hasPermission(Role.EMPLOYEE, "leave:submit"), true);
    assert.equal(hasPermission(Role.EMPLOYEE, "leave:request:self:read"), true);
    assert.equal(hasPermission(Role.EMPLOYEE, "leave:balance:self:read"), true);
    assert.equal(hasPermission(Role.EMPLOYEE, "leave:approve"), false);
    assert.equal(hasPermission(Role.EMPLOYEE, "attendance:department:read"), false);
  });
});
