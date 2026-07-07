import {
  ParsedClaim, InsurancePlan, COBResult, COBDetermination, ClaimCalculation,
  CostFlowData, CostFlowNode, CostFlowLink,
} from '@/lib/types';
import { PLAN_A, PLAN_B } from './mock-plans';
import { createDeductibleTracker, applyDeductible, DeductibleTracker } from './deductible-calculator';

/**
 * Determines primary/secondary plan using the Subscriber Rule.
 * The plan where the patient is the subscriber (policyholder) is always primary.
 */
export function determinePrimaryPlan(patientName: string): COBDetermination {
  const n = patientName.toLowerCase().trim();
  if (n.includes('aarav')) {
    return {
      patient: 'Aarav Sen', primaryPlan: 'PLAN_B', secondaryPlan: 'PLAN_A',
      rule: 'SUBSCRIBER_RULE',
      reasoning: 'Aarav is the primary policyholder (subscriber) on Plan B (Insurer2) and a dependent on Plan A (Insurer1). Per the Subscriber Rule, Plan B is primary and Plan A is secondary for Aarav\'s claims.',
    };
  }
  if (n.includes('priya')) {
    return {
      patient: 'Priya Sen', primaryPlan: 'PLAN_A', secondaryPlan: 'PLAN_B',
      rule: 'SUBSCRIBER_RULE',
      reasoning: 'Priya is the primary policyholder (subscriber) on Plan A (Insurer1) and a dependent on Plan B (Insurer2). Per the Subscriber Rule, Plan A is primary and Plan B is secondary for Priya\'s claims.',
    };
  }
  return {
    patient: patientName, primaryPlan: 'PLAN_A', secondaryPlan: 'PLAN_B',
    rule: 'BIRTHDAY_RULE',
    reasoning: 'Applying Birthday Rule as fallback. Priya\'s birthday (Mar 15) is earlier than Aarav\'s (Nov 22), making Plan A primary.',
  };
}

function getPlan(d: string): InsurancePlan { return d === 'PLAN_A' ? PLAN_A : PLAN_B; }

export function calculateClaim(
  claim: ParsedClaim, determination: COBDetermination,
  primaryTracker: DeductibleTracker, secondaryTracker: DeductibleTracker
): ClaimCalculation {
  const primaryPlan = getPlan(determination.primaryPlan);
  const secondaryPlan = getPlan(determination.secondaryPlan);
  const total = claim.totalCharges;

  // Primary
  const pd = applyDeductible(primaryTracker, primaryPlan, claim.patientName, total);
  const pEligible = pd.remainingAfterDeductible;
  const pRate = primaryPlan.coinsurance.inNetwork / 100;
  const pPays = Math.round(pEligible * pRate);
  const pPatientShare = pEligible - pPays;

  // Secondary: patient's remaining responsibility goes to secondary
  const sSubmitted = pd.deductibleApplied + pPatientShare;
  const sd = applyDeductible(secondaryTracker, secondaryPlan, claim.patientName, sSubmitted);
  const sEligible = sd.remainingAfterDeductible;
  const sRate = secondaryPlan.coinsurance.inNetwork / 100;
  const sPays = Math.round(sEligible * sRate);

  const totalIns = pPays + sPays;
  const totalOOP = total - totalIns;
  const savings = (pd.deductibleApplied + pPatientShare) - totalOOP;

  return {
    claimId: claim.id, patientName: claim.patientName, totalCharges: total,
    primaryPlan: {
      planId: primaryPlan.id, planName: `${primaryPlan.name} (${primaryPlan.insurerName})`,
      deductibleApplied: pd.deductibleApplied,
      deductibleRemaining: primaryPlan.deductible.individual - (primaryTracker.individual.get(claim.patientName) || 0),
      eligibleAmount: pEligible, coinsuranceRate: primaryPlan.coinsurance.inNetwork,
      planPays: pPays, patientResponsibility: pd.deductibleApplied + pPatientShare,
    },
    secondaryPlan: {
      planId: secondaryPlan.id, planName: `${secondaryPlan.name} (${secondaryPlan.insurerName})`,
      amountSubmitted: sSubmitted, deductibleApplied: sd.deductibleApplied,
      deductibleRemaining: secondaryPlan.deductible.individual - (secondaryTracker.individual.get(claim.patientName) || 0),
      eligibleAmount: sEligible, coinsuranceRate: secondaryPlan.coinsurance.inNetwork,
      planPays: sPays, patientResponsibility: totalOOP,
    },
    totalInsurancePaid: totalIns, totalPatientOOP: totalOOP, savings,
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
      (d) => d.patient.toLowerCase() === claim.patientName.toLowerCase() ||
        claim.patientName.toLowerCase().includes(d.patient.split(' ')[0].toLowerCase())
    ) || determinations[0];
    const pt = det.primaryPlan === 'PLAN_A' ? tA : tB;
    const st = det.primaryPlan === 'PLAN_A' ? tB : tA;
    return calculateClaim(claim, det, pt, st);
  });

  const totalCharges = calculations.reduce((s, c) => s + c.totalCharges, 0);
  const totalIns = calculations.reduce((s, c) => s + c.totalInsurancePaid, 0);
  const totalOOP = calculations.reduce((s, c) => s + c.totalPatientOOP, 0);
  const totalSavings = calculations.reduce((s, c) => s + c.savings, 0);

  return { determinations, calculations, totalCharges, totalInsurancePaid: totalIns, totalPatientOOP: totalOOP, totalSavings, flowData: generateCostFlowData(calculations) };
}
