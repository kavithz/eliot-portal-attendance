import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  changeAuthenticatedUserPassword,
  PasswordChangeAuthenticationError,
  PasswordChangeCurrentPasswordError,
  PasswordChangeSamePasswordError,
  PasswordChangeUnavailableError,
} from "./change-password";

const currentPassword = "Current-Password-2026";
const newPassword = "New-Password-For-2026";
const currentHash = hashPassword(currentPassword);

function createDatabaseStub(options: { isActive?: boolean; id?: string } = {}) {
  let account = {
    id: options.id ?? "employee-1",
    isActive: options.isActive ?? true,
    passwordHash: "",
    sessionVersion: 0,
  };
  let updateWhere: Record<string, unknown> | undefined;
  let updateData: Record<string, unknown> | undefined;

  const database = {
    user: {
      findUnique: async ({ where }: { where: { id: string } }) => where.id === account.id ? { ...account } : null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        updateWhere = where;
        updateData = data;
        if (where.id !== account.id || where.isActive !== account.isActive || where.sessionVersion !== account.sessionVersion) {
          return { count: 0 };
        }
        const increment = data.sessionVersion as { increment: number };
        account = {
          ...account,
          passwordHash: String(data.passwordHash),
          sessionVersion: account.sessionVersion + increment.increment,
        };
        return { count: 1 };
      },
    },
  } as never;

  return {
    database,
    initialize: async () => { account.passwordHash = await currentHash; },
    getAccount: () => account,
    getUpdateWhere: () => updateWhere,
    getUpdateData: () => updateData,
  };
}

const validInput = {
  currentPassword,
  newPassword,
  confirmPassword: newPassword,
};

describe("change authenticated user's password", () => {
  it("stores a bcrypt hash and increments the session version", async () => {
    const stub = createDatabaseStub();
    await stub.initialize();

    const result = await changeAuthenticatedUserPassword({ id: "employee-1" }, validInput, stub.database);

    assert.equal(result.sessionVersion, 1);
    assert.equal(stub.getAccount().sessionVersion, 1);
    assert.notEqual(stub.getAccount().passwordHash, newPassword);
    assert.equal(await verifyPassword(newPassword, stub.getAccount().passwordHash), true);
    assert.deepEqual(stub.getUpdateWhere(), { id: "employee-1", isActive: true, sessionVersion: 0 });
    assert.equal("userId" in (stub.getUpdateData() ?? {}), false);
  });

  it("rejects an incorrect current password without updating the account", async () => {
    const stub = createDatabaseStub();
    await stub.initialize();

    await assert.rejects(
      changeAuthenticatedUserPassword({ id: "employee-1" }, { ...validInput, currentPassword: "Wrong-Password-2026" }, stub.database),
      PasswordChangeCurrentPasswordError,
    );
    assert.equal(stub.getUpdateData(), undefined);
  });

  it("rejects empty, too-short, and bcrypt-over-limit new passwords", async () => {
    const stub = createDatabaseStub();
    await stub.initialize();

    for (const invalidPassword of ["", "short", "é".repeat(37)]) {
      await assert.rejects(
        changeAuthenticatedUserPassword({ id: "employee-1" }, {
          ...validInput,
          newPassword: invalidPassword,
          confirmPassword: invalidPassword,
        }, stub.database),
        { name: "ZodError" },
      );
    }
    assert.equal(stub.getUpdateData(), undefined);
  });

  it("rejects a confirmation that does not match", async () => {
    const stub = createDatabaseStub();
    await stub.initialize();

    await assert.rejects(
      changeAuthenticatedUserPassword({ id: "employee-1" }, { ...validInput, confirmPassword: "Other-Password-2026" }, stub.database),
      { name: "ZodError" },
    );
    assert.equal(stub.getUpdateData(), undefined);
  });

  it("rejects a new password identical to the current password", async () => {
    const stub = createDatabaseStub();
    await stub.initialize();

    await assert.rejects(
      changeAuthenticatedUserPassword({
        id: "employee-1",
      }, {
        currentPassword,
        newPassword: currentPassword,
        confirmPassword: currentPassword,
      }, stub.database),
      PasswordChangeSamePasswordError,
    );
    assert.equal(stub.getUpdateData(), undefined);
  });

  it("rejects unauthenticated requests", async () => {
    const stub = createDatabaseStub();
    await stub.initialize();

    await assert.rejects(changeAuthenticatedUserPassword(null, validInput, stub.database), PasswordChangeAuthenticationError);
    assert.equal(stub.getUpdateData(), undefined);
  });

  it("rejects inactive accounts", async () => {
    const stub = createDatabaseStub({ isActive: false });
    await stub.initialize();

    await assert.rejects(changeAuthenticatedUserPassword({ id: "employee-1" }, validInput, stub.database), PasswordChangeUnavailableError);
    assert.equal(stub.getUpdateData(), undefined);
  });

  it("updates only the session user's account, ignoring a submitted target ID", async () => {
    const stub = createDatabaseStub();
    await stub.initialize();

    await changeAuthenticatedUserPassword({ id: "employee-1" }, { ...validInput, userId: "another-user" }, stub.database);

    assert.equal(stub.getUpdateWhere()?.id, "employee-1");
    assert.equal(stub.getAccount().id, "employee-1");
  });
});