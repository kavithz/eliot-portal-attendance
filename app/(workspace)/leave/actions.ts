"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  LeaveRequestAttachmentNotFoundError,
  LeaveRequestEmployeeNotFoundError,
  LeaveRequestLeaveTypeNotFoundError,
  submitOwnLeaveRequest,
} from "@/lib/leave/request-service";

export type LeaveRequestActionState = { error: string } | null;

function actionError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? "Check the Leave request details.";
  if (
    error instanceof LeaveRequestAttachmentNotFoundError
    || error instanceof LeaveRequestEmployeeNotFoundError
    || error instanceof LeaveRequestLeaveTypeNotFoundError
  ) return error.message;
  console.error("Leave request submission failed", error instanceof Error ? error.name : "Unknown error");
  return "Your Leave request could not be submitted. Try again shortly.";
}

export async function submitLeaveRequestAction(
  _state: LeaveRequestActionState,
  formData: FormData,
): Promise<LeaveRequestActionState> {
  const actor = await requireUser();
  try {
    await submitOwnLeaveRequest(actor, {
      leaveTypeId: formData.get("leaveTypeId"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      reason: formData.get("reason"),
      attachmentDocumentId: formData.get("attachmentDocumentId"),
    });
  } catch (error) {
    return { error: actionError(error) };
  }

  revalidatePath("/leave");
  redirect("/leave?success=request-submitted");
}
