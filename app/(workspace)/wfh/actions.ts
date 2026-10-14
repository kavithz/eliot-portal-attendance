"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { hasPermission } from "@/lib/auth/permissions";
import { requireUser } from "@/lib/auth/session";
import {
  submitOwnWorkFromHomeRequest,
  WorkFromHomeApproverNotFoundError,
  WorkFromHomeEmployeeNotFoundError,
  WorkFromHomeRequestAccessError,
  WorkFromHomeRequestTimeError,
} from "@/lib/wfh/service";

export type WorkFromHomeRequestActionState = { error: string } | { success: string } | null;

function actionError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the WFH request details.";
  if (
    error instanceof WorkFromHomeApproverNotFoundError
    || error instanceof WorkFromHomeEmployeeNotFoundError
    || error instanceof WorkFromHomeRequestAccessError
    || error instanceof WorkFromHomeRequestTimeError
  ) return error.message;
  console.error("WFH request submission failed", error instanceof Error ? error.name : "Unknown error");
  return "Your WFH request could not be submitted. Try again shortly.";
}

export async function submitWorkFromHomeRequestAction(
  _state: WorkFromHomeRequestActionState,
  formData: FormData,
): Promise<WorkFromHomeRequestActionState> {
  const actor = await requireUser();
  if (actor.role !== "EMPLOYEE" || !hasPermission(actor.role, "wfh:submit")) {
    throw new WorkFromHomeRequestAccessError();
  }
  try {
    await submitOwnWorkFromHomeRequest(actor, {
      date: formData.get("date"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      reason: formData.get("reason"),
      workLocation: formData.get("workLocation"),
    });
    revalidatePath("/wfh");
    revalidatePath("/attendance");
    revalidatePath("/dashboard");
    revalidatePath("/approvals/wfh");
    return { success: "Your WFH request was submitted for Supervisor review." };
  } catch (error) {
    return { error: actionError(error) };
  }
}
