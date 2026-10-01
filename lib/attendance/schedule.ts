import { fromZonedTime } from "date-fns-tz";
import { getEmployeeLocalDayWindow } from "./timezone";

export const WORKING_TIME = {
  start: "08:30",
  end: "17:30",
} as const;

export type AttendancePunch = "IN" | "OUT" | "WFH_IN" | "WFH_OUT";
export type WorkTimeClassification = "EARLY_ARRIVAL" | "ON_TIME" | "LATE" | "EARLY_DEPARTURE" | "NORMAL";
export type WorkSessionTiming = {
  arrival: WorkTimeClassification;
  departure: WorkTimeClassification | null;
};

export function classifyAttendancePunch(
  punch: AttendancePunch,
  actualAt: Date,
  timeZone: string,
): WorkTimeClassification {
  const isCheckIn = punch === "IN" || punch === "WFH_IN";
  const { date } = getEmployeeLocalDayWindow(actualAt, timeZone);
  const boundaryTime = isCheckIn ? WORKING_TIME.start : WORKING_TIME.end;
  const boundary = fromZonedTime(`${date}T${boundaryTime}:00.000`, timeZone);

  if (isCheckIn) {
    if (actualAt < boundary) return "EARLY_ARRIVAL";
    if (actualAt > boundary) return "LATE";
    return "ON_TIME";
  }

  return actualAt < boundary ? "EARLY_DEPARTURE" : "NORMAL";
}

export function classifyWorkSession(
  session: { mode: "OFFICE" | "WFH"; startAt: Date; endAt: Date | null },
  timeZone: string,
): WorkSessionTiming {
  const checkIn = session.mode === "WFH" ? "WFH_IN" : "IN";
  const checkOut = session.mode === "WFH" ? "WFH_OUT" : "OUT";

  return {
    arrival: classifyAttendancePunch(checkIn, session.startAt, timeZone),
    departure: session.endAt ? classifyAttendancePunch(checkOut, session.endAt, timeZone) : null,
  };
}