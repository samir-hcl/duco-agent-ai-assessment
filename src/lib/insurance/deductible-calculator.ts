import { InsurancePlan } from '@/lib/types';

export interface DeductibleTracker {
  planId: string;
  individual: Map<string, number>;
  familyTotal: number;
}

export function createDeductibleTracker(plan: InsurancePlan): DeductibleTracker {
  const tracker: DeductibleTracker = { planId: plan.id, individual: new Map(), familyTotal: 0 };
  tracker.individual.set(plan.primaryHolder.name, plan.deductible.individualMet);
  for (const dep of plan.dependents) {
    tracker.individual.set(dep.name, plan.deductible.individualMet);
  }
  tracker.familyTotal = plan.deductible.familyMet;
  return tracker;
}

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
