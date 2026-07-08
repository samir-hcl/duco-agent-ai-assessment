import { describe, it, expect } from 'vitest';
import {
  mapTextToCPTCodes,
  mapTextToICD10Codes,
  inferCodesFromDescription,
  validateProcedureDiagnosisCompatibility,
} from './clinical-mapper';
import { lookupCPT, lookupICD10, searchCodes, getPreAuthRequired } from './code-lookup';

describe('code-lookup', () => {
  it('looks up known CPT code', () => {
    const code = lookupCPT('29888');
    expect(code).toBeDefined();
    expect(code!.description).toContain('ACL');
    expect(code!.requiresPreAuth).toBe(true);
  });

  it('looks up known ICD-10 code', () => {
    const code = lookupICD10('M23.611');
    expect(code).toBeDefined();
    expect(code!.description).toContain('anterior cruciate ligament');
  });

  it('returns undefined for unknown code', () => {
    expect(lookupCPT('99999')).toBeUndefined();
    expect(lookupICD10('Z99.99')).toBeUndefined();
  });

  it('searches codes by description keyword', () => {
    const results = searchCodes('ACL');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.code === '29888')).toBe(true);
  });

  it('filters search by code type', () => {
    const cptOnly = searchCodes('knee', 'CPT');
    const icd10Only = searchCodes('knee', 'ICD10');
    cptOnly.forEach(c => expect(c.type).toBe('CPT'));
    icd10Only.forEach(c => expect(c.type).toBe('ICD10'));
  });

  it('identifies pre-auth required procedures', () => {
    const preAuth = getPreAuthRequired(['29888', '97110', '29881']);
    expect(preAuth.length).toBe(2); // 29888 and 29881 require pre-auth
    expect(preAuth.map(c => c.code).sort()).toEqual(['29881', '29888']);
  });
});

describe('clinical-mapper', () => {
  it('maps ACL-related text to CPT 29888', () => {
    const codes = mapTextToCPTCodes('Patient needs ACL reconstruction surgery');
    expect(codes.some(c => c.code === '29888')).toBe(true);
  });

  it('maps meniscectomy text to CPT 29881', () => {
    const codes = mapTextToCPTCodes('Arthroscopy knee with meniscectomy');
    expect(codes.some(c => c.code === '29881')).toBe(true);
  });

  it('maps physical therapy text to CPT 97161 and 97110', () => {
    const codes = mapTextToCPTCodes('Physical therapy evaluation and therapeutic exercises');
    expect(codes.some(c => c.code === '97161')).toBe(true);
    expect(codes.some(c => c.code === '97110')).toBe(true);
  });

  it('maps ACL tear to ICD-10 M23.611', () => {
    const codes = mapTextToICD10Codes('Complete ACL tear of the right knee');
    expect(codes.some(c => c.code === 'M23.611')).toBe(true);
  });

  it('maps meniscus tear to ICD-10 M23.211', () => {
    const codes = mapTextToICD10Codes('Complex tear of the posterior horn of medial meniscus');
    expect(codes.some(c => c.code === 'M23.211')).toBe(true);
  });

  it('maps low back pain to ICD-10 M54.5', () => {
    const codes = mapTextToICD10Codes('Chronic low back pain');
    expect(codes.some(c => c.code === 'M54.5')).toBe(true);
  });

  it('returns empty for unrecognized text', () => {
    const codes = mapTextToCPTCodes('The weather is nice today');
    expect(codes.length).toBe(0);
  });

  it('inferCodesFromDescription extracts both CPT and ICD-10', () => {
    const result = inferCodesFromDescription('ACL reconstruction for ACL tear');
    expect(result.cptCodes.length).toBeGreaterThan(0);
    expect(result.icd10Codes.length).toBeGreaterThan(0);
  });
});

describe('validateProcedureDiagnosisCompatibility', () => {
  it('validates compatible ACL surgery + ACL tear diagnosis', () => {
    const cptCodes = [lookupCPT('29888')!];
    const icd10Codes = [lookupICD10('M23.611')!];
    const result = validateProcedureDiagnosisCompatibility(cptCodes, icd10Codes);
    expect(result.valid).toBe(true);
    expect(result.issues.length).toBe(0);
  });

  it('flags ACL surgery without ACL diagnosis', () => {
    const cptCodes = [lookupCPT('29888')!];
    const icd10Codes = [lookupICD10('M54.5')!]; // back pain, not ACL
    const result = validateProcedureDiagnosisCompatibility(cptCodes, icd10Codes);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('ACL'))).toBe(true);
  });

  it('flags meniscectomy without meniscus diagnosis', () => {
    const cptCodes = [lookupCPT('29881')!];
    const icd10Codes = [lookupICD10('M23.611')!]; // ACL tear only, no meniscus
    const result = validateProcedureDiagnosisCompatibility(cptCodes, icd10Codes);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.includes('Meniscectomy'))).toBe(true);
  });

  it('allows PT procedures without surgical diagnosis', () => {
    const cptCodes = [lookupCPT('97161')!, lookupCPT('97110')!];
    const icd10Codes = [lookupICD10('M54.5')!];
    const result = validateProcedureDiagnosisCompatibility(cptCodes, icd10Codes);
    expect(result.valid).toBe(true);
  });
});
