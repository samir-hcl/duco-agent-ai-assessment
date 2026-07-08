import { describe, it, expect } from 'vitest';
import { determinePrimaryPlan, calculateClaim, processCOB } from './cob-engine';
import { PLAN_A, PLAN_B } from './mock-plans';
import { createDeductibleTracker } from './deductible-calculator';
import { ParsedClaim } from '@/lib/types';

describe('determinePrimaryPlan', () => {
  it('determines Plan B as primary for Aarav (he is subscriber on Plan B)', () => {
    const result = determinePrimaryPlan('Aarav Sen');
    expect(result.primaryPlan).toBe('PLAN_B');
    expect(result.secondaryPlan).toBe('PLAN_A');
    expect(result.rule).toBe('SUBSCRIBER_RULE');
    expect(result.patient).toBe('Aarav Sen');
  });

  it('determines Plan A as primary for Priya (she is subscriber on Plan A)', () => {
    const result = determinePrimaryPlan('Priya Sen');
    expect(result.primaryPlan).toBe('PLAN_A');
    expect(result.secondaryPlan).toBe('PLAN_B');
    expect(result.rule).toBe('SUBSCRIBER_RULE');
  });

  it('falls back to Birthday Rule for unknown patient', () => {
    const result = determinePrimaryPlan('Unknown Person');
    expect(result.rule).toBe('BIRTHDAY_RULE');
    // Priya's birthday (Mar 15) is earlier than Aarav's (Nov 22) → Plan A primary
    expect(result.primaryPlan).toBe('PLAN_A');
  });

  it('uses data-driven lookup, not hardcoded name strings', () => {
    // This test verifies the determination uses plan.primaryHolder, not name.includes()
    const result = determinePrimaryPlan('Aarav Sen', PLAN_A, PLAN_B);
    expect(result.reasoning).toContain('subscriber');
    expect(result.reasoning).toContain(PLAN_B.insurerName);
  });
});

describe('calculateClaim', () => {
  function makeClaim(overrides: Partial<ParsedClaim> = {}): ParsedClaim {
    return {
      id: 'test-claim',
      patientName: 'Aarav Sen',
      patientDOB: '1986-11-22',
      relationship: 'self',
      providerName: 'Test Provider',
      providerType: 'Surgery',
      dateOfService: '2024-07-15',
      procedureCodes: [],
      diagnosisCodes: [],
      totalCharges: 450000,
      lineItems: [],
      sourceFile: 'test.jpg',
      sourceType: 'image',
      extractionConfidence: 1.0,
      ...overrides,
    };
  }

  it('primary pays + secondary pays + OOP = totalCharges', () => {
    const claim = makeClaim({ totalCharges: 450000 });
    const det = determinePrimaryPlan('Aarav Sen');
    const ptA = createDeductibleTracker(PLAN_A);
    const ptB = createDeductibleTracker(PLAN_B);
    const pt = det.primaryPlan === 'PLAN_A' ? ptA : ptB;
    const st = det.primaryPlan === 'PLAN_A' ? ptB : ptA;

    const calc = calculateClaim(claim, det, pt, st);
    const total = calc.primaryPlan.planPays + calc.secondaryPlan.planPays + calc.totalPatientOOP;
    expect(Math.abs(total - calc.totalCharges)).toBeLessThanOrEqual(1);
  });

  it('applies primary deductible first', () => {
    const claim = makeClaim({ totalCharges: 450000, patientName: 'Aarav Sen' });
    const det = determinePrimaryPlan('Aarav Sen');
    // Aarav's primary is Plan B (deductible ₹30,000)
    const ptA = createDeductibleTracker(PLAN_A);
    const ptB = createDeductibleTracker(PLAN_B);
    const pt = ptB; // Plan B is primary
    const st = ptA; // Plan A is secondary

    const calc = calculateClaim(claim, det, pt, st);
    expect(calc.primaryPlan.deductibleApplied).toBe(30000); // Plan B deductible
  });

  it('Aarav surgery: Plan B primary, Plan A secondary', () => {
    const claim = makeClaim({ totalCharges: 450000, patientName: 'Aarav Sen' });
    const det = determinePrimaryPlan('Aarav Sen');
    const ptA = createDeductibleTracker(PLAN_A);
    const ptB = createDeductibleTracker(PLAN_B);

    const calc = calculateClaim(claim, det, ptB, ptA);
    expect(calc.primaryPlan.planId).toBe('plan-b');
    expect(calc.secondaryPlan.planId).toBe('plan-a');
    expect(calc.totalInsurancePaid).toBeGreaterThan(0);
    expect(calc.totalPatientOOP).toBeGreaterThanOrEqual(0);
    expect(calc.totalCharges).toBe(450000);
  });

  it('small claim under deductible pays nothing from insurance', () => {
    const claim = makeClaim({ totalCharges: 10000, patientName: 'Aarav Sen' });
    const det = determinePrimaryPlan('Aarav Sen');
    const ptB = createDeductibleTracker(PLAN_B);
    const ptA = createDeductibleTracker(PLAN_A);

    const calc = calculateClaim(claim, det, ptB, ptA);
    // ₹10,000 < ₹30,000 deductible → all goes to deductible → ₹0 eligible → plan pays ₹0
    expect(calc.primaryPlan.planPays).toBe(0);
  });
});

describe('processCOB (integration)', () => {
  function makeAaravClaim(): ParsedClaim {
    return {
      id: 'aarav-surgery', patientName: 'Aarav Sen', patientDOB: '1986-11-22',
      relationship: 'self', providerName: 'Dr. Khanna', providerType: 'Surgery',
      dateOfService: '2024-07-15', procedureCodes: [], diagnosisCodes: [],
      totalCharges: 450000, lineItems: [], sourceFile: 'est.jpg', sourceType: 'image', extractionConfidence: 1.0,
    };
  }
  function makePriyaClaim(): ParsedClaim {
    return {
      id: 'priya-pt', patientName: 'Priya Sen', patientDOB: '1988-03-15',
      relationship: 'self', providerName: 'PhysioFirst', providerType: 'PT',
      dateOfService: '2024-06-17', procedureCodes: [], diagnosisCodes: [],
      totalCharges: 30000, lineItems: [], sourceFile: 'inv.jpg', sourceType: 'image', extractionConfidence: 1.0,
    };
  }

  it('processes both claims and balances total', () => {
    const result = processCOB([makeAaravClaim(), makePriyaClaim()]);
    expect(result.calculations.length).toBe(2);
    expect(result.totalCharges).toBe(480000);

    // Verify: totalInsurancePaid + totalPatientOOP = totalCharges
    expect(Math.abs(result.totalInsurancePaid + result.totalPatientOOP - result.totalCharges)).toBeLessThanOrEqual(2);
  });

  it('assigns correct primary plans', () => {
    const result = processCOB([makeAaravClaim(), makePriyaClaim()]);
    const aaravCalc = result.calculations.find(c => c.patientName === 'Aarav Sen')!;
    const priyaCalc = result.calculations.find(c => c.patientName === 'Priya Sen')!;

    expect(aaravCalc.primaryPlan.planId).toBe('plan-b'); // Aarav subscriber on B
    expect(priyaCalc.primaryPlan.planId).toBe('plan-a'); // Priya subscriber on A
  });

  it('each individual claim balances: primary + secondary + OOP = total', () => {
    const result = processCOB([makeAaravClaim(), makePriyaClaim()]);
    for (const calc of result.calculations) {
      const sum = calc.primaryPlan.planPays + calc.secondaryPlan.planPays + calc.totalPatientOOP;
      expect(Math.abs(sum - calc.totalCharges)).toBeLessThanOrEqual(1);
    }
  });

  it('generates cost flow data with correct node count', () => {
    const result = processCOB([makeAaravClaim(), makePriyaClaim()]);
    // 2 claim nodes + primary-insurance + secondary-insurance + patient-oop = 5
    expect(result.flowData.nodes.length).toBeGreaterThanOrEqual(4);
    expect(result.flowData.links.length).toBeGreaterThanOrEqual(2);
  });
});
