import { z } from "zod";
import { organizationIdSchema, organizationListQuerySchema, organizationNameSchema } from "@/lib/organization/validation";

export const shiftRecordSchema = z.object({ name: organizationNameSchema });
export const shiftIdSchema = organizationIdSchema;
export { organizationListQuerySchema as shiftListQuerySchema };
