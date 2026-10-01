"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requirePageAdmin } from "@/lib/auth/session";
import { updateOrganizationSetting, SettingValidationError } from "@/lib/attendance/settings";

export async function saveSettingAction(formData: FormData) {
  const admin = await requirePageAdmin();
  const key = String(formData.get("key") ?? "").trim();
  const intent = String(formData.get("intent") ?? "save");
  const submittedValue = String(formData.get("value") ?? "").trim();
  try {
    await updateOrganizationSetting(admin, {
      key,
      value: submittedValue,
      intent,
      confirmReset: formData.get("confirmReset") === "yes",
    });
  } catch (error) {
    const message = error instanceof SettingValidationError ? error.message : "The setting could not be saved.";
    redirect(`/admin/settings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/admin/settings");
  revalidatePath("/settings");
  redirect("/admin/settings?success=Settings+saved");
}
