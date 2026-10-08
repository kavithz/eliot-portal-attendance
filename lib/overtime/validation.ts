import { Prisma } from "@prisma/client";
import { z } from "zod";

const requestDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid overtime date.");

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Enter a valid time.");

const expectedHoursSchema = z.preprocess(
  (value) => {
    if (value instanceof Prisma.Decimal) return value.toString();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return value;
  },
  z.string()
    .trim()
    .regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/, "Enter expected hours to two decimal places or fewer.")
    .transform((value) => new Prisma.Decimal(value))
    .refine((value) => value.greaterThan(0), "Expected hours must be greater than zero."),
);

export const overtimeRequestInputSchema = z.object({
  date: requestDateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  reason: z.string().trim().min(1, "Enter a reason for your overtime request."),
  project: z.string().trim().min(1, "Enter the project for your overtime request."),
  expectedHours: expectedHoursSchema,
}).strict();

export const overtimeDecisionSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reason: z.preprocess(
    (value) => value === "" || value === null ? undefined : value,
    z.string().trim().max(500).optional(),
  ),
}).strict();
