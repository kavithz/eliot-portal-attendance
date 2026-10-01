import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "@prisma/client";
import { findActiveSessionUser } from "./session-user";

function sessionUser(isActive: boolean) {
  return {
    id: "employee-1",
    name: "Employee One",
    email: "employee@example.invalid",
    role: Role.EMPLOYEE,
    isActive,
    employeeCode: "EMP-1",
    countryCode: "LK",
    timeZone: "Asia/Colombo",
  };
}

describe("authenticated session user lookup", () => {
  it("returns only the public projection for active accounts", async () => {
    let selected: Record<string, boolean> | undefined;
    const database = {
      user: {
        findUnique: async ({ select }: { select: Record<string, boolean> }) => {
          selected = select;
          return sessionUser(true);
        },
      },
    } as never;

    const user = await findActiveSessionUser("employee-1", database);

    assert.equal(user?.email, "employee@example.invalid");
    assert.equal("passwordHash" in (selected ?? {}), false);
    assert.equal("passwordHash" in (user ?? {}), false);
  });

  it("keeps inactive accounts out of sessions", async () => {
    const database = { user: { findUnique: async () => sessionUser(false) } } as never;
    assert.equal(await findActiveSessionUser("employee-1", database), null);
  });

  it("propagates database failures instead of treating them as invalid sessions", async () => {
    const database = { user: { findUnique: async () => { throw new Error("database unavailable"); } } } as never;
    await assert.rejects(findActiveSessionUser("employee-1", database), /database unavailable/);
  });
});