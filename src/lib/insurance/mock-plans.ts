import { InsurancePlan } from '@/lib/types';

export const PLAN_A: InsurancePlan = {
  id: 'plan-a',
  name: 'Plan A',
  insurerName: 'Insurer1 Health Insurance',
  policyNumber: 'INS1-MUM-2024-78432',
  planType: 'PPO',
  primaryHolder: {
    name: 'Priya Sen',
    dateOfBirth: '1988-03-15',
    relationship: 'self',
    memberId: 'INS1-PRI-001',
  },
  dependents: [
    {
      name: 'Aarav Sen',
      dateOfBirth: '1986-11-22',
      relationship: 'spouse',
      memberId: 'INS1-DEP-001',
    },
  ],
  deductible: { individual: 50000, family: 100000, individualMet: 0, familyMet: 0 },
  coinsurance: { inNetwork: 80, outOfNetwork: 60 },
  outOfPocketMax: { individual: 300000, family: 500000, individualMet: 0, familyMet: 0 },
  preAuthRequirements: [
    { condition: 'surgical_above_1lakh', description: 'Pre-authorization required for all surgical procedures with estimated cost exceeding ₹1,00,000' },
    { condition: 'inpatient_admission', description: 'Pre-authorization required for all inpatient hospital admissions' },
  ],
  networkProviders: ['Mumbai Central Hospital', 'Apollo Hospitals Mumbai', 'Kokilaben Dhirubhai Ambani Hospital', 'Lilavati Hospital', 'Hinduja Hospital'],
  coverageStart: '2024-01-01',
  coverageEnd: '2024-12-31',
};

export const PLAN_B: InsurancePlan = {
  id: 'plan-b',
  name: 'Plan B',
  insurerName: 'Insurer2 General Insurance',
  policyNumber: 'INS2-MUM-2024-55210',
  planType: 'HMO',
  primaryHolder: {
    name: 'Aarav Sen',
    dateOfBirth: '1986-11-22',
    relationship: 'self',
    memberId: 'INS2-AAR-001',
  },
  dependents: [
    {
      name: 'Priya Sen',
      dateOfBirth: '1988-03-15',
      relationship: 'spouse',
      memberId: 'INS2-DEP-001',
    },
  ],
  deductible: { individual: 30000, family: 75000, individualMet: 0, familyMet: 0 },
  coinsurance: { inNetwork: 70, outOfNetwork: 50 },
  outOfPocketMax: { individual: 400000, family: 700000, individualMet: 0, familyMet: 0 },
  preAuthRequirements: [
    { condition: 'all_surgical', description: 'Pre-authorization required for ALL surgical procedures regardless of cost' },
    { condition: 'specialist_referral', description: 'Specialist referral required for non-emergency specialist visits' },
  ],
  networkProviders: ['Fortis Hospital Mumbai', 'Nanavati Max Super Speciality Hospital', 'Breach Candy Hospital', 'Jaslok Hospital', 'Wockhardt Hospital'],
  coverageStart: '2024-01-01',
  coverageEnd: '2024-12-31',
};

export function getPlanForPatient(patientName: string): { primaryPlan: InsurancePlan; secondaryPlan: InsurancePlan } | null {
  const n = patientName.toLowerCase().trim();
  if (n.includes('aarav')) return { primaryPlan: PLAN_B, secondaryPlan: PLAN_A };
  if (n.includes('priya')) return { primaryPlan: PLAN_A, secondaryPlan: PLAN_B };
  return null;
}

export function getAllPlans(): InsurancePlan[] {
  return [PLAN_A, PLAN_B];
}
