import { MedicalCode } from '@/lib/types';

export const CPT_CODES: Record<string, MedicalCode> = {
  '97161': {
    code: '97161',
    type: 'CPT',
    description: 'Physical Therapy Evaluation, Low Complexity',
    category: 'Physical Therapy',
    requiresPreAuth: false,
  },
  '97110': {
    code: '97110',
    type: 'CPT',
    description: 'Therapeutic Exercises to Develop Strength, Endurance, Flexibility, and Range of Motion',
    category: 'Physical Therapy',
    requiresPreAuth: false,
  },
  '29888': {
    code: '29888',
    type: 'CPT',
    description: 'Arthroscopically Aided Anterior Cruciate Ligament (ACL) Repair/Augmentation or Reconstruction',
    category: 'Orthopedic Surgery',
    requiresPreAuth: true,
  },
  '29881': {
    code: '29881',
    type: 'CPT',
    description: 'Arthroscopy, Knee, Surgical; with Meniscectomy (Medial OR Lateral, Including Any Meniscal Shaving)',
    category: 'Orthopedic Surgery',
    requiresPreAuth: true,
  },
};

export const ICD10_CODES: Record<string, MedicalCode> = {
  'M23.611': {
    code: 'M23.611',
    type: 'ICD10',
    description: 'Spontaneous disruption of anterior cruciate ligament of right knee',
    category: 'Musculoskeletal',
    requiresPreAuth: false,
  },
  'M23.212': {
    code: 'M23.212',
    type: 'ICD10',
    description: 'Derangement of anterior horn of medial meniscus due to old tear or injury, left knee',
    category: 'Musculoskeletal',
    requiresPreAuth: false,
  },
  'M23.211': {
    code: 'M23.211',
    type: 'ICD10',
    description: 'Derangement of anterior horn of medial meniscus due to old tear or injury, right knee',
    category: 'Musculoskeletal',
    requiresPreAuth: false,
  },
  'S83.511A': {
    code: 'S83.511A',
    type: 'ICD10',
    description: 'Sprain of anterior cruciate ligament of right knee, initial encounter',
    category: 'Injury',
    requiresPreAuth: false,
  },
  'M54.5': {
    code: 'M54.5',
    type: 'ICD10',
    description: 'Low Back Pain',
    category: 'Musculoskeletal',
    requiresPreAuth: false,
  },
};

export function lookupCPT(code: string): MedicalCode | undefined {
  return CPT_CODES[code];
}

export function lookupICD10(code: string): MedicalCode | undefined {
  return ICD10_CODES[code];
}

export function searchCodes(query: string, type?: 'CPT' | 'ICD10'): MedicalCode[] {
  const allCodes = type === 'CPT'
    ? Object.values(CPT_CODES)
    : type === 'ICD10'
      ? Object.values(ICD10_CODES)
      : [...Object.values(CPT_CODES), ...Object.values(ICD10_CODES)];
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
