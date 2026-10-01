"use server";

import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { passwordWithinBcryptLimit, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { accountIsActive } from "@/lib/auth/account-status";

export type LoginState = { error: string } | null;

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).refine(passwordWithinBcryptLimit),
});

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const result = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.success) {
    const passwordTooLong = result.error.issues.some((issue) => issue.code === "custom" && issue.path[0] === "password");
    return { error: passwordTooLong ? "Password must not exceed 72 UTF-8 bytes." : "Enter a valid email address and password." };
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: result.data.email.toLowerCase() },
      select: { id: true, passwordHash: true, isActive: true },
    });
    if (!accountIsActive(user) || !(await verifyPassword(result.data.password, user.passwordHash))) {
      return { error: "Email or password is incorrect." };
    }

    await createSession(user.id);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("SESSION_SECRET")) {
      return { error: "Authentication is not configured. Contact your administrator." };
    }
    console.error("Login failed", error instanceof Error ? error.name : "Unknown error");
    return { error: "Sign in is temporarily unavailable. Try again shortly." };
  }

  redirect("/dashboard");
}