"use server";

import { headers } from "next/headers";
import { forgotPasswordMessage, forgotPasswordSchema, requestPasswordReset } from "@/lib/auth/password-reset";

export type ForgotPasswordActionState = { message: string } | { error: string } | null;

function requestIpAddress(headerValues: Headers) {
  const forwarded = headerValues.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headerValues.get("x-real-ip")?.trim() || "unknown-client";
}

export async function forgotPasswordAction(
  _previousState: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a valid email address." };

  try {
    await requestPasswordReset(parsed.data, requestIpAddress(await headers()));
  } catch {
    return { message: forgotPasswordMessage };
  }

  return { message: forgotPasswordMessage };
}