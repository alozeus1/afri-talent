// ─────────────────────────────────────────────────────────────────────────────
// LangGraph — apply tools (adapters over existing apply libs)
//
// Thin pass-throughs so graphs reuse the EXISTING apply state machine + caps as
// the single source of truth. No business logic is re-implemented here.
// ─────────────────────────────────────────────────────────────────────────────

import {
  validateAcknowledgements,
  REQUIRED_ACKNOWLEDGEMENTS,
  type AcknowledgementValidation,
} from "../../../apply/state-machine.js";
import { checkApplyCaps, type CapResult } from "../../../apply/caps.js";
import prisma from "../../../prisma.js";

export { REQUIRED_ACKNOWLEDGEMENTS };

/** Validate candidate acknowledgements against the exact required phrases. */
export function validateApplyAcknowledgements(given: readonly string[] | undefined | null): AcknowledgementValidation {
  return validateAcknowledgements(given);
}

/** Check per-job / per-employer apply caps using the existing implementation. */
export async function checkCaps(candidateId: string, jobId: string): Promise<CapResult> {
  return checkApplyCaps(prisma, candidateId, jobId);
}
