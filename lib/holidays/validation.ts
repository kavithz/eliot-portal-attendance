import { z } from "zod";

export const holidayTypes = ["PUBLIC", "POYA", "COMPANY", "SPECIAL", "BRANCH_SPECIFIC"] as const;

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.").refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Enter a valid date.");

const booleanValue = z.preprocess((value) => {
  if (value === "true" || value === "on") return true;
  if (value === "false" || value === "off") return false;
  return value;
}, z.boolean());

const groupValues = z.preprocess((value) => {
  if (typeof value === "string") return value.split(",").map((group) => group.trim()).filter(Boolean);
  return value;
}, z.array(z.string().trim().min(1).max(80)).max(30).default([]))
  .transform((groups) => {
    const unique = new Map<string, string>();
    for (const group of groups) {
      if (!unique.has(group.toLocaleLowerCase())) unique.set(group.toLocaleLowerCase(), group);
    }
    return [...unique.values()];
  });

export const holidayInputSchema = z.object({
  date: calendarDate,
  name: z.string().trim().min(1, "Holiday name is required.").max(120, "Holiday name must be 120 characters or fewer."),
  type: z.enum(holidayTypes),
  branch: z.preprocess((value) => typeof value === "string" ? value.trim() : value,
    z.string().max(120).default("")),
  applicableEmployeeGroups: groupValues,
  isPaid: booleanValue,
  overtimeEligible: booleanValue,
}).refine((holiday) => holiday.type !== "BRANCH_SPECIFIC" || holiday.branch.length > 0, {
  path: ["branch"],
  message: "Choose a branch for a branch-specific holiday.",
});

export const holidayListQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a valid calendar month."),
});

export type HolidayInput = z.infer<typeof holidayInputSchema>;