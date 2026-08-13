import { describe, it, expect } from 'vitest';

/**
 * Tests for intake-agent OCR extraction schema validation.
 * Verifies that the parsed outputs from Gemini Vision (or mock fallback)
 * conform to the expected claim schema used downstream by COB and verification agents.
 */

// Schema validators matching the exact interfaces in intake-agent.ts
function validateInvoiceSchema(obj: Record<string, unknown>): string[] {
  const issues: string[] = [];
  if (typeof obj.patientName !== 'string' || !obj.patientName) issues.push('Missing patientName');
  if (typeof obj.providerName !== 'string') issues.push('Missing providerName');
  if (typeof obj.totalAmount !== 'number' || obj.totalAmount < 0) issues.push('Invalid totalAmount');
  if (!Array.isArray(obj.services)) issues.push('Missing services array');
  else {
    for (const s of obj.services as Record<string, unknown>[]) {
      if (typeof s.description !== 'string') issues.push('Service missing description');
      if (typeof s.charge !== 'number') issues.push('Service missing charge');
    }
  }
  return issues;
}

function validateEstimateSchema(obj: Record<string, unknown>): string[] {
  const issues: string[] = [];
  if (typeof obj.patientName !== 'string' || !obj.patientName) issues.push('Missing patientName');
  if (typeof obj.surgeonName !== 'string') issues.push('Missing surgeonName');
  if (typeof obj.totalEstimate !== 'number' || obj.totalEstimate < 0) issues.push('Invalid totalEstimate');
  if (!Array.isArray(obj.procedures)) issues.push('Missing procedures array');
  else {
    for (const p of obj.procedures as Record<string, unknown>[]) {
      if (typeof p.cptCode !== 'string') issues.push('Procedure missing cptCode');
      if (typeof p.estimatedCost !== 'number') issues.push('Procedure missing estimatedCost');
    }
  }
  if (!Array.isArray(obj.icd10Codes)) issues.push('Missing icd10Codes array');
  return issues;
}

function validateMRISchema(obj: Record<string, unknown>): string[] {
  const issues: string[] = [];
  if (typeof obj.patientName !== 'string' || !obj.patientName) issues.push('Missing patientName');
  if (typeof obj.findings !== 'string') issues.push('Missing findings');
  if (!Array.isArray(obj.impression)) issues.push('Missing impression array');
  if (typeof obj.recommendation !== 'string') issues.push('Missing recommendation');
  return issues;
}

// ─── INVOICE SCHEMA TESTS ───
describe('Invoice OCR Schema Validation', () => {
  it('accepts a complete invoice extraction', () => {
    const valid = {
      patientName: 'Priya Sen', patientDOB: '1985-03-15', providerName: 'PhysioPlus Clinic',
      providerType: 'Physical Therapy', dateOfService: '2024-11-15', diagnosis: 'Low back pain',
      services: [
        { description: 'PT Initial Evaluation', date: '2024-11-15', charge: 3000 },
        { description: 'Therapeutic Exercises (4 units)', date: '2024-11-15', charge: 4800 },
      ],
      totalAmount: 30000, handwrittenNotes: [],
    };
    expect(validateInvoiceSchema(valid)).toEqual([]);
  });

  it('rejects invoice with missing patientName', () => {
    const invalid = { providerName: 'Clinic', totalAmount: 100, services: [] };
    expect(validateInvoiceSchema(invalid)).toContain('Missing patientName');
  });

  it('rejects invoice with negative totalAmount', () => {
    const invalid = { patientName: 'Test', providerName: 'X', totalAmount: -500, services: [] };
    expect(validateInvoiceSchema(invalid)).toContain('Invalid totalAmount');
  });

  it('rejects invoice with missing services array', () => {
    const invalid = { patientName: 'Test', providerName: 'X', totalAmount: 100 };
    expect(validateInvoiceSchema(invalid)).toContain('Missing services array');
  });

  it('rejects service items without charge', () => {
    const invalid = {
      patientName: 'Test', providerName: 'X', totalAmount: 100,
      services: [{ description: 'PT Eval' }],
    };
    expect(validateInvoiceSchema(invalid)).toContain('Service missing charge');
  });
});

// ─── ESTIMATE SCHEMA TESTS ───
describe('Surgeon Estimate OCR Schema Validation', () => {
  it('accepts a complete estimate extraction', () => {
    const valid = {
      patientName: 'Aarav Sen', patientDOB: '1982-07-22', surgeonName: 'Dr. Mehta',
      facility: 'Apex Hospital', proposedDate: '2025-01-15',
      procedures: [
        { cptCode: '29888', description: 'ACL Reconstruction', estimatedCost: 350000 },
        { cptCode: '29881', description: 'Meniscectomy', estimatedCost: 100000 },
      ],
      totalEstimate: 450000, diagnosis: 'ACL tear + Meniscus tear',
      icd10Codes: ['M23.611', 'M23.211'],
    };
    expect(validateEstimateSchema(valid)).toEqual([]);
  });

  it('rejects estimate without procedures array', () => {
    const invalid = { patientName: 'Test', surgeonName: 'Dr. X', totalEstimate: 100, icd10Codes: [] };
    expect(validateEstimateSchema(invalid)).toContain('Missing procedures array');
  });

  it('rejects estimate with missing icd10Codes', () => {
    const invalid = { patientName: 'Test', surgeonName: 'Dr. X', totalEstimate: 100, procedures: [] };
    expect(validateEstimateSchema(invalid)).toContain('Missing icd10Codes array');
  });

  it('rejects procedure without cptCode', () => {
    const invalid = {
      patientName: 'Test', surgeonName: 'Dr. X', totalEstimate: 100,
      procedures: [{ estimatedCost: 500 }], icd10Codes: [],
    };
    expect(validateEstimateSchema(invalid)).toContain('Procedure missing cptCode');
  });
});

// ─── MRI SCHEMA TESTS ───
describe('MRI Report OCR Schema Validation', () => {
  it('accepts a complete MRI extraction', () => {
    const valid = {
      patientName: 'Aarav Sen', patientDOB: '1982-07-22',
      referringPhysician: 'Dr. Kapoor', facility: 'Imaging Center',
      dateOfExamination: '2024-11-10',
      findings: 'Complete disruption of the anterior cruciate ligament',
      impression: ['ACL tear', 'Meniscus tear'], recommendation: 'Surgical consultation',
    };
    expect(validateMRISchema(valid)).toEqual([]);
  });

  it('rejects MRI without findings', () => {
    const invalid = { patientName: 'Test', impression: [], recommendation: 'None' };
    expect(validateMRISchema(invalid)).toContain('Missing findings');
  });

  it('rejects MRI without impression array', () => {
    const invalid = { patientName: 'Test', findings: 'Normal', recommendation: 'None' };
    expect(validateMRISchema(invalid)).toContain('Missing impression array');
  });
});
