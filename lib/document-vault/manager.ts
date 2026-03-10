/**
 * Document Vault — document lifecycle management
 */

import prisma from '@/lib/prisma';

export const DOC_TYPES = [
  'contract', 'disclosure', 'co_broke', 'rider', 'amendment', 'other',
] as const;

export const DOC_STATUSES = [
  'uploaded', 'sent', 'viewed', 'signed', 'countersigned', 'expired',
] as const;

export const SIGNER_ROLES = [
  'buyer', 'seller', 'agent', 'broker', 'attorney',
] as const;

// REBNY required disclosures for NY
export const REQUIRED_DISCLOSURES = [
  { name: 'Agency Disclosure Form', doc_type: 'disclosure' as const },
  { name: 'Fair Housing Notice', doc_type: 'disclosure' as const },
  { name: 'Lead Paint Disclosure (pre-1978)', doc_type: 'disclosure' as const },
  { name: 'Property Condition Disclosure (PCDS)', doc_type: 'disclosure' as const },
];

export interface AddSignerInput {
  document_id: bigint;
  signer_name: string;
  signer_email: string;
  signer_role: string;
}

/**
 * Add a signer to a document.
 */
export async function addSigner(input: AddSignerInput) {
  if (!SIGNER_ROLES.includes(input.signer_role as typeof SIGNER_ROLES[number])) {
    throw new Error(`signer_role must be one of: ${SIGNER_ROLES.join(', ')}`);
  }

  return prisma.documentSignature.create({
    data: {
      document_id: input.document_id,
      signer_name: input.signer_name,
      signer_email: input.signer_email,
      signer_role: input.signer_role,
    },
  });
}

/**
 * Record a signature.
 */
export async function recordSignature(signatureId: bigint, ipAddress?: string) {
  const sig = await prisma.documentSignature.update({
    where: { id: signatureId },
    data: {
      signed_at: new Date(),
      ip_address: ipAddress ?? null,
      status: 'signed',
    },
  });

  // Check if all signatures are complete
  const doc = await prisma.document.findFirst({
    where: { signatures: { some: { id: signatureId } } },
    include: { signatures: true },
  });

  if (doc) {
    const allSigned = doc.signatures.every(s => s.status === 'signed');
    if (allSigned && doc.signatures.length > 1) {
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: 'countersigned' },
      });
    } else if (allSigned) {
      await prisma.document.update({
        where: { id: doc.id },
        data: { status: 'signed' },
      });
    }
  }

  return sig;
}

/**
 * Check deal document completeness against required disclosures.
 */
export async function checkDealCompleteness(dealId: bigint) {
  const docs = await prisma.document.findMany({
    where: { deal_id: dealId },
    select: { name: true, doc_type: true, status: true, requires_signature: true },
  });

  const missing = REQUIRED_DISCLOSURES.filter(
    req => !docs.some(d => d.doc_type === req.doc_type && d.name.includes(req.name))
  );

  const unsigned = docs.filter(d => d.requires_signature && !['signed', 'countersigned'].includes(d.status));

  return {
    total_documents: docs.length,
    missing_disclosures: missing,
    unsigned_documents: unsigned.length,
    complete: missing.length === 0 && unsigned.length === 0,
  };
}
