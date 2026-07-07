import { ParsedClaim, COBResult, AgentLogEntry } from '@/lib/types';
import { validateProcedureDiagnosisCompatibility } from '@/lib/medical/clinical-mapper';
import { lookupCPT, lookupICD10 } from '@/lib/medical/code-lookup';

function log(action: string, detail: string, status: AgentLogEntry['status'] = 'info'): AgentLogEntry {
  return { timestamp: new Date().toISOString(), agent: 'VerificationAgent', action, detail, status };
}

export async function verifyResults(claims: ParsedClaim[], cobResult: COBResult): Promise<{ verified: boolean; issues: string[]; logs: AgentLogEntry[] }> {
  const logs: AgentLogEntry[] = [];
  const issues: string[] = [];
  logs.push(log('START', 'Beginning verification'));

  // Verify codes
  for (const claim of claims) {
    for (const code of claim.procedureCodes) { if (!lookupCPT(code.code)) { issues.push(`Unknown CPT ${code.code}`); logs.push(log('CODE_INVALID', `Unknown CPT: ${code.code}`, 'error')); } }
    for (const code of claim.diagnosisCodes) { if (!lookupICD10(code.code)) { issues.push(`Unknown ICD-10 ${code.code}`); logs.push(log('CODE_INVALID', `Unknown ICD-10: ${code.code}`, 'error')); } }
  }
  if (issues.length === 0) logs.push(log('CODES_VALID', 'All medical codes verified', 'success'));

  // Verify compatibility
  for (const claim of claims) {
    const c = validateProcedureDiagnosisCompatibility(claim.procedureCodes, claim.diagnosisCodes);
    if (!c.valid) { issues.push(...c.issues.map(i => `${claim.patientName}: ${i}`)); c.issues.forEach(i => logs.push(log('COMPAT_ISSUE', `${claim.patientName}: ${i}`, 'warning'))); }
  }

  // Verify math
  for (const calc of cobResult.calculations) {
    const total = calc.primaryPlan.planPays + calc.secondaryPlan.planPays + calc.totalPatientOOP;
    if (Math.abs(total - calc.totalCharges) > 1) {
      issues.push(`Math error: ${calc.patientName}`);
      logs.push(log('MATH_ERROR', `${calc.patientName}: ₹${total} ≠ ₹${calc.totalCharges}`, 'error'));
    } else logs.push(log('MATH_VERIFIED', `${calc.patientName}: ₹${total} = ₹${calc.totalCharges} ✓`, 'success'));
  }

  // Verify totals
  const recalcIns = cobResult.calculations.reduce((s, c) => s + c.totalInsurancePaid, 0);
  const recalcOOP = cobResult.calculations.reduce((s, c) => s + c.totalPatientOOP, 0);
  if (Math.abs(recalcIns - cobResult.totalInsurancePaid) > 1) { issues.push('Total insurance mismatch'); logs.push(log('TOTAL_MISMATCH', 'Insurance total mismatch', 'error')); }
  if (Math.abs(recalcOOP - cobResult.totalPatientOOP) > 1) { issues.push('Total OOP mismatch'); logs.push(log('TOTAL_MISMATCH', 'OOP total mismatch', 'error')); }

  const verified = issues.length === 0;
  logs.push(log('COMPLETE', verified ? 'All verifications passed' : `${issues.length} issue(s) found`, verified ? 'success' : 'warning'));
  return { verified, issues, logs };
}
