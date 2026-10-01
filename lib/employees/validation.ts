import { z } from "zod";
import { isIanaTimeZone } from "@/lib/attendance/timezone";
import { passwordWithinBcryptLimit } from "@/lib/auth/password";

const countryTimeZones: Record<string, string> = {
  LK: "Asia/Colombo",
  BD: "Asia/Dhaka",
};

export function isCountryCode(value: string) {
  if (!/^[A-Z]{2}$/.test(value)) return false;

  try {
    const regionName = new Intl.DisplayNames(["en"], { type: "region", fallback: "none" }).of(value);
    return regionName !== undefined && regionName !== "Unknown Region";
  } catch {
    return false;
  }
}

const employeeFields = {
  name: z.string().trim().min(1, "Name is required.").max(120),
  employeeCode: z.string().trim().min(1, "Employee code is required.").max(50),
  email: z.string().trim().email("Enter a valid email.").max(254).transform((value) => value.toLowerCase()),
  role: z.enum(["EMPLOYEE", "ADMIN"]),
  countryCode: z.string().trim().toUpperCase().refine(isCountryCode, "Enter a valid two-letter country code."),
  timeZone: z.string().trim().refine(isIanaTimeZone, "Choose a valid IANA timezone."),
};

function validateLocation(countryCode: string, timeZone: string, context: z.RefinementCtx) {
  const requiredTimeZone = countryTimeZones[countryCode];
  if (requiredTimeZone && timeZone !== requiredTimeZone) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["timeZone"],
      message: `${countryCode} employees must use ${requiredTimeZone}.`,
    });
  }
}

export const createEmployeeSchema = z.object({
  ...employeeFields,
  password: z.string().min(1, "An initial password is required.").refine(passwordWithinBcryptLimit, "Password must not exceed 72 UTF-8 bytes."),
}).superRefine(({ countryCode, timeZone }, context) => validateLocation(countryCode, timeZone, context));

export const updateEmployeeSchema = z.object({
  ...employeeFields,
  password: z.preprocess(
    (value) => value === "" ? undefined : value,
    z.string().refine(passwordWithinBcryptLimit, "Password must not exceed 72 UTF-8 bytes.").optional(),
  ),
}).superRefine(({ countryCode, timeZone }, context) => validateLocation(countryCode, timeZone, context));

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;