import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { verifyPassword } from "@/lib/auth/password";
import {
  forgotPasswordMessage,
  hashPasswordResetToken,
  isPasswordResetTokenValid,
  PasswordResetLinkError,
  requestPasswordReset,
  resetPasswordWithToken,
  type PasswordResetDatabase,
} from "./password-reset";
import { createPasswordResetUrl } from "./password-reset-email";

const now = new Date("2026-10-03T12:00:00.000Z");
const throttleSecret = "test-only-secret-value-long-enough-for-hmac";
const password = "Reset-Password-For-2026";

function createDatabase(options: { email?: string; isActive?: boolean; sessionVersion?: number } = {}) {
  const users = new Map<string, { id: string; email: string; name: string; isActive: boolean; passwordHash: string; sessionVersion: number }>();
  if (options.email) {
    users.set("employee-1", {
      id: "employee-1",
      email: options.email,
      name: "Employee One",
      isActive: options.isActive ?? true,
      passwordHash: "previous-hash",
      sessionVersion: options.sessionVersion ?? 4,
    });
  }
  const tokens = new Map<string, { id: string; userId: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }>();
  const buckets = new Map<string, number>();
  const audits: Array<Record<string, unknown>> = [];
  const lookups: Array<Record<string, unknown>> = [];
  let transactions = 0;
  let inTransaction = false;

  const database = {
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        lookups.push(where);
        return [...users.values()].find((user) => (where.email ? user.email === where.email : user.id === where.id)) ?? null;
      },
      updateMany: async ({ where, data }: { where: { id: string; isActive: boolean }; data: { passwordHash: string; sessionVersion: { increment: number } } }) => {
        assert.equal(inTransaction, true);
        const user = users.get(where.id);
        if (!user || user.isActive !== where.isActive) return { count: 0 };
        user.passwordHash = data.passwordHash;
        user.sessionVersion += data.sessionVersion.increment;
        return { count: 1 };
      },
    },
    passwordResetToken: {
      deleteMany: async () => ({ count: 0 }),
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const token = tokens.get(where.tokenHash);
        if (!token) return null;
        const user = users.get(token.userId);
        return { ...token, user: { isActive: user?.isActive ?? false } };
      },
      updateMany: async ({ where, data }: { where: { userId?: string; tokenHash?: string; id?: string; usedAt?: null; expiresAt?: { gt: Date } }; data: { usedAt: Date } }) => {
        if (where.id) assert.equal(inTransaction, true);
        const matching = [...tokens.values()].filter((token) =>
          (!where.userId || token.userId === where.userId)
          && (!where.tokenHash || token.tokenHash === where.tokenHash)
          && (!where.id || token.id === where.id)
          && (where.usedAt !== null || token.usedAt === null)
          && (!where.expiresAt || token.expiresAt > where.expiresAt.gt),
        );
        for (const token of matching) token.usedAt = data.usedAt;
        return { count: matching.length };
      },
      create: async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
        assert.equal(inTransaction, true);
        const token = { id: `token-${tokens.size + 1}`, ...data, usedAt: null };
        tokens.set(data.tokenHash, token);
        return { id: token.id };
      },
    },
    passwordResetRateLimit: {
      deleteMany: async () => ({ count: 0 }),
      upsert: async ({ where, create }: { where: { keyHash_windowStart: { keyHash: string; windowStart: Date } }; create: { keyHash: string; windowStart: Date; requestCount: number } }) => {
        const key = `${where.keyHash_windowStart.keyHash}:${where.keyHash_windowStart.windowStart.toISOString()}`;
        const requestCount = (buckets.get(key) ?? 0) + 1;
        buckets.set(key, requestCount);
        return { requestCount, keyHash: create.keyHash };
      },
    },
    attendanceAuditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        assert.equal(inTransaction, true);
        audits.push(data);
        return { id: `audit-${audits.length}` };
      },
    },
    $transaction: async (operation: (transaction: unknown) => Promise<unknown>) => {
      transactions += 1;
      inTransaction = true;
      try {
        return await operation(database);
      } finally {
        inTransaction = false;
      }
    },
  } as unknown as PasswordResetDatabase;

  return { database, users, tokens, buckets, audits, lookups, getTransactions: () => transactions };
}

