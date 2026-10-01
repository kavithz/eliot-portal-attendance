import type { AttendanceSession } from "@/lib/attendance/history";
import type { AdminAttendanceFilters } from "@/lib/attendance/admin-validation";

export type AttendanceReviewReason = Exclude<AdminAttendanceFilters["reviewReason"], "ALL">;

export function getAttendanceDataQualityReasons(
  session: Pick<AttendanceSession, "startAt" | "endAt">,
): AttendanceReviewReason[] {
  const reasons: AttendanceReviewReason[] = [];
  const startIsValid = session.startAt instanceof Date && Number.isFinite(session.startAt.getTime());

  if (!startIsValid) reasons.push("INVALID_IN_TIMESTAMP");

  if (session.endAt !== null) {
    const endIsValid = session.endAt instanceof Date && Number.isFinite(session.endAt.getTime());
    if (!endIsValid) {
      reasons.push("INVALID_OUT_TIMESTAMP");
    } else if (startIsValid) {
      const durationMs = session.endAt.getTime() - session.startAt.getTime();
      if (durationMs < 0) reasons.push("OUT_BEFORE_IN");
      else if (!Number.isSafeInteger(durationMs)) reasons.push("UNSAFE_DURATION");
    }
  }

  return reasons;
}