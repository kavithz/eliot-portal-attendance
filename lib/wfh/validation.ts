import { z } from "zod";

const requestDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid WFH date.");

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time.");

export const workFromHomeRequestInputSchema = z.object({
  date: requestDateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  reason: z.string().trim().min(1, "Enter a reason for your WFH request.").max(2000),
  workLocation: z.string().trim().min(1, "Enter your work location.").max(500),
}).strict();

export const workFromHomeDecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    z.string().trim().max(500).optional(),
  ),
}).strict();
