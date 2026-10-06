import { fromZonedTime } from "date-fns-tz";
import type { AttendancePunchType } from "@prisma/client";
import { getEmployeeLocalDayWindow } from "./timezone";

export type RawAttendancePunch = {
  id: string;
  timestamp: Date;
  punchType: AttendancePunchType;
};

export type AttendanceEngineShift = {
  id: string;
  startTime: Date | null;
  endTime: Date | null;
  gracePeriodMinutes: number | null;
  lateThresholdMinutes: number | null;
  earlyDepartureThresholdMinutes: number | null;
  breakDurationMinutes: number | null;
  minimumWorkingHours: number | string | null;
  overtimeEligible: boolean | null;
  roundingRules: unknown;
  workingDays?: readonly string[];
};

export type AttendanceEngineResult = {
  employeeId: string;
  date: string;
  shiftId: string;
  firstIn: Date | null;
  lastOut: Date | null;
  workingHours: number | null;
  lateMinutes: number | null;
  earlyMinutes: number | null;
  status: "PRESENT" | "LATE" | "EARLY_OUT" | "MISSING_PUNCH" | "WEEKEND" | "UNDETERMINED";
  statusReasons: string[];
  workPeriods: Array<{ startAt: Date; endAt: Date; durationMs: number }>;
  breakPeriods: Array<{ startAt: Date; endAt: Date; durationMs: number }>;
  punchIssues: Array<"MISSING_IN" | "MISSING_OUT" | "DUPLICATE_PUNCH" | "UNUSUAL_SEQUENCE">;
};

export class AttendanceEngineConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AttendanceEngineConfigurationError";
  }
}

function validInstant(value: Date) {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function timeOfDay(value: Date) {
  if (!validInstant(value)) throw new AttendanceEngineConfigurationError("Shift start and end times must be valid.");
  return value.toISOString().slice(11, 19);
}

function minutesDifference(durationMs: number) {
  if (durationMs % 60_000 !== 0) return null;
  return durationMs / 60_000;
}

export function attendanceDailyWorkingHoursForStorage(workingHours: number | null) {
  return workingHours !== null && Number.isInteger(workingHours * 100) ? workingHours : null;
}

export function calculateDailyAttendance(input: {
  employeeId: string;
  date: string;
  timeZone: string;
  shift: AttendanceEngineShift;
  punches: readonly RawAttendancePunch[];
}): AttendanceEngineResult {
  const { employeeId, date, timeZone, shift } = input;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new AttendanceEngineConfigurationError("Attendance date must be a valid YYYY-MM-DD calendar date.");
  }
  const weekdayNames = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
  const weekday = weekdayNames[parsedDate.getUTCDay()];
  const isScheduledWorkingDay = shift.workingDays?.length ? shift.workingDays.includes(weekday) : null;
  if (
    (shift.gracePeriodMinutes !== null && (!Number.isSafeInteger(shift.gracePeriodMinutes) || shift.gracePeriodMinutes < 0))
    || (shift.lateThresholdMinutes !== null && (!Number.isSafeInteger(shift.lateThresholdMinutes) || shift.lateThresholdMinutes < 0))
    || (shift.earlyDepartureThresholdMinutes !== null && (!Number.isSafeInteger(shift.earlyDepartureThresholdMinutes) || shift.earlyDepartureThresholdMinutes < 0))
  ) {
    throw new AttendanceEngineConfigurationError("Shift attendance thresholds must be non-negative whole minutes.");
  }

  const localDay = getEmployeeLocalDayWindow(fromZonedTime(`${date}T12:00:00.000`, timeZone), timeZone);
  const startTime = shift.startTime ? timeOfDay(shift.startTime) : null;
  const endTime = shift.endTime ? timeOfDay(shift.endTime) : null;
  const overnightShift = startTime !== null && endTime !== null && endTime <= startTime;
  if (overnightShift) {
    throw new AttendanceEngineConfigurationError(
      "The SRS does not define overnight Shift calculation; this Shift cannot be calculated safely.",
    );
  }

  const punches = input.punches
    .filter((punch) => validInstant(punch.timestamp)
      && punch.timestamp >= localDay.startAt
      && punch.timestamp < localDay.endAt)
    .slice()
    .sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime() || left.id.localeCompare(right.id));

  const punchIssues = new Set<AttendanceEngineResult["punchIssues"][number]>();
  const statusReasons = new Set<string>();
  const uniquePunches: RawAttendancePunch[] = [];
  for (const punch of punches) {
    const previous = uniquePunches.at(-1);
    if (previous && previous.punchType === punch.punchType) {
      if (previous.timestamp.getTime() === punch.timestamp.getTime()) {
        punchIssues.add("DUPLICATE_PUNCH");
        statusReasons.add("Duplicate raw punch; punch interpretation is unresolved.");
      } else {
        punchIssues.add("UNUSUAL_SEQUENCE");
        statusReasons.add("Repeated punch direction; punch interpretation is unresolved.");
      }
    }
    uniquePunches.push(punch);
  }

  const workPeriods: AttendanceEngineResult["workPeriods"] = [];
  const breakPeriods: AttendanceEngineResult["breakPeriods"] = [];
  let openIn: RawAttendancePunch | null = null;
  for (const punch of uniquePunches) {
    if (punch.punchType === "IN") {
      if (openIn) {
        punchIssues.add("UNUSUAL_SEQUENCE");
        statusReasons.add("Repeated IN before OUT; punch pairing is unresolved.");
      } else {
        openIn = punch;
      }
      continue;
    }

    if (!openIn) {
      punchIssues.add("MISSING_IN");
      statusReasons.add("OUT has no preceding IN.");
      continue;
    }

    const durationMs = punch.timestamp.getTime() - openIn.timestamp.getTime();
    workPeriods.push({ startAt: openIn.timestamp, endAt: punch.timestamp, durationMs });
    if (workPeriods.length > 1) {
      const previousPeriod = workPeriods.at(-2)!;
      breakPeriods.push({
        startAt: previousPeriod.endAt,
        endAt: openIn.timestamp,
        durationMs: openIn.timestamp.getTime() - previousPeriod.endAt.getTime(),
      });
    }
    openIn = null;
  }

  if (openIn) {
    punchIssues.add("MISSING_OUT");
    statusReasons.add("IN has no following OUT.");
  }

  const firstIn = uniquePunches.find((punch) => punch.punchType === "IN")?.timestamp ?? null;
  const lastOut = [...uniquePunches].reverse().find((punch) => punch.punchType === "OUT")?.timestamp ?? null;
  const hasUnresolvedSequence = [...punchIssues].some((issue) => issue === "DUPLICATE_PUNCH" || issue === "UNUSUAL_SEQUENCE");
  const totalWorkingMs = hasUnresolvedSequence ? null : workPeriods.reduce((total, period) => total + period.durationMs, 0);
  const workingHours = totalWorkingMs === null ? null : totalWorkingMs / 3_600_000;

  const scheduledStart = startTime ? fromZonedTime(`${date}T${startTime}`, timeZone) : null;
  const scheduledEnd = endTime ? fromZonedTime(`${date}T${endTime}`, timeZone) : null;
  const lateAfterGrace = firstIn && scheduledStart && shift.gracePeriodMinutes !== null
    ? firstIn.getTime() - scheduledStart.getTime() - shift.gracePeriodMinutes * 60_000
    : null;
  const earlyDuration = lastOut && scheduledEnd ? scheduledEnd.getTime() - lastOut.getTime() : null;
  const lateMinutes = lateAfterGrace === null
    ? null
    : lateAfterGrace > 0 ? minutesDifference(lateAfterGrace) : 0;
  const earlyMinutes = earlyDuration === null
    ? null
    : earlyDuration > 0 ? minutesDifference(earlyDuration) : 0;

  if (lateAfterGrace !== null && lateMinutes === null) {
    statusReasons.add("Late duration is below whole-minute precision and cannot be stored without rounding.");
  }
  if (earlyDuration !== null && earlyMinutes === null) {
    statusReasons.add("Early duration is below whole-minute precision and cannot be stored without rounding.");
  }
  if (totalWorkingMs !== null && (totalWorkingMs * 100) % 3_600_000 !== 0) {
    statusReasons.add("Working hours exceed the Phase A two-decimal storage precision; no rounding was applied.");
  }
  if (!shift.startTime) statusReasons.add("Shift start time is not configured; arrival status is unresolved.");
  if (shift.gracePeriodMinutes === null) statusReasons.add("Grace period is not configured; arrival status is unresolved.");
  if (!shift.endTime) statusReasons.add("Shift end time is not configured; departure status is unresolved.");
  if (shift.minimumWorkingHours === null) statusReasons.add("Minimum working hours are not configured; a normal day cannot be distinguished from a Half Day.");
  statusReasons.add("The SRS does not define how late and early-departure thresholds affect status; configured grace and shift end determine Late and Early Out.");
  statusReasons.add("The SRS does not define the rounding algorithm; no rounding has been applied.");
  if (workPeriods.length === 0 && uniquePunches.length === 0) {
    statusReasons.add(isScheduledWorkingDay === false
      ? "No raw punches exist on a configured non-working day."
      : "No raw punches exist for this employee-local date; absence cannot be distinguished from leave, WFH, holiday, or a non-working day.");
  }
  if (hasUnresolvedSequence) statusReasons.add("Punch sequence is unusual; work-period calculation is unresolved.");

  const incomplete = punchIssues.has("MISSING_IN") || punchIssues.has("MISSING_OUT");
  let status: AttendanceEngineResult["status"] = "UNDETERMINED";
  if (incomplete) {
    status = "MISSING_PUNCH";
  } else if (hasUnresolvedSequence) {
    statusReasons.add("Punch sequence is unusual; a daily status cannot be assigned safely.");
  } else if (uniquePunches.length === 0 && isScheduledWorkingDay === false) {
    status = "WEEKEND";
  } else if (uniquePunches.length > 0 && isScheduledWorkingDay === false) {
    statusReasons.add("Punches exist on a configured non-working day; the SRS does not define status or overtime treatment.");
  } else if (workPeriods.length === 0) {
    statusReasons.add("No complete work period exists; a daily status cannot be assigned safely.");
  } else if (lateMinutes === null || earlyMinutes === null) {
    statusReasons.add("Shift timing configuration is incomplete; a daily status cannot be assigned safely.");
  } else {
    const belowMinimumHours = shift.minimumWorkingHours !== null
      && workingHours !== null
      && workingHours < Number(shift.minimumWorkingHours);
    if (belowMinimumHours) {
      statusReasons.add("Worked hours are below the configured minimum; approval is unavailable to distinguish a Half Day.");
    } else if (lateMinutes > 0 && earlyMinutes > 0) {
      statusReasons.add("The SRS does not define precedence when both Late and Early Out apply.");
    } else if (lateMinutes > 0) {
      status = "LATE";
    } else if (earlyMinutes > 0) {
      status = "EARLY_OUT";
    } else if (shift.minimumWorkingHours === null) {
      statusReasons.add("Minimum working hours are unset; status cannot be distinguished from a Half Day.");
    } else if (workingHours === null) {
      statusReasons.add("Working hours are unresolved; a daily status cannot be assigned safely.");
    } else {
      status = "PRESENT";
    }
  }

  return {
    employeeId,
    date,
    shiftId: shift.id,
    firstIn,
    lastOut,
    workingHours,
    lateMinutes,
    earlyMinutes,
    status,
    statusReasons: [...statusReasons],
    workPeriods,
    breakPeriods,
    punchIssues: [...punchIssues],
  };
}
