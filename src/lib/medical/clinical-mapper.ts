import { MedicalCode } from '@/lib/types';
import { CPT_CODES, ICD10_CODES } from './code-lookup';

interface MappingRule {
  keywords: string[];
  codes: string[];
}

const CPT_MAPPING_RULES: MappingRule[] = [
  {
    keywords: ['physical therapy evaluation', 'pt evaluation', 'pt eval', 'initial evaluation', 'physiotherapy evaluation', 'initial assessment'],
    codes: ['97161'],
  },
  {
    keywords: ['therapeutic exercise', 'exercise therapy', 'therapeutic exercises', 'strengthening exercises', 'range of motion', 'core strengthening', 'lumbar stabilization', 'progressive resistance', 'functional training'],
    codes: ['97110'],
  },
  {
    keywords: ['acl reconstruction', 'acl repair', 'anterior cruciate ligament reconstruction', 'acl surgery', 'acl augmentation'],
    codes: ['29888'],
  },
  {
    keywords: ['meniscectomy', 'meniscus surgery', 'arthroscopy knee', 'knee arthroscopy', 'meniscal shaving', 'partial meniscectomy'],
    codes: ['29881'],
  },
];

const ICD10_MAPPING_RULES: MappingRule[] = [
  {
    keywords: ['acl tear', 'anterior cruciate ligament tear', 'acl rupture', 'torn acl', 'complete tear of anterior cruciate', 'complete disruption of the anterior cruciate'],
    codes: ['M23.611', 'S83.511A'],
  },
  {
    keywords: ['meniscus tear', 'medial meniscus', 'torn meniscus', 'meniscal tear', 'complex tear of the posterior horn'],
    codes: ['M23.211'],
  },
  {
    keywords: ['low back pain', 'back pain', 'chronic back pain', 'lumbago', 'lumbar pain', 'chronic low back'],
    codes: ['M54.5'],
  },
];

export function mapTextToCPTCodes(text: string): MedicalCode[] {
  const lowerText = text.toLowerCase();
  const matchedCodes: Set<string> = new Set();
  for (const rule of CPT_MAPPING_RULES) {
    for (const keyword of rule.keywords) {
      if (lowerText.includes(keyword)) {
        rule.codes.forEach((code) => matchedCodes.add(code));
      }
    }
  }
  return Array.from(matchedCodes)
    .map((code) => CPT_CODES[code])
    .filter((code): code is MedicalCode => code !== undefined);
}

export function mapTextToICD10Codes(text: string): MedicalCode[] {
  const lowerText = text.toLowerCase();
  const matchedCodes: Set<string> = new Set();
  for (const rule of ICD10_MAPPING_RULES) {
    for (const keyword of rule.keywords) {
      if (lowerText.includes(keyword)) {
        rule.codes.forEach((code) => matchedCodes.add(code));
      }
    }
  }
  return Array.from(matchedCodes)
    .map((code) => ICD10_CODES[code])
    .filter((code): code is MedicalCode => code !== undefined);
}

export function inferCodesFromDescription(description: string): {
  cptCodes: MedicalCode[];
  icd10Codes: MedicalCode[];
} {
  return {
    cptCodes: mapTextToCPTCodes(description),
    icd10Codes: mapTextToICD10Codes(description),
  };
}

export function validateProcedureDiagnosisCompatibility(
  cptCodes: MedicalCode[],
  icd10Codes: MedicalCode[]
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const hasSurgicalProcedure = cptCodes.some((c) => c.category === 'Orthopedic Surgery');
  const hasMusculoskeletalDiagnosis = icd10Codes.some(
    (c) => c.category === 'Musculoskeletal' || c.category === 'Injury'
  );
  if (hasSurgicalProcedure && !hasMusculoskeletalDiagnosis) {
    issues.push('Surgical procedure codes present without supporting musculoskeletal diagnosis codes');
  }
  const hasACLSurgery = cptCodes.some((c) => c.code === '29888');
  const hasACLDiagnosis = icd10Codes.some(
    (c) => c.code.startsWith('M23.61') || c.code.startsWith('S83.51')
  );
  if (hasACLSurgery && !hasACLDiagnosis) {
    issues.push('ACL reconstruction procedure (CPT 29888) present without ACL tear diagnosis');
  }
  const hasMeniscectomy = cptCodes.some((c) => c.code === '29881');
  const hasMeniscusDiagnosis = icd10Codes.some((c) => c.code.startsWith('M23.2'));
  if (hasMeniscectomy && !hasMeniscusDiagnosis) {
    issues.push('Meniscectomy procedure (CPT 29881) present without meniscus tear diagnosis');
  }
  return { valid: issues.length === 0, issues };
}
