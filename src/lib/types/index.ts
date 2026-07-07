// ============================================
// DuCO-Agent Type Definitions
// ============================================

export type AgentState = 'IDLE' | 'INTAKE' | 'COB_ANALYSIS' | 'VERIFICATION' | 'OUTPUT' | 'COMPLETE' | 'ERROR';

export interface AgentLogEntry {
  timestamp: string;
  agent: string;
  action: string;
  detail: string;
  status: 'info' | 'success' | 'warning' | 'error';
}

export interface AgentContext {
  state: AgentState;
  logs: AgentLogEntry[];
  parsedClaims: ParsedClaim[];
  cobResult: COBResult | null;
  preAuthLetters: PreAuthLetter[];
  financialSummary: FinancialSummary | null;
  errors: string[];
}

export interface UploadedFile {
  id: string;
  name: string;
  type: 'image' | 'pdf' | 'text';
  mimeType: string;
  size: number;
  data: string;
  status: 'pending' | 'processing' | 'parsed' | 'error';
  preview?: string;
}

export interface MedicalCode {
  code: string;
  type: 'CPT' | 'ICD10';
  description: string;
  category: string;
  requiresPreAuth: boolean;
}

export interface ParsedClaim {
  id: string;
  patientName: string;
  patientDOB: string;
  relationship: 'self' | 'spouse' | 'dependent';
  providerName: string;
  providerType: string;
  dateOfService: string;
  procedureCodes: MedicalCode[];
  diagnosisCodes: MedicalCode[];
  totalCharges: number;
  lineItems: LineItem[];
  sourceFile: string;
  sourceType: 'image' | 'pdf' | 'text';
  extractionConfidence: number;
  rawExtractedText?: string;
}

export interface LineItem {
  description: string;
  cptCode: string;
  icd10Code: string;
  quantity: number;
  unitCharge: number;
  totalCharge: number;
}

export interface InsurancePlan {
  id: string;
  name: string;
  insurerName: string;
  policyNumber: string;
  planType: 'PPO' | 'HMO' | 'EPO' | 'POS';
  primaryHolder: PatientInfo;
  dependents: PatientInfo[];
  deductible: DeductibleInfo;
  coinsurance: CoinsuranceInfo;
  outOfPocketMax: OOPMaxInfo;
  preAuthRequirements: PreAuthRequirement[];
  networkProviders: string[];
  coverageStart: string;
  coverageEnd: string;
}

export interface PatientInfo {
  name: string;
  dateOfBirth: string;
  relationship: 'self' | 'spouse' | 'dependent';
  memberId: string;
}

export interface DeductibleInfo {
  individual: number;
  family: number;
  individualMet: number;
  familyMet: number;
}

export interface CoinsuranceInfo {
  inNetwork: number;
  outOfNetwork: number;
}

export interface OOPMaxInfo {
  individual: number;
  family: number;
  individualMet: number;
  familyMet: number;
}

export interface PreAuthRequirement {
  condition: string;
  description: string;
}

export type PrimaryDetermination = 'PLAN_A' | 'PLAN_B';
export type DeterminationRule = 'BIRTHDAY_RULE' | 'SUBSCRIBER_RULE' | 'DEPENDENT_RULE';

export interface COBDetermination {
  patient: string;
  primaryPlan: PrimaryDetermination;
  secondaryPlan: PrimaryDetermination;
  rule: DeterminationRule;
  reasoning: string;
}

export interface ClaimCalculation {
  claimId: string;
  patientName: string;
  totalCharges: number;
  primaryPlan: {
    planId: string;
    planName: string;
    deductibleApplied: number;
    deductibleRemaining: number;
    eligibleAmount: number;
    coinsuranceRate: number;
    planPays: number;
    patientResponsibility: number;
  };
  secondaryPlan: {
    planId: string;
    planName: string;
    amountSubmitted: number;
    deductibleApplied: number;
    deductibleRemaining: number;
    eligibleAmount: number;
    coinsuranceRate: number;
    planPays: number;
    patientResponsibility: number;
  };
  totalInsurancePaid: number;
  totalPatientOOP: number;
  savings: number;
}

export interface COBResult {
  determinations: COBDetermination[];
  calculations: ClaimCalculation[];
  totalCharges: number;
  totalInsurancePaid: number;
  totalPatientOOP: number;
  totalSavings: number;
  flowData: CostFlowData;
}

export interface CostFlowNode {
  id: string;
  label: string;
  value: number;
  color: string;
}

export interface CostFlowLink {
  source: string;
  target: string;
  value: number;
  label: string;
}

export interface CostFlowData {
  nodes: CostFlowNode[];
  links: CostFlowLink[];
}

export interface PreAuthLetter {
  id: string;
  claimId: string;
  patientName: string;
  insurerName: string;
  planName: string;
  letterType: 'primary' | 'secondary';
  content: string;
  generatedAt: string;
  procedures: MedicalCode[];
  diagnoses: MedicalCode[];
  estimatedCost: number;
}

export interface FinancialSummary {
  claims: ClaimCalculation[];
  totalCharges: number;
  totalPrimaryPaid: number;
  totalSecondaryPaid: number;
  totalPatientOOP: number;
  savingsFromCOB: number;
  breakdown: {
    category: string;
    amount: number;
    percentage: number;
  }[];
}

export interface AudioBriefing {
  script: string;
  sections: {
    title: string;
    content: string;
  }[];
}

export interface OrchestrateRequest {
  files: UploadedFile[];
}

export interface OrchestrateResponse {
  context: AgentContext;
}
