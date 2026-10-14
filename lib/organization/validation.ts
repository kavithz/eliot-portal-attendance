import { z } from "zod";

export const organizationNameSchema = z.string().trim().min(1, "Name is required.").max(120);
export const organizationRecordSchema = z.object({ name: organizationNameSchema });

export const organizationListQuerySchema = z.object({
  query: z.string().trim().default(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(20),
});

export const organizationIdSchema = z.preprocess(
  (value) => value === "" || value === null ? null : value,
  z.string().min(1).nullable().optional(),
);

export const organizationAssignmentsSchema = {
  departmentId: organizationIdSchema,
  designationId: organizationIdSchema,
};
