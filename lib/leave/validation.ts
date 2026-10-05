import { z } from "zod";

export const leaveTypeNameSchema = z.string().trim().min(1, "Name is required.").max(120);
export const leaveTypeRecordSchema = z.object({ name: leaveTypeNameSchema });

export const leaveTypeListQuerySchema = z.object({
  query: z.string().trim().default(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(50).catch(20),
});
