import { InsurancePlan } from '@/lib/types';

export interface DeductibleTracker {
  planId: string;
  individual: Map<string, number>;
  familyTotal: number;
  oopIndividual: Map<string, number>;
  oopFamily: number;
}

export function createDeductibleTracker(plan: InsurancePlan): DeductibleTracker {
  const tracker: DeductibleTracker = {
    planId: plan.id,
    individual: new Map(),
    familyTotal: 0,
    oopIndividual: new Map(),
    oopFamily: 0,
  };
  tracker.individual.set(plan.primaryHolder.name, plan.deductible.individualMet);
  tracker.oopIndividual.set(plan.primaryHolder.name, plan.outOfPocketMax.individualMet);
  for (const dep of plan.dependents) {
    tracker.individual.set(dep.name, plan.deductible.individualMet);
    tracker.oopIndividual.set(dep.name, plan.outOfPocketMax.individualMet);
  }
  tracker.familyTotal = plan.deductible.familyMet;
  tracker.oopFamily = plan.outOfPocketMax.familyMet;
  return tracker;
}

/**
 * Applies deductible to a charged amount and returns the breakdown.
 * Respects both individual and family deductible caps.
 */
export function applyDeductible(
  tracker: DeductibleTracker,
  plan: InsurancePlan,
  patientName: string,
  chargedAmount: number
): { deductibleApplied: number; remainingAfterDeductible: number; deductibleFullyMet: boolean } {
  const currentMet = tracker.individual.get(patientName) || 0;
  const indivRemaining = Math.max(0, plan.deductible.individual - currentMet);
  const famRemaining = Math.max(0, plan.deductible.family - tracker.familyTotal);
  const effectiveRemaining = Math.min(indivRemaining, famRemaining);
  const deductibleApplied = Math.min(effectiveRemaining, chargedAmount);

  tracker.individual.set(patientName, currentMet + deductibleApplied);
  tracker.familyTotal += deductibleApplied;

  return {
    deductibleApplied,
    remainingAfterDeductible: chargedAmount - deductibleApplied,
    deductibleFullyMet: currentMet + deductibleApplied >= plan.deductible.individual,
  };
}

/**
 * Enforces OOP-max: caps the patient's responsibility so it never exceeds
 * the individual or family out-of-pocket maximum.
 * Returns the adjusted patient responsibility and any excess that should be
 * covered by the plan.
 */
export function enforceOOPMax(
  tracker: DeductibleTracker,
  plan: InsurancePlan,
  patientName: string,
  patientResponsibility: number
): { adjustedPatientResponsibility: number; oopMaxAdjustment: number; oopMaxReached: boolean } {
  const currentOOP = tracker.oopIndividual.get(patientName) || 0;
  const indivRemaining = Math.max(0, plan.outOfPocketMax.individual - currentOOP);
  const famRemaining = Math.max(0, plan.outOfPocketMax.family - tracker.oopFamily);
  const effectiveRemaining = Math.min(indivRemaining, famRemaining);

  const adjustedPatientResponsibility = Math.min(patientResponsibility, effectiveRemaining);
  const oopMaxAdjustment = patientResponsibility - adjustedPatientResponsibility;

  tracker.oopIndividual.set(patientName, currentOOP + adjustedPatientResponsibility);
  tracker.oopFamily += adjustedPatientResponsibility;

  return {
    adjustedPatientResponsibility,
    oopMaxAdjustment,
    oopMaxReached: currentOOP + adjustedPatientResponsibility >= plan.outOfPocketMax.individual,
  };
}
