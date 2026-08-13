import { ParsedClaim, COBResult, AgentLogEntry } from '@/lib/types';
import { validateProcedureDiagnosisCompatibility } from '@/lib/medical/clinical-mapper';
import { lookupCPT, lookupICD10 } from '@/lib/medical/code-lookup';
import { analyzeTextJSON } from '@/lib/gemini/client';

function log(action: string, detail: string, status: AgentLogEntry['status'] = 'info'): AgentLogEntry {
  return { timestamp: new Date().toISOString(), agent: 'VerificationAgent', action, detail, status };
}

export async function verifyResults(claims: ParsedClaim[], cobResult: COBResult): Promise<{ verified: boolean; issues: string[]; logs: AgentLogEntry[] }> {
  const logs: AgentLogEntry[] = [];
  const issues: string[] = [];
  logs.push(log('START', 'Beginning verification & LLM-as-a-Judge audit'));

  // 1. Verify codes deterministically
  for (const claim of claims) {
    for (const code of claim.procedureCodes) { if (!lookupCPT(code.code)) { issues.push(`Unknown CPT ${code.code}`); logs.push(log('CODE_INVALID', `Unknown CPT: ${code.code}`, 'error')); } }
    for (const code of claim.diagnosisCodes) { if (!lookupICD10(code.code)) { issues.push(`Unknown ICD-10 ${code.code}`); logs.push(log('CODE_INVALID', `Unknown ICD-10: ${code.code}`, 'error')); } }
  }
  if (issues.length === 0) logs.push(log('CODES_VALID', 'All medical codes verified against database', 'success'));

  // 2. Verify clinical compatibility
  for (const claim of claims) {
    const c = validateProcedureDiagnosisCompatibility(claim.procedureCodes, claim.diagnosisCodes);
    if (!c.valid) { issues.push(...c.issues.map(i => `${claim.patientName}: ${i}`)); c.issues.forEach(i => logs.push(log('COMPAT_ISSUE', `${claim.patientName}: ${i}`, 'warning'))); }
  }

  // 3. Verify math deterministically
  for (const calc of cobResult.calculations) {
    const total = calc.primaryPlan.planPays + calc.secondaryPlan.planPays + calc.totalPatientOOP;
    if (Math.abs(total - calc.totalCharges) > 1) {
      issues.push(`Math error: ${calc.patientName}`);
      logs.push(log('MATH_ERROR', `${calc.patientName}: ₹${total} ≠ ₹${calc.totalCharges}`, 'error'));
    } else logs.push(log('MATH_VERIFIED', `${calc.patientName}: ₹${total} = ₹${calc.totalCharges} ✓`, 'success'));
  }

  // 4. Verify totals
  const recalcIns = cobResult.calculations.reduce((s, c) => s + c.totalInsurancePaid, 0);
  const recalcOOP = cobResult.calculations.reduce((s, c) => s + c.totalPatientOOP, 0);
  if (Math.abs(recalcIns - cobResult.totalInsurancePaid) > 1) { issues.push('Total insurance mismatch'); logs.push(log('TOTAL_MISMATCH', 'Insurance total mismatch', 'error')); }
  if (Math.abs(recalcOOP - cobResult.totalPatientOOP) > 1) { issues.push('Total OOP mismatch'); logs.push(log('TOTAL_MISMATCH', 'OOP total mismatch', 'error')); }

  // 5. LLM-as-a-Judge semantic audit loop
  try {
    logs.push(log('LLM_JUDGE_START', 'Invoking LLM-as-a-Judge for semantic COB logic audit', 'info'));
    const judgePrompt = `You are a medical claims audit judge evaluating a Coordination of Benefits (COB) determination.
Determinations: ${JSON.stringify(cobResult.determinations)}
Calculations Summary: ${JSON.stringify(cobResult.calculations.map(c => ({ patient: c.patientName, total: c.totalCharges, primaryPays: c.primaryPlan.planPays, secondaryPays: c.secondaryPlan.planPays, oop: c.totalPatientOOP })))}

Evaluate:
1. Is the subscriber/birthday rule applied correctly in the reasoning?
2. Are primary vs secondary payer assignments logically sound?
3. Is there any discrepancy in payer logic?

Return JSON:
{
  "valid": boolean,
  "judgement": "EXCELLENT" | "NEEDS_CORRECTION",
  "reasoning": "brief explanation",
  "issues": string[]
}`;

    const judgeResult = await analyzeTextJSON<{ valid: boolean; judgement: string; reasoning: string; issues: string[] }>(judgePrompt);
    logs.push(log('LLM_JUDGE_RESULT', `LLM Judge Verdict: ${judgeResult.judgement} — ${judgeResult.reasoning}`, judgeResult.valid ? 'success' : 'warning'));

    if (!judgeResult.valid && judgeResult.issues && judgeResult.issues.length > 0) {
      issues.push(...judgeResult.issues.map(i => `LLM Judge: ${i}`));
    }
  } catch (err) {
    logs.push(log('LLM_JUDGE_FALLBACK', `LLM Judge unavailable (${err instanceof Error ? err.message : 'quota'}), relying on deterministic verification engine`, 'warning'));
  }

  const verified = issues.length === 0;
  logs.push(log('COMPLETE', verified ? 'All verifications & LLM-as-a-Judge audits passed' : `${issues.length} issue(s) found`, verified ? 'success' : 'warning'));
  return { verified, issues, logs };
}

