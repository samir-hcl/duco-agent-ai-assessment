import { ParsedClaim, COBResult, AgentLogEntry } from '@/lib/types';
import { processCOB, determinePrimaryPlan } from '@/lib/insurance/cob-engine';
import { validateProcedureDiagnosisCompatibility } from '@/lib/medical/clinical-mapper';
import { getPreAuthRequired } from '@/lib/medical/code-lookup';

function log(action: string, detail: string, status: AgentLogEntry['status'] = 'info'): AgentLogEntry {
  return { timestamp: new Date().toISOString(), agent: 'COBAgent', action, detail, status };
}

export async function runCOBAnalysis(claims: ParsedClaim[]): Promise<{ result: COBResult; logs: AgentLogEntry[] }> {
  const logs: AgentLogEntry[] = [];
  logs.push(log('START', `Beginning COB analysis for ${claims.length} claim(s)`));

  const billable = claims.filter((c) => c.totalCharges > 0);
  const diagnostic = claims.filter((c) => c.totalCharges === 0);
  logs.push(log('FILTER', `${billable.length} billable, ${diagnostic.length} diagnostic-only`));

  for (const claim of billable) {
    const v = validateProcedureDiagnosisCompatibility(claim.procedureCodes, claim.diagnosisCodes);
    if (!v.valid) logs.push(log('VALIDATION_WARNING', `${claim.patientName}: ${v.issues.join('; ')}`, 'warning'));
    else logs.push(log('VALIDATION_PASS', `${claim.patientName}: procedure-diagnosis codes compatible`, 'success'));
  }

  for (const claim of billable) {
    const preAuth = getPreAuthRequired(claim.procedureCodes.map((c) => c.code));
    if (preAuth.length > 0) logs.push(log('PREAUTH_REQUIRED', `${claim.patientName}: Pre-auth REQUIRED for ${preAuth.map((c) => `${c.code} (${c.description})`).join(', ')}`, 'warning'));
    else logs.push(log('PREAUTH_CHECK', `${claim.patientName}: No pre-auth required`, 'info'));
  }

  const names = [...new Set(billable.map((c) => c.patientName))];
  for (const name of names) {
    const d = determinePrimaryPlan(name);
    logs.push(log('COB_DETERMINATION', `${d.patient}: Primary=${d.primaryPlan}, Secondary=${d.secondaryPlan} (${d.rule})`, 'success'));
    logs.push(log('COB_REASONING', d.reasoning));
  }

  logs.push(log('CALCULATION', 'Running COB payment calculations...'));
  const result = processCOB(billable);

  for (const c of result.calculations) {
    logs.push(log('RESULT', `${c.patientName}: Total ₹${c.totalCharges.toLocaleString('en-IN')} | Primary ₹${c.primaryPlan.planPays.toLocaleString('en-IN')} | Secondary ₹${c.secondaryPlan.planPays.toLocaleString('en-IN')} | OOP ₹${c.totalPatientOOP.toLocaleString('en-IN')}`, 'success'));
  }

  logs.push(log('SUMMARY', `Total: ₹${result.totalCharges.toLocaleString('en-IN')} | Insured: ₹${result.totalInsurancePaid.toLocaleString('en-IN')} | OOP: ₹${result.totalPatientOOP.toLocaleString('en-IN')} | Savings: ₹${result.totalSavings.toLocaleString('en-IN')}`, 'success'));
  logs.push(log('COMPLETE', 'COB analysis complete', 'success'));
  return { result, logs };
}
