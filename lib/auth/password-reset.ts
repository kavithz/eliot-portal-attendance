import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { newPasswordConfirmationSchema } from "@/lib/auth/change-password";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/auth/password-reset-email";

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(254).transform((email) => email.toLowerCase()),
});

export const resetPasswordSchema = newPasswordConfirmationSchema;
export const forgotPasswordMessage = "If an account with that email exists, you will receive instructions to reset your password.";
export const passwordResetTokenMessage = "This reset link is invalid or expired. Request a new one.";

const tokenLifetimeMs = 30 * 60 * 1000;
const rateWindowMs = 60 * 60 * 1000;
const rateBucketRetentionMs = 24 * rateWindowMs;
const emailRequestLimit = 3;
const ipRequestLimit = 20;

type PasswordResetTransaction = Prisma.TransactionClient;
export type PasswordResetDatabase = Pick<PrismaClient,
  "user" | "passwordResetToken" | "passwordResetRateLimit" | "attendanceAuditLog" | "$transaction"
>;
type ResetEmailSender = (input: { email: string; name: string; token: string }) => Promise<void>;

export class PasswordResetLinkError extends Error {
  constructor() {
    super(passwordResetTokenMessage);
    this.name = "PasswordResetLinkError";
  }
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function hashRateKey(secret: string, kind: "email" | "ip", value: string) {
  return createHmac("sha256", secret).update(`${kind}:${value}`).digest("hex");
}

function rateWindowStart(now: Date) {
  return new Date(Math.floor(now.getTime() / rateWindowMs) * rateWindowMs);
}

async function consumeRateBuckets(
  database: PasswordResetDatabase,
  email: string,
  ipAddress: string,
  secret: string,
  now: Date,
) {
  const windowStart = rateWindowStart(now);
  await database.passwordResetRateLimit.deleteMany({
    where: { windowStart: { lt: new Date(now.getTime() - rateBucketRetentionMs) } },
  });
  await database.passwordResetToken.deleteMany({ where: { expiresAt: { lt: now } } });

  const [emailBucket, ipBucket] = await Promise.all([
    database.passwordResetRateLimit.upsert({
      where: { keyHash_windowStart: { keyHash: hashRateKey(secret, "email", email), windowStart } },
      create: { keyHash: hashRateKey(secret, "email", email), windowStart, requestCount: 1 },
      update: { requestCount: { increment: 1 } },
      select: { requestCount: true },
    }),
    database.passwordResetRateLimit.upsert({
      where: { keyHash_windowStart: { keyHash: hashRateKey(secret, "ip", ipAddress), windowStart } },
      create: { keyHash: hashRateKey(secret, "ip", ipAddress), windowStart, requestCount: 1 },
      update: { requestCount: { increment: 1 } },
      select: { requestCount: true },
    }),
  ]);

  return emailBucket.requestCount <= emailRequestLimit && ipBucket.requestCount <= ipRequestLimit;
}

function requireThrottleSecret(secret = process.env.SESSION_SECRET) {
  if (!secret || secret.length < 32) throw new Error("Password reset throttling is not configured.");
  return secret;
}

export async function requestPasswordReset(
  input: unknown,
  ipAddress: string,
  options: {
    database?: PasswordResetDatabase;
    sendEmail?: ResetEmailSender;
    now?: Date;
    throttleSecret?: string;
    minimumResponseMs?: number;
  } = {},
) {
  const startedAt = Date.now();
  const database = options.database ?? prisma;
  const now = options.now ?? new Date();
  const parsed = forgotPasswordSchema.parse(input);
  const secret = requireThrottleSecret(options.throttleSecret);

  try {
    const withinLimit = await consumeRateBuckets(database, parsed.email, ipAddress || "unknown-client", secret, now);
    if (!withinLimit) return;

    const user = await database.user.findUnique({
      where: { email: parsed.email },
      select: { id: true, email: true, name: true, isActive: true },
    });
    const token = randomBytes(32).toString("base64url");
    if (!user?.isActive) return;

    const tokenHash = hashPasswordResetToken(token);
    await database.$transaction(async (transaction) => {
      await transaction.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt: new Date(now.getTime() + tokenLifetimeMs) },
        select: { id: true },
      });
      await transaction.attendanceAuditLog.create({
        data: { employeeId: user.id, actionType: "PASSWORD_RESET_REQUESTED" },
        select: { id: true },
      });
    });

    const sendEmail = options.sendEmail ?? sendPasswordResetEmail;
    try {
      await sendEmail({ email: user.email, name: user.name, token });
    } catch {
      await database.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null },
        data: { usedAt: now },
      });
    }
  } finally {
    const minimumDuration = options.minimumResponseMs ?? 500;
    const remaining = minimumDuration - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}

async function findUsableToken(token: unknown, database: PasswordResetDatabase, now: Date) {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) return null;

  const resetToken = await database.passwordResetToken.findUnique({
    where: { tokenHash: hashPasswordResetToken(token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { isActive: true } },
    },
  });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= now || !resetToken.user.isActive) return null;
  return resetToken;
}

export async function isPasswordResetTokenValid(token: unknown, database: PasswordResetDatabase = prisma, now = new Date()) {
  return (await findUsableToken(token, database, now)) !== null;
}

export async function resetPasswordWithToken(
  token: unknown,
  input: unknown,
  database: PasswordResetDatabase = prisma,
  now = new Date(),
) {
  if (typeof token !== "string" || token.length < 32 || token.length > 256) throw new PasswordResetLinkError();
  const parsed = resetPasswordSchema.parse(input);
  const resetToken = await findUsableToken(token, database, now);
  if (!resetToken) throw new PasswordResetLinkError();

  const passwordHash = await hashPassword(parsed.newPassword);
  await database.$transaction(async (transaction) => {
    await consumeTokenAndUpdatePassword(transaction, resetToken.id, resetToken.userId, passwordHash, now);
  });
}

async function consumeTokenAndUpdatePassword(
  transaction: PasswordResetTransaction,
  tokenId: string,
  userId: string,
  passwordHash: string,
  now: Date,
) {
  const consumed = await transaction.passwordResetToken.updateMany({
    where: { id: tokenId, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (consumed.count !== 1) throw new PasswordResetLinkError();

  const updated = await transaction.user.updateMany({
    where: { id: userId, isActive: true },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  if (updated.count !== 1) throw new PasswordResetLinkError();

  await transaction.attendanceAuditLog.create({
    data: { employeeId: userId, actionType: "PASSWORD_RESET_COMPLETED" },
    select: { id: true },
  });
}
