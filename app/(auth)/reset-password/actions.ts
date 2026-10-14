"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { PasswordResetLinkError, resetPasswordWithToken } from "@/lib/auth/password-reset";
import { prisma } from "@/lib/prisma";

export type ResetPasswordActionState = { error: string } | null;

export async function resetPasswordAction(
  _previousState: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  try {
    await resetPasswordWithToken(formData.get("token"), {
      newPassword: formData.get("newPassword"),
      confirmPassword: formData.get("confirmPassword"),
    }, prisma);
  } catch (error) {
    if (error instanceof z.ZodError) return { error: error.issues[0]?.message ?? "Check the password details and try again." };
    if (error instanceof PasswordResetLinkError) return { error: error.message };
    return { error: "Password reset could not be completed. Request a new reset link and try again." };
  }

  redirect("/login?passwordReset=success");
}