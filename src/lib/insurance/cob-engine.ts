import {
  ParsedClaim, InsurancePlan, COBResult, COBDetermination, ClaimCalculation,
  CostFlowData, CostFlowNode, CostFlowLink,
} from '@/lib/types';
import { PLAN_A, PLAN_B } from './mock-plans';
import { createDeductibleTracker, applyDeductible, enforceOOPMax, DeductibleTracker } from './deductible-calculator';

/**
 * Data-driven Subscriber Rule: checks if the patient appears as the primaryHolder
 * on each plan. The plan where they are the subscriber is primary.
 * Falls back to Birthday Rule if subscriber status is identical on both plans.
 */
export function determinePrimaryPlan(
  patientName: string,
  planA: InsurancePlan = PLAN_A,
  planB: InsurancePlan = PLAN_B
): COBDetermination {
  const name = patientName.toLowerCase().trim();

  const isSubscriberOnA = planA.primaryHolder.name.toLowerCase().trim() === name;
  const isSubscriberOnB = planB.primaryHolder.name.toLowerCase().trim() === name;
  const isDependentOnA = planA.dependents.some(d => d.name.toLowerCase().trim() === name);
  const isDependentOnB = planB.dependents.some(d => d.name.toLowerCase().trim() === name);

  // Subscriber Rule: the plan where you are the policyholder is primary
  if (isSubscriberOnB && isDependentOnA) {
    return {
      patient: patientName,
      primaryPlan: 'PLAN_B',
      secondaryPlan: 'PLAN_A',
      rule: 'SUBSCRIBER_RULE',
      reasoning: `${patientName} is the primary policyholder (subscriber) on ${planB.name} (${planB.insurerName}) and listed as a dependent on ${planA.name} (${planA.insurerName}). Per the Subscriber Rule, ${planB.name} is primary.`,
    };
  }
  if (isSubscriberOnA && isDependentOnB) {
    return {
      patient: patientName,
      primaryPlan: 'PLAN_A',
      secondaryPlan: 'PLAN_B',
      rule: 'SUBSCRIBER_RULE',
      reasoning: `${patientName} is the primary policyholder (subscriber) on ${planA.name} (${planA.insurerName}) and listed as a dependent on ${planB.name} (${planB.insurerName}). Per the Subscriber Rule, ${planA.name} is primary.`,
    };
  }

  // Birthday Rule fallback: plan of the parent whose birthday falls earlier in the calendar year is primary
  const dobA = new Date(planA.primaryHolder.dateOfBirth);
  const dobB = new Date(planB.primaryHolder.dateOfBirth);
  const monthDayA = dobA.getMonth() * 100 + dobA.getDate();
  const monthDayB = dobB.getMonth() * 100 + dobB.getDate();

  if (monthDayA <= monthDayB) {
    return {
      patient: patientName,
      primaryPlan: 'PLAN_A',
      secondaryPlan: 'PLAN_B',
      rule: 'BIRTHDAY_RULE',
      reasoning: `Subscriber Rule could not determine order. Applying Birthday Rule: ${planA.primaryHolder.name}'s birthday (${planA.primaryHolder.dateOfBirth}) falls earlier in the calendar year than ${planB.primaryHolder.name}'s (${planB.primaryHolder.dateOfBirth}), making ${planA.name} primary.`,
    };
  }
  return {
    patient: patientName,
    primaryPlan: 'PLAN_B',
    secondaryPlan: 'PLAN_A',
    rule: 'BIRTHDAY_RULE',
    reasoning: `Subscriber Rule could not determine order. Applying Birthday Rule: ${planB.primaryHolder.name}'s birthday (${planB.primaryHolder.dateOfBirth}) falls earlier in the calendar year than ${planA.primaryHolder.name}'s (${planA.primaryHolder.dateOfBirth}), making ${planB.name} primary.`,
  };
}

function getPlan(d: string): InsurancePlan { return d === 'PLAN_A' ? PLAN_A : PLAN_B; }

/**
 * Calculates claim payments with:
 * 1. Primary deductible application
 * 2. Primary coinsurance split
 * 3. Primary OOP-max enforcement
 * 4. Secondary deductible on patient's remaining responsibility
 * 5. Secondary coinsurance split
 * 6. Secondary OOP-max enforcement
 */
export function calculateClaim(
  claim: ParsedClaim,
  determination: COBDetermination,
  primaryTracker: DeductibleTracker,
  secondaryTracker: DeductibleTracker
): ClaimCalculation {
  const primaryPlan = getPlan(determination.primaryPlan);
  const secondaryPlan = getPlan(determination.secondaryPlan);
  const total = claim.totalCharges;

  // === PRIMARY PLAN ===
  const pd = applyDeductible(primaryTracker, primaryPlan, claim.patientName, total);
  const pEligible = pd.remainingAfterDeductible;
  const pRate = primaryPlan.coinsurance.inNetwork / 100;
  const pPaysBeforeOOP = Math.round(pEligible * pRate);
  const pPatientShareBeforeOOP = pd.deductibleApplied + (pEligible - pPaysBeforeOOP);

  // Enforce OOP max on primary
  const pOOP = enforceOOPMax(primaryTracker, primaryPlan, claim.patientName, pPatientShareBeforeOOP);
  const pPays = pPaysBeforeOOP + pOOP.oopMaxAdjustment; // plan pays extra if OOP max reached
  const pPatientShare = pOOP.adjustedPatientResponsibility;

  // === SECONDARY PLAN ===
  // Patient's remaining responsibility after primary goes to secondary
  const sSubmitted = pPatientShare;
  const sd = applyDeductible(secondaryTracker, secondaryPlan, claim.patientName, sSubmitted);
  const sEligible = sd.remainingAfterDeductible;
  const sRate = secondaryPlan.coinsurance.inNetwork / 100;
  const sPaysBeforeOOP = Math.round(sEligible * sRate);
  const sPatientShareBeforeOOP = sd.deductibleApplied + (sEligible - sPaysBeforeOOP);

  // Enforce OOP max on secondary
  const sOOP = enforceOOPMax(secondaryTracker, secondaryPlan, claim.patientName, sPatientShareBeforeOOP);
  const sPays = sPaysBeforeOOP + sOOP.oopMaxAdjustment;

  const totalIns = pPays + sPays;
  const totalOOP = total - totalIns;
  const savingsFromDualCoverage = sSubmitted - totalOOP; // how much secondary saved the patient

  return {
    claimId: claim.id,
    patientName: claim.patientName,
    totalCharges: total,
    primaryPlan: {
      planId: primaryPlan.id,
      planName: `${primaryPlan.name} (${primaryPlan.insurerName})`,
      deductibleApplied: pd.deductibleApplied,
      deductibleRemaining: Math.max(0, primaryPlan.deductible.individual - (primaryTracker.individual.get(claim.patientName) || 0)),
      eligibleAmount: pEligible,
      coinsuranceRate: primaryPlan.coinsurance.inNetwork,
      planPays: pPays,
      patientResponsibility: pPatientShare,
    },
    secondaryPlan: {
      planId: secondaryPlan.id,
      planName: `${secondaryPlan.name} (${secondaryPlan.insurerName})`,
      amountSubmitted: sSubmitted,
      deductibleApplied: sd.deductibleApplied,
      deductibleRemaining: Math.max(0, secondaryPlan.deductible.individual - (secondaryTracker.individual.get(claim.patientName) || 0)),
      eligibleAmount: sEligible,
      coinsuranceRate: secondaryPlan.coinsurance.inNetwork,
      planPays: sPays,
      patientResponsibility: totalOOP,
    },
    totalInsurancePaid: totalIns,
    totalPatientOOP: totalOOP,
    savings: savingsFromDualCoverage,
  };
}

function generateCostFlowData(calcs: ClaimCalculation[]): CostFlowData {
  const nodes: CostFlowNode[] = [];
  const links: CostFlowLink[] = [];
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;

  calcs.forEach((c) => {
    nodes.push({ id: `claim-${c.claimId}`, label: `${c.patientName} - ${fmt(c.totalCharges)}`, value: c.totalCharges, color: '#6366f1' });
  });

  const pTotal = calcs.reduce((s, c) => s + c.primaryPlan.planPays, 0);
  nodes.push({ id: 'primary-insurance', label: `Primary Insurance - ${fmt(pTotal)}`, value: pTotal, color: '#10b981' });
  const sTotal = calcs.reduce((s, c) => s + c.secondaryPlan.planPays, 0);
  nodes.push({ id: 'secondary-insurance', label: `Secondary Insurance - ${fmt(sTotal)}`, value: sTotal, color: '#3b82f6' });
  const oopTotal = calcs.reduce((s, c) => s + c.totalPatientOOP, 0);
  nodes.push({ id: 'patient-oop', label: `Patient OOP - ${fmt(oopTotal)}`, value: oopTotal, color: '#ef4444' });

  calcs.forEach((c) => {
    links.push({ source: `claim-${c.claimId}`, target: 'primary-insurance', value: c.primaryPlan.planPays, label: `Primary ${fmt(c.primaryPlan.planPays)}` });
    if (c.secondaryPlan.planPays > 0) links.push({ source: `claim-${c.claimId}`, target: 'secondary-insurance', value: c.secondaryPlan.planPays, label: `Secondary ${fmt(c.secondaryPlan.planPays)}` });
    if (c.totalPatientOOP > 0) links.push({ source: `claim-${c.claimId}`, target: 'patient-oop', value: c.totalPatientOOP, label: `Patient ${fmt(c.totalPatientOOP)}` });
  });
  return { nodes, links };
}

export function processCOB(claims: ParsedClaim[]): COBResult {
  const names = [...new Set(claims.map((c) => c.patientName))];
  const determinations = names.map((n) => determinePrimaryPlan(n));
  const tA = createDeductibleTracker(PLAN_A);
  const tB = createDeductibleTracker(PLAN_B);

  const calculations = claims.map((claim) => {
    const det = determinations.find(
      (d) => d.patient.toLowerCase() === claim.patientName.toLowerCase()
    ) || determinations[0];
    const pt = det.primaryPlan === 'PLAN_A' ? tA : tB;
    const st = det.primaryPlan === 'PLAN_A' ? tB : tA;
    return calculateClaim(claim, det, pt, st);
  });

  const totalCharges = calculations.reduce((s, c) => s + c.totalCharges, 0);
  const totalIns = calculations.reduce((s, c) => s + c.totalInsurancePaid, 0);
  const totalOOP = calculations.reduce((s, c) => s + c.totalPatientOOP, 0);
  const totalSavings = calculations.reduce((s, c) => s + c.savings, 0);

  return {
    determinations, calculations, totalCharges,
    totalInsurancePaid: totalIns, totalPatientOOP: totalOOP, totalSavings,
    flowData: generateCostFlowData(calculations),
  };
}