describe("forgot password requests", () => {
  it("normalizes email, returns the same generic result, and stores only a token hash for the correct user", async () => {
    const stub = createDatabase({ email: "employee@example.com" });
    let sent: { email: string; name: string; token: string } | undefined;

    const result = await requestPasswordReset({ email: "  EMPLOYEE@Example.com " }, "203.0.113.8", {
      database: stub.database,
      throttleSecret,
      now,
      minimumResponseMs: 0,
      sendEmail: async (message) => { sent = message; },
    });

    assert.equal(result, undefined);
    assert.deepEqual(stub.lookups[0], { email: "employee@example.com" });
    assert.equal(sent?.email, "employee@example.com");
    assert.equal(sent?.name, "Employee One");
    assert.ok(sent?.token);
    assert.equal(stub.tokens.size, 1);
    const stored = [...stub.tokens.values()][0];
    assert.equal(stored.userId, "employee-1");
    assert.equal(stored.tokenHash, hashPasswordResetToken(sent.token));
    assert.notEqual(stored.tokenHash, sent.token);
    assert.equal(stored.expiresAt.getTime(), now.getTime() + 30 * 60 * 1000);
    assert.deepEqual(stub.audits, [{ employeeId: "employee-1", actionType: "PASSWORD_RESET_REQUESTED" }]);
    assert.equal(JSON.stringify(stub.audits).includes(sent.token), false);
  });

  it("returns the same generic result for an unknown address without sending mail", async () => {
    const stub = createDatabase();
    let sendCount = 0;

    const result = await requestPasswordReset({ email: "missing@example.com" }, "203.0.113.8", {
      database: stub.database,
      throttleSecret,
      now,
      minimumResponseMs: 0,
      sendEmail: async () => { sendCount += 1; },
    });

    assert.equal(result, undefined);
    assert.equal(forgotPasswordMessage, "If an account with that email exists, you will receive instructions to reset your password.");
    assert.equal(sendCount, 0);
    assert.equal(stub.tokens.size, 0);
  });

  it("throttles repeated requests by normalized email while keeping the response generic", async () => {
    const stub = createDatabase({ email: "employee@example.com" });
    let sendCount = 0;

    for (let index = 0; index < 4; index += 1) {
      const result = await requestPasswordReset({ email: index === 0 ? " EMPLOYEE@example.com " : "employee@example.com" }, "203.0.113.8", {
        database: stub.database,
        throttleSecret,
        now,
        minimumResponseMs: 0,
        sendEmail: async () => { sendCount += 1; },
      });
      assert.equal(result, undefined);
    }

    assert.equal(sendCount, 3);
    assert.ok([...stub.buckets.keys()].every((key) => !key.includes("employee@example.com") && !key.includes("203.0.113.8")));
  });

  it("does not issue a reset link for inactive accounts", async () => {
    const stub = createDatabase({ email: "employee@example.com", isActive: false });
    let sendCount = 0;

    await requestPasswordReset({ email: "employee@example.com" }, "203.0.113.8", {
      database: stub.database,
      throttleSecret,
      now,
      minimumResponseMs: 0,
      sendEmail: async () => { sendCount += 1; },
    });

    assert.equal(sendCount, 0);
    assert.equal(stub.tokens.size, 0);
  });

  it("keeps reset delivery failures generic and consumes the undelivered token", async () => {
    const stub = createDatabase({ email: "employee@example.com" });

    const result = await requestPasswordReset({ email: "employee@example.com" }, "203.0.113.8", {
      database: stub.database,
      throttleSecret,
      now,
      minimumResponseMs: 0,
      sendEmail: async () => { throw new Error("SMTP transport failure"); },
    });

    assert.equal(result, undefined);
    assert.equal([...stub.tokens.values()][0].usedAt?.getTime(), now.getTime());
  });
});

describe("password reset email URL", () => {
  it("uses the configured application URL and encodes the token in the reset route", () => {
    const url = new URL(createPasswordResetUrl("opaque-token", "https://attendance.example.test/base"));
    assert.equal(url.origin, "https://attendance.example.test");
    assert.equal(url.pathname, "/reset-password");
    assert.equal(url.searchParams.get("token"), "opaque-token");
  });
});

