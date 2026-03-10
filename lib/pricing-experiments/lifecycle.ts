/**
 * Dynamic Pricing Experiments — Lifecycle Management
 *
 * Handles experiment state transitions: draft → active → concluded → archived.
 * Validates consent requirements and enforces business rules.
 */

import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { evaluateExperiment, aggregateExperimentMetrics } from './stats';
import type { ExperimentType, ExperimentStatus } from './types';
import { EXPERIMENT_TYPES, EXPERIMENT_STATUSES } from './types';

interface CreateExperimentInput {
  name: string;
  description?: string;
  experiment_type: ExperimentType;
  target_sample_size?: number;
  control_arm: { name: string; config: Record<string, unknown> };
  treatment_arm: { name: string; config: Record<string, unknown> };
}

/**
 * Create a new experiment with control + treatment arms.
 */
export async function createExperiment(
  input: CreateExperimentInput,
  createdById: bigint
) {
  if (!EXPERIMENT_TYPES.includes(input.experiment_type)) {
    throw new Error(`Invalid experiment type: ${input.experiment_type}`);
  }

  return prisma.pricingExperiment.create({
    data: {
      name: input.name,
      description: input.description,
      experiment_type: input.experiment_type,
      target_sample_size: input.target_sample_size || 100,
      created_by_id: createdById,
      arms: {
        create: [
          {
            name: input.control_arm.name || 'Control',
            is_control: true,
            config: input.control_arm.config as Prisma.InputJsonValue,
          },
          {
            name: input.treatment_arm.name || 'Treatment',
            is_control: false,
            config: input.treatment_arm.config as Prisma.InputJsonValue,
          },
        ],
      },
    },
    include: { arms: true },
  });
}

/**
 * Activate an experiment. Validates all listings have seller consent.
 */
export async function activateExperiment(experimentId: bigint): Promise<void> {
  const experiment = await prisma.pricingExperiment.findUniqueOrThrow({
    where: { id: experimentId },
    include: {
      arms: {
        include: {
          listings: { where: { withdrawn_at: null } },
        },
      },
    },
  });

  if (experiment.status !== 'draft') {
    throw new Error(`Cannot activate experiment in "${experiment.status}" status`);
  }

  // Check all listings have consent
  const allListings = experiment.arms.flatMap(a => a.listings);
  if (allListings.length === 0) {
    throw new Error('Cannot activate: no listings assigned');
  }

  const unconsented = allListings.filter(l => !l.seller_consent);
  if (unconsented.length > 0) {
    throw new Error(
      `Cannot activate: ${unconsented.length} listing(s) missing seller consent`
    );
  }

  await prisma.pricingExperiment.update({
    where: { id: experimentId },
    data: {
      status: 'active',
      start_date: new Date(),
    },
  });
}

/**
 * Conclude an experiment. Computes final metrics and stores results.
 */
export async function concludeExperiment(experimentId: bigint) {
  const experiment = await prisma.pricingExperiment.findUniqueOrThrow({
    where: { id: experimentId },
  });

  if (experiment.status !== 'active') {
    throw new Error(`Cannot conclude experiment in "${experiment.status}" status`);
  }

  // Compute final metrics
  await aggregateExperimentMetrics(experimentId);
  const result = await evaluateExperiment(experimentId);

  await prisma.pricingExperiment.update({
    where: { id: experimentId },
    data: {
      status: 'concluded',
      end_date: new Date(),
      result_summary: result as unknown as Prisma.InputJsonValue,
    },
  });

  return result;
}

/**
 * Archive an experiment (soft delete).
 */
export async function archiveExperiment(experimentId: bigint): Promise<void> {
  await prisma.pricingExperiment.update({
    where: { id: experimentId },
    data: { status: 'archived' },
  });
}

/**
 * Withdraw a listing from an experiment.
 */
export async function withdrawListing(experimentListingId: bigint): Promise<void> {
  await prisma.experimentListing.update({
    where: { id: experimentListingId },
    data: { withdrawn_at: new Date() },
  });
}
