import { z } from "zod";
import { organizationIdSchema, organizationListQuerySchema, organizationNameSchema } from "@/lib/organization/validation";

export const shiftWeekdays = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type ShiftWeekday = (typeof shiftWeekdays)[number];

export const shiftRecordSchema = z.object({
  name: organizationNameSchema,
  workingDays: z.array(z.enum(shiftWeekdays)).max(7).default([]).refine(
    (days) => new Set(days).size === days.length,
    "Select each working day only once.",
  ),
});
export const shiftIdSchema = organizationIdSchema;
export { organizationListQuerySchema as shiftListQuerySchema };
