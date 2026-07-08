import { describe, it, expect } from 'vitest';
import { createDeductibleTracker, applyDeductible, enforceOOPMax } from './deductible-calculator';
import { PLAN_A, PLAN_B } from './mock-plans';

describe('createDeductibleTracker', () => {
  it('initializes tracker with plan holder and dependents', () => {
    const tracker = createDeductibleTracker(PLAN_A);
    expect(tracker.planId).toBe('plan-a');
    expect(tracker.individual.get('Priya Sen')).toBe(0); // individualMet starts at 0
    expect(tracker.individual.get('Aarav Sen')).toBe(0);
    expect(tracker.familyTotal).toBe(0);
  });

  it('initializes OOP tracking maps', () => {
    const tracker = createDeductibleTracker(PLAN_B);
    expect(tracker.oopIndividual.get('Aarav Sen')).toBe(0);
    expect(tracker.oopIndividual.get('Priya Sen')).toBe(0);
    expect(tracker.oopFamily).toBe(0);
  });
});

describe('applyDeductible', () => {
  it('applies full deductible when charge exceeds deductible', () => {
    const tracker = createDeductibleTracker(PLAN_A);
    // Plan A individual deductible = ₹50,000
    const result = applyDeductible(tracker, PLAN_A, 'Priya Sen', 100000);
    expect(result.deductibleApplied).toBe(50000);
    expect(result.remainingAfterDeductible).toBe(50000);
    expect(result.deductibleFullyMet).toBe(true);
  });

  it('applies partial deductible when charge is less than deductible', () => {
    const tracker = createDeductibleTracker(PLAN_A);
    const result = applyDeductible(tracker, PLAN_A, 'Priya Sen', 30000);
    expect(result.deductibleApplied).toBe(30000);
    expect(result.remainingAfterDeductible).toBe(0);
    expect(result.deductibleFullyMet).toBe(false);
  });

  it('tracks deductible accumulation across multiple claims', () => {
    const tracker = createDeductibleTracker(PLAN_B);
    // Plan B individual deductible = ₹30,000

    // First claim: ₹20,000
    const r1 = applyDeductible(tracker, PLAN_B, 'Aarav Sen', 20000);
    expect(r1.deductibleApplied).toBe(20000);
    expect(r1.deductibleFullyMet).toBe(false);

    // Second claim: ₹50,000 (only ₹10,000 remaining on deductible)
    const r2 = applyDeductible(tracker, PLAN_B, 'Aarav Sen', 50000);
    expect(r2.deductibleApplied).toBe(10000);
    expect(r2.remainingAfterDeductible).toBe(40000);
    expect(r2.deductibleFullyMet).toBe(true);
  });

  it('respects family deductible cap', () => {
    const tracker = createDeductibleTracker(PLAN_B);
    // Plan B: individual = ₹30,000, family = ₹75,000

    // Aarav uses full individual: ₹30,000
    applyDeductible(tracker, PLAN_B, 'Aarav Sen', 100000);
    expect(tracker.familyTotal).toBe(30000);

    // Priya uses full individual: ₹30,000 (family total now ₹60,000)
    applyDeductible(tracker, PLAN_B, 'Priya Sen', 100000);
    expect(tracker.familyTotal).toBe(60000);
  });

  it('returns zero deductible when already fully met', () => {
    const tracker = createDeductibleTracker(PLAN_A);
    applyDeductible(tracker, PLAN_A, 'Priya Sen', 60000); // Meets ₹50k deductible
    const r2 = applyDeductible(tracker, PLAN_A, 'Priya Sen', 30000);
    expect(r2.deductibleApplied).toBe(0);
    expect(r2.remainingAfterDeductible).toBe(30000);
  });
});

describe('enforceOOPMax', () => {
  it('does not adjust when under OOP max', () => {
    const tracker = createDeductibleTracker(PLAN_A);
    // Plan A OOP max individual = ₹300,000
    const result = enforceOOPMax(tracker, PLAN_A, 'Priya Sen', 50000);
    expect(result.adjustedPatientResponsibility).toBe(50000);
    expect(result.oopMaxAdjustment).toBe(0);
    expect(result.oopMaxReached).toBe(false);
  });

  it('caps patient responsibility at OOP max', () => {
    const tracker = createDeductibleTracker(PLAN_A);
    // OOP max individual = ₹300,000
    // First: spend ₹250,000
    enforceOOPMax(tracker, PLAN_A, 'Priya Sen', 250000);

    // Second: try to spend ₹100,000 but only ₹50,000 remaining
    const result = enforceOOPMax(tracker, PLAN_A, 'Priya Sen', 100000);
    expect(result.adjustedPatientResponsibility).toBe(50000);
    expect(result.oopMaxAdjustment).toBe(50000); // plan picks up the excess
    expect(result.oopMaxReached).toBe(true);
  });

  it('returns zero responsibility when OOP max already reached', () => {
    const tracker = createDeductibleTracker(PLAN_A);
    enforceOOPMax(tracker, PLAN_A, 'Priya Sen', 300000); // Hits max
    const result = enforceOOPMax(tracker, PLAN_A, 'Priya Sen', 50000);
    expect(result.adjustedPatientResponsibility).toBe(0);
    expect(result.oopMaxAdjustment).toBe(50000);
  });

  it('tracks OOP accumulation across patients (family)', () => {
    const tracker = createDeductibleTracker(PLAN_B);
    // Plan B OOP max family = ₹700,000
    enforceOOPMax(tracker, PLAN_B, 'Aarav Sen', 300000);
    enforceOOPMax(tracker, PLAN_B, 'Priya Sen', 300000);
    expect(tracker.oopFamily).toBe(600000);
  });
});
