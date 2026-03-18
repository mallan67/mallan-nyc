import { z } from "zod";

const validRoles = ["buyer", "renter", "seller", "landlord", "uncategorized"] as const;

export const createClientSchema = z.object({
  first_name: z.string().min(1, "first_name is required"),
  last_name: z.string().min(1, "last_name is required"),
  email: z.string().email("Invalid email format"),
  phone: z.string().min(1, "phone is required"),
  roles: z.array(z.enum(validRoles)).optional(),
  portal_role: z.string().optional().nullable(),
  source: z.string().optional(),

  // Secondary person
  secondary_first_name: z.string().optional().nullable(),
  secondary_last_name: z.string().optional().nullable(),
  secondary_email: z.string().optional().nullable(),
  secondary_phone: z.string().optional().nullable(),
  secondary_relationship: z.string().optional().nullable(),

  // Addresses
  property_address: z.string().optional().nullable(),
  home_address: z.string().optional().nullable(),
  unit_number: z.string().optional().nullable(),
  legal_ownership_name: z.string().optional().nullable(),
});

export const updateClientSchema = createClientSchema.partial();

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
