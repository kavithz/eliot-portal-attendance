import { z } from "zod";

export const attendanceActionSchema = z.enum(["IN", "OUT", "WFH_IN", "WFH_OUT"]);
export type AttendanceAction = z.infer<typeof attendanceActionSchema>;