"use server";

import { z } from "zod";
import { changeAuthenticatedUserPassword, PasswordChangeSamePasswordError } from "@/lib/auth/change-password";
import { AuthenticationError, createSession, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export type ChangePasswordActionState =
  | { ok: true; message: string }
  | { ok: false; error: string }
  | null;

export async function changePasswordAction(
  _previousState: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  try {
    const user = await requireUser();
    await changeAuthenticatedUserPassword({ id: user.id }, {
      currentPassword: formData.get("currentPassword"),
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    }, prisma);
    await createSession(user.id);
    return { ok: true, message: "Password changed. Other active sessions have been signed out." };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { ok: false, error: "Your session has expired. Sign in again and retry." };
    }
    if (error instanceof PasswordChangeSamePasswordError) {
      return { ok: false, error: error.message };
    }
    if (error instanceof z.ZodError) {
      return { ok: false, error: error.issues[0]?.message ?? "Check the password details and try again." };
    }
    return { ok: false, error: "Password could not be changed. Check your current password and try again." };
  }
}