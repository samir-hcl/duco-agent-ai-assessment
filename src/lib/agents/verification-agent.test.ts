import { describe, it, expect } from 'vitest';

/**
 * Tests for verification-agent deterministic checks.
 * Validates math auditing, code validation, and total reconciliation logic.
 */

function verifyMathIntegrity(calc: {
  totalCharges: number;
  primaryPays: number;
  secondaryPays: number;
  patientOOP: number;
}): { valid: boolean; issue: string | null } {
  const sum = calc.primaryPays + calc.secondaryPays + calc.patientOOP;
  if (Math.abs(sum - calc.totalCharges) > 1) {
    return { valid: false, issue: `Math error: ${sum} ≠ ${calc.totalCharges}` };
  }
  if (calc.primaryPays < 0 || calc.secondaryPays < 0 || calc.patientOOP < 0) {
    return { valid: false, issue: 'Negative payment value detected' };
  }
  if (calc.totalCharges < 0) {
    return { valid: false, issue: 'Negative total charges' };
  }
  return { valid: true, issue: null };
}

function verifyTotals(
  calculations: { insurancePaid: number; patientOOP: number }[],
  reportedInsurance: number,
  reportedOOP: number
): string[] {
  const issues: string[] = [];
  const recalcIns = calculations.reduce((s, c) => s + c.insurancePaid, 0);
  const recalcOOP = calculations.reduce((s, c) => s + c.patientOOP, 0);
  if (Math.abs(recalcIns - reportedInsurance) > 1) issues.push('Total insurance mismatch');
  if (Math.abs(recalcOOP - reportedOOP) > 1) issues.push('Total OOP mismatch');
  return issues;
}

describe('Verification Math Integrity', () => {
  it('passes when primary + secondary + OOP = total', () => {
    const result = verifyMathIntegrity({ totalCharges: 30000, primaryPays: 19200, secondaryPays: 6480, patientOOP: 4320 });
    expect(result.valid).toBe(true);
  });

  it('fails when sum does not equal total', () => {
    const result = verifyMathIntegrity({ totalCharges: 30000, primaryPays: 19200, secondaryPays: 6480, patientOOP: 5000 });
    expect(result.valid).toBe(false);
    expect(result.issue).toContain('Math error');
  });

  it('fails on negative primary payment', () => {
    const result = verifyMathIntegrity({ totalCharges: 30000, primaryPays: -100, secondaryPays: 25100, patientOOP: 5000 });
    expect(result.valid).toBe(false);
    expect(result.issue).toContain('Negative');
  });

  it('fails on negative total charges', () => {
    const result = verifyMathIntegrity({ totalCharges: -500, primaryPays: 0, secondaryPays: 0, patientOOP: 0 });
    expect(result.valid).toBe(false);
  });

  it('passes with zero charges', () => {
    const result = verifyMathIntegrity({ totalCharges: 0, primaryPays: 0, secondaryPays: 0, patientOOP: 0 });
    expect(result.valid).toBe(true);
  });

  it('passes with rounding tolerance of ₹1', () => {
    const result = verifyMathIntegrity({ totalCharges: 30000, primaryPays: 19200, secondaryPays: 6480, patientOOP: 4321 });
    expect(result.valid).toBe(true);
  });
});

describe('Verification Total Reconciliation', () => {
  it('passes when totals match', () => {
    const calcs = [
      { insurancePaid: 25680, patientOOP: 4320 },
      { insurancePaid: 341520, patientOOP: 108480 },
    ];
    const issues = verifyTotals(calcs, 367200, 112800);
    expect(issues).toEqual([]);
  });

  it('detects insurance total mismatch', () => {
    const calcs = [{ insurancePaid: 25000, patientOOP: 5000 }];
    const issues = verifyTotals(calcs, 30000, 5000);
    expect(issues).toContain('Total insurance mismatch');
  });

  it('detects OOP total mismatch', () => {
    const calcs = [{ insurancePaid: 25000, patientOOP: 5000 }];
    const issues = verifyTotals(calcs, 25000, 9999);
    expect(issues).toContain('Total OOP mismatch');
  });

  it('detects both mismatches simultaneously', () => {
    const calcs = [{ insurancePaid: 10000, patientOOP: 5000 }];
    const issues = verifyTotals(calcs, 99999, 99999);
    expect(issues).toHaveLength(2);
  });
});
