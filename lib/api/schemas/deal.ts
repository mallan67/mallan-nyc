import { z } from "zod";

export const createDealSchema = z.object({
  representation_code: z.enum(["buyer", "tenant"]).optional(),
  property_address: z.string().optional(),
  price_usd: z.coerce.number().positive().optional(),
  commission_rate_percent: z.coerce.number().min(0).max(100).optional(),
  split_percent: z.coerce.number().min(0).max(100).optional(),
  agent_fee_usd: z.coerce.number().min(0).optional(),
  company_fee_usd: z.coerce.number().min(0).optional(),
  gross_commission_usd: z.coerce.number().min(0).optional(),
  contract_signed: z.string().datetime().optional().nullable(),
});

export const updateDealSchema = createDealSchema.partial();

export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
