import { MedicalCode } from '@/lib/types';
import fs from 'fs';
import path from 'path';

// Load from JSON database files instead of hardcoded objects
function loadCPTCodes(): Record<string, MedicalCode> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'cpt_codes.json');
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const result: Record<string, MedicalCode> = {};
    for (const entry of raw) {
      result[entry.code] = {
        code: entry.code,
        type: entry.type,
        description: entry.description,
        category: entry.category,
        requiresPreAuth: entry.requiresPreAuth,
      };
    }
    return result;
  } catch {
    // Fallback for client-side or build-time when fs is unavailable
    return {};
  }
}

function loadICD10Codes(): Record<string, MedicalCode> {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'icd10_codes.json');
    const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    const result: Record<string, MedicalCode> = {};
    for (const entry of raw) {
      result[entry.code] = {
        code: entry.code,
        type: entry.type,
        description: entry.description,
        category: entry.category,
        requiresPreAuth: entry.requiresPreAuth,
      };
    }
    return result;
  } catch {
    return {};
  }
}

// Lazy-loaded singletons
let _cptCodes: Record<string, MedicalCode> | null = null;
let _icd10Codes: Record<string, MedicalCode> | null = null;

function getCPTCodes(): Record<string, MedicalCode> {
  if (!_cptCodes) _cptCodes = loadCPTCodes();
  return _cptCodes;
}

function getICD10Codes(): Record<string, MedicalCode> {
  if (!_icd10Codes) _icd10Codes = loadICD10Codes();
  return _icd10Codes;
}

// Public API (same signatures as before)
export function lookupCPT(code: string): MedicalCode | undefined {
  return getCPTCodes()[code];
}

export function lookupICD10(code: string): MedicalCode | undefined {
  return getICD10Codes()[code];
}

export function searchCodes(query: string, type?: 'CPT' | 'ICD10'): MedicalCode[] {
  const allCodes = type === 'CPT'
    ? Object.values(getCPTCodes())
    : type === 'ICD10'
      ? Object.values(getICD10Codes())
      : [...Object.values(getCPTCodes()), ...Object.values(getICD10Codes())];
  const lowerQuery = query.toLowerCase();
  return allCodes.filter(
    (code) =>
      code.code.toLowerCase().includes(lowerQuery) ||
      code.description.toLowerCase().includes(lowerQuery) ||
      code.category.toLowerCase().includes(lowerQuery)
  );
}

export function getPreAuthRequired(codes: string[]): MedicalCode[] {
  return codes
    .map((code) => lookupCPT(code) || lookupICD10(code))
    .filter((code): code is MedicalCode => code !== undefined && code.requiresPreAuth);
}

// Re-export for backward compatibility
export const CPT_CODES = getCPTCodes();
export const ICD10_CODES = getICD10Codes();