describe("password reset tokens", () => {
  it("accepts only active, unused, unexpired tokens", async () => {
    const stub = createDatabase({ email: "employee@example.com" });
    const rawToken = "A".repeat(43);
    stub.tokens.set(hashPasswordResetToken(rawToken), {
      id: "token-1",
      userId: "employee-1",
      tokenHash: hashPasswordResetToken(rawToken),
      expiresAt: new Date(now.getTime() + 1000),
      usedAt: null,
    });

    assert.equal(await isPasswordResetTokenValid(rawToken, stub.database, now), true);
    assert.equal(await isPasswordResetTokenValid("B".repeat(43), stub.database, now), false);
    assert.equal(await isPasswordResetTokenValid(rawToken, stub.database, new Date(now.getTime() + 1001)), false);
    stub.tokens.get(hashPasswordResetToken(rawToken))!.usedAt = now;
    assert.equal(await isPasswordResetTokenValid(rawToken, stub.database, now), false);
  });

  it("resets the account bound to the token, hashes the password, increments session version, audits safely, and consumes the token once", async () => {
    const stub = createDatabase({ email: "employee@example.com", sessionVersion: 8 });
    const rawToken = "C".repeat(43);
    const tokenHash = hashPasswordResetToken(rawToken);
    stub.tokens.set(tokenHash, {
      id: "token-1",
      userId: "employee-1",
      tokenHash,
      expiresAt: new Date(now.getTime() + 1000),
      usedAt: null,
    });

    await resetPasswordWithToken(rawToken, {
      newPassword: password,
      confirmPassword: password,
      userId: "another-user",
    }, stub.database, now);

    const account = stub.users.get("employee-1");
    assert.ok(account);
    assert.equal(account.sessionVersion, 9);
    assert.notEqual(account.passwordHash, password);
    assert.equal(await verifyPassword(password, account.passwordHash), true);
    assert.equal(stub.tokens.get(tokenHash)?.usedAt?.getTime(), now.getTime());
    assert.equal(stub.getTransactions(), 1);
    assert.deepEqual(stub.audits, [{ employeeId: "employee-1", actionType: "PASSWORD_RESET_COMPLETED" }]);
    assert.equal(JSON.stringify(stub.audits).includes(rawToken), false);
    await assert.rejects(resetPasswordWithToken(rawToken, { newPassword: password, confirmPassword: password }, stub.database, now), PasswordResetLinkError);
  });

  it("rejects mismatched and policy-invalid passwords without consuming a token", async () => {
    const stub = createDatabase({ email: "employee@example.com" });
    const rawToken = "D".repeat(43);
    const tokenHash = hashPasswordResetToken(rawToken);
    stub.tokens.set(tokenHash, {
      id: "token-1",
      userId: "employee-1",
      tokenHash,
      expiresAt: new Date(now.getTime() + 1000),
      usedAt: null,
    });

    for (const invalid of [
      { newPassword: password, confirmPassword: "Other-Reset-Password-2026" },
      { newPassword: "too-short", confirmPassword: "too-short" },
      { newPassword: "é".repeat(37), confirmPassword: "é".repeat(37) },
    ]) {
      await assert.rejects(resetPasswordWithToken(rawToken, invalid, stub.database, now), { name: "ZodError" });
    }

    assert.equal(stub.tokens.get(tokenHash)?.usedAt, null);
    assert.equal(stub.getTransactions(), 0);
  });

  it("rejects unknown, expired, and already-used tokens without updating a user", async () => {
    const stub = createDatabase({ email: "employee@example.com" });
    const expiredToken = "E".repeat(43);
    const usedToken = "F".repeat(43);
    stub.tokens.set(hashPasswordResetToken(expiredToken), {
      id: "expired-token",
      userId: "employee-1",
      tokenHash: hashPasswordResetToken(expiredToken),
      expiresAt: new Date(now.getTime() - 1),
      usedAt: null,
    });
    stub.tokens.set(hashPasswordResetToken(usedToken), {
      id: "used-token",
      userId: "employee-1",
      tokenHash: hashPasswordResetToken(usedToken),
      expiresAt: new Date(now.getTime() + 1000),
      usedAt: now,
    });

    for (const rawToken of ["G".repeat(43), expiredToken, usedToken]) {
      await assert.rejects(resetPasswordWithToken(rawToken, { newPassword: password, confirmPassword: password }, stub.database, now), PasswordResetLinkError);
    }
    assert.equal(stub.users.get("employee-1")?.sessionVersion, 4);
    assert.equal(stub.getTransactions(), 0);
  });
});