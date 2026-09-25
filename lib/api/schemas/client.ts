import { z } from "zod";

const validRoles = ["buyer", "renter", "seller", "landlord", "uncategorized"] as const;

/**
 * THE CANONICAL CLIENT PORTAL VOCABULARY — the only values `Lead.portal_role`
 * may take.
 *
 * `roles` beside it was already enum-constrained while `portal_role` was a bare
 * `z.string()`. That asymmetry was one link in a proven privilege escalation:
 * `portal_role` is copied verbatim into `Session.role` by every login path, and
 * the staff guards compared only that string, so a client whose portal_role read
 * "BROKER" satisfied requireBroker().
 *
 * `tenant` is included because `requirePortalRole` normalises tenant -> renter
 * and existing rows carry both spellings; excluding it would lock real clients
 * out of their own portal.
 *
 * This is deliberately NOT a second role system — it is the vocabulary `roles`
 * already uses plus that one legacy spelling. Staff roles (AGENT/BROKER) belong
 * to a different identity domain and can never appear here.
 */
export const PORTAL_ROLE_VALUES = [
  "buyer",
  "renter",
  "tenant",
  "seller",
  "landlord",
  "uncategorized",
] as const;

export type PortalRole = (typeof PORTAL_ROLE_VALUES)[number];

/** Is this a permissible client portal role? Case-sensitive by design. */
export function isPortalRole(value: unknown): value is PortalRole {
  return typeof value === "string" && (PORTAL_ROLE_VALUES as readonly string[]).includes(value);
}

export const createClientSchema = z.object({
  first_name: z.string().min(1, "first_name is required"),
  last_name: z.string().min(1, "last_name is required"),
  email: z.string().email("Invalid email format"),
  phone: z.string().min(1, "phone is required"),
  roles: z.array(z.enum(validRoles)).optional(),
  // Constrained, like `roles` above. It was a bare z.string(), which is how an
  // arbitrary value — including "BROKER" — reached Session.role.
  portal_role: z.enum(PORTAL_ROLE_VALUES).optional().nullable(),
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
