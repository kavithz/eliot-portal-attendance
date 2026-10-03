import "server-only";

import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { hashPassword, passwordWithinBcryptLimit, verifyPassword } from "@/lib/auth/password";

const newPasswordFields = {
  newPassword: z.string()
    .min(12, "New password must be at least 12 characters.")
    .refine(passwordWithinBcryptLimit, "New password must not exceed 72 UTF-8 bytes."),
  confirmPassword: z.string()
    .min(1, "Confirm your new password.")
    .refine(passwordWithinBcryptLimit, "Password must not exceed 72 UTF-8 bytes."),
};

function validatePasswordConfirmation(
  { newPassword, confirmPassword }: { newPassword: string; confirmPassword: string },
  context: z.RefinementCtx,
) {
  if (newPassword !== confirmPassword) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: "New password and confirmation do not match.",
    });
  }
}

export const newPasswordConfirmationSchema = z.object(newPasswordFields).superRefine(validatePasswordConfirmation);
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  ...newPasswordFields,
}).superRefine(validatePasswordConfirmation);

type PasswordChangeDatabase = Pick<PrismaClient, "user">;
type PasswordChangeActor = { id: string } | null;

export class PasswordChangeAuthenticationError extends Error {
  constructor() {
    super("Please sign in again before changing your password.");
    this.name = "PasswordChangeAuthenticationError";
  }
}

export class PasswordChangeUnavailableError extends Error {
  constructor() {
    super("Password could not be changed. Check your current password and try again.");
    this.name = "PasswordChangeUnavailableError";
  }
}

export class PasswordChangeCurrentPasswordError extends Error {
  constructor() {
    super("Password could not be changed. Check your current password and try again.");
    this.name = "PasswordChangeCurrentPasswordError";
  }
}

export class PasswordChangeSamePasswordError extends Error {
  constructor() {
    super("Choose a new password that differs from your current password.");
    this.name = "PasswordChangeSamePasswordError";
  }
}

export async function changeAuthenticatedUserPassword(
  actor: PasswordChangeActor,
  input: unknown,
  database: PasswordChangeDatabase,
) {
  if (!actor) throw new PasswordChangeAuthenticationError();

  const parsed = changePasswordSchema.parse(input);
  const user = await database.user.findUnique({
    where: { id: actor.id },
    select: { id: true, isActive: true, passwordHash: true, sessionVersion: true },
  });

  if (!user || !user.isActive) throw new PasswordChangeUnavailableError();
  if (!(await verifyPassword(parsed.currentPassword, user.passwordHash))) {
    throw new PasswordChangeCurrentPasswordError();
  }
  if (parsed.newPassword === parsed.currentPassword) throw new PasswordChangeSamePasswordError();

  const passwordHash = await hashPassword(parsed.newPassword);
  const result = await database.user.updateMany({
    where: { id: user.id, isActive: true, sessionVersion: user.sessionVersion },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  if (result.count !== 1) throw new PasswordChangeUnavailableError();

  return { sessionVersion: user.sessionVersion + 1 };
}