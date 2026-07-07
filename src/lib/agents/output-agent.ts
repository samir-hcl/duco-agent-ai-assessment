import { ParsedClaim, COBResult, PreAuthLetter, FinancialSummary, AudioBriefing, AgentLogEntry, ClaimCalculation } from '@/lib/types';
import { generatePreAuthLetter as geminiLetter, generateAudioScript } from '@/lib/gemini/client';
import { PLAN_A, PLAN_B } from '@/lib/insurance/mock-plans';
import { getPreAuthRequired } from '@/lib/medical/code-lookup';

function log(action: string, detail: string, status: AgentLogEntry['status'] = 'info'): AgentLogEntry {
  return { timestamp: new Date().toISOString(), agent: 'OutputAgent', action, detail, status };
}

function fallbackLetter(claim: ParsedClaim, calc: ClaimCalculation, isPrimary: boolean): string {
  const plan = isPrimary ? (calc.primaryPlan.planId === 'plan-a' ? PLAN_A : PLAN_B) : (calc.secondaryPlan.planId === 'plan-a' ? PLAN_A : PLAN_B);
  const today = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  return `${today}

To,
The Medical Director / Pre-Authorization Department
${plan.insurerName}
Policy No: ${plan.policyNumber}

Subject: Request for Pre-Authorization – ${isPrimary ? 'Primary' : 'Secondary'} Coverage

Dear Sir/Madam,

I am writing to request pre-authorization for the following medical procedure(s).

━━━ PATIENT INFORMATION ━━━
Patient Name: ${claim.patientName}
Date of Birth: ${claim.patientDOB}
Member ID: ${isPrimary ? plan.primaryHolder.memberId : plan.dependents[0]?.memberId || 'N/A'}
Relationship: ${isPrimary ? 'Primary Subscriber' : 'Dependent/Spouse'}

━━━ PROVIDER INFORMATION ━━━
Provider: ${claim.providerName}
Provider Type: ${claim.providerType}
Proposed Date of Service: ${claim.dateOfService}

━━━ CLINICAL INFORMATION ━━━
Diagnosis:
${claim.diagnosisCodes.map(d => `  • ${d.code} – ${d.description}`).join('\n')}

Proposed Procedure(s):
${claim.procedureCodes.map(p => `  • ${p.code} – ${p.description}`).join('\n')}

Estimated Total Cost: ₹${claim.totalCharges.toLocaleString('en-IN')}

━━━ CLINICAL JUSTIFICATION ━━━
The proposed procedure(s) are medically necessary based on clinical findings:
${claim.providerType.includes('Surgery') ? '- MRI confirms complete ACL tear and medial meniscus tear requiring surgical intervention\n- Conservative management is not appropriate for the severity of injury' : '- Physical therapy is prescribed for chronic low back pain management and functional restoration'}
- The treating physician recommends the above procedure(s) as standard of care.

━━━ COORDINATION OF BENEFITS (COB) NOTICE ━━━
This is a ${isPrimary ? 'PRIMARY' : 'SECONDARY'} claim under Coordination of Benefits.
${!isPrimary ? `Primary insurer (${calc.primaryPlan.planName}) billed ₹${calc.totalCharges.toLocaleString('en-IN')}.
Primary plan expected payment: ₹${calc.primaryPlan.planPays.toLocaleString('en-IN')}
Amount submitted to secondary: ₹${calc.secondaryPlan.amountSubmitted.toLocaleString('en-IN')}` : `Patient also has secondary coverage under ${calc.secondaryPlan.planName}.`}

━━━ REQUESTED ACTION ━━━
Please review and approve pre-authorization. Kindly issue the authorization number at your earliest convenience.

Sincerely,
${claim.providerName}
On behalf of ${claim.patientName}

Enclosures: MRI Report, Surgeon's Estimate, Treatment Plan`;
}

export async function generateOutputs(claims: ParsedClaim[], cobResult: COBResult): Promise<{ letters: PreAuthLetter[]; financialSummary: FinancialSummary; audioBriefing: AudioBriefing; logs: AgentLogEntry[] }> {
  const logs: AgentLogEntry[] = [];
  const letters: PreAuthLetter[] = [];
  logs.push(log('START', 'Generating outputs'));

  const billable = claims.filter(c => c.totalCharges > 0);

  for (const claim of billable) {
    const calc = cobResult.calculations.find(c => c.claimId === claim.id);
    if (!calc) continue;
    const preAuth = getPreAuthRequired(claim.procedureCodes.map(c => c.code));
    if (preAuth.length === 0 && claim.totalCharges < 100000) { logs.push(log('SKIP_LETTER', `No pre-auth needed for ${claim.patientName}`, 'info')); continue; }

    // Primary letter
    let primaryContent: string;
    try {
      if (process.env.GOOGLE_GEMINI_API_KEY) {
        primaryContent = await geminiLetter(`Generate a professional pre-authorization request letter to insurance. PRIMARY claim.\nPatient: ${claim.patientName}, DOB: ${claim.patientDOB}\nInsurer: ${calc.primaryPlan.planName}\nProvider: ${claim.providerName} (${claim.providerType})\nDiagnoses: ${claim.diagnosisCodes.map(d => `${d.code} - ${d.description}`).join(', ')}\nProcedures: ${claim.procedureCodes.map(p => `${p.code} - ${p.description}`).join(', ')}\nCost: ₹${claim.totalCharges.toLocaleString('en-IN')}\nCOB: Primary claim, secondary coverage exists.\nWrite formal, clinically sound letter with medical necessity justification. Currency in INR.`);
        logs.push(log('AI_LETTER', `AI primary letter for ${claim.patientName}`, 'success'));
      } else { primaryContent = fallbackLetter(claim, calc, true); logs.push(log('FALLBACK_LETTER', `Fallback primary letter for ${claim.patientName}`, 'info')); }
    } catch { primaryContent = fallbackLetter(claim, calc, true); logs.push(log('FALLBACK_LETTER', 'Fallback used', 'info')); }
    letters.push({ id: `letter-${claim.id}-primary`, claimId: claim.id, patientName: claim.patientName, insurerName: calc.primaryPlan.planName, planName: calc.primaryPlan.planId === 'plan-a' ? 'Plan A' : 'Plan B', letterType: 'primary', content: primaryContent, generatedAt: new Date().toISOString(), procedures: claim.procedureCodes, diagnoses: claim.diagnosisCodes, estimatedCost: claim.totalCharges });

    // Secondary letter
    let secondaryContent: string;
    try {
      if (process.env.GOOGLE_GEMINI_API_KEY) {
        secondaryContent = await geminiLetter(`Generate a professional pre-authorization request letter. SECONDARY claim under COB.\nPatient: ${claim.patientName}, DOB: ${claim.patientDOB}\nSecondary Insurer: ${calc.secondaryPlan.planName}\nPrimary Insurer: ${calc.primaryPlan.planName} (pays ₹${calc.primaryPlan.planPays.toLocaleString('en-IN')})\nAmount to secondary: ₹${calc.secondaryPlan.amountSubmitted.toLocaleString('en-IN')}\nProcedures: ${claim.procedureCodes.map(p => `${p.code} - ${p.description}`).join(', ')}\nDiagnoses: ${claim.diagnosisCodes.map(d => `${d.code} - ${d.description}`).join(', ')}\nWrite formal COB secondary claim letter. Currency in INR.`);
        logs.push(log('AI_LETTER', `AI secondary letter for ${claim.patientName}`, 'success'));
      } else { secondaryContent = fallbackLetter(claim, calc, false); logs.push(log('FALLBACK_LETTER', `Fallback secondary letter`, 'info')); }
    } catch { secondaryContent = fallbackLetter(claim, calc, false); }
    letters.push({ id: `letter-${claim.id}-secondary`, claimId: claim.id, patientName: claim.patientName, insurerName: calc.secondaryPlan.planName, planName: calc.secondaryPlan.planId === 'plan-a' ? 'Plan A' : 'Plan B', letterType: 'secondary', content: secondaryContent, generatedAt: new Date().toISOString(), procedures: claim.procedureCodes, diagnoses: claim.diagnosisCodes, estimatedCost: calc.secondaryPlan.amountSubmitted });
  }

  logs.push(log('LETTERS_DONE', `Generated ${letters.length} letter(s)`, 'success'));

  const totalPrimary = cobResult.calculations.reduce((s, c) => s + c.primaryPlan.planPays, 0);
  const totalSecondary = cobResult.calculations.reduce((s, c) => s + c.secondaryPlan.planPays, 0);

  const financialSummary: FinancialSummary = {
    claims: cobResult.calculations, totalCharges: cobResult.totalCharges,
    totalPrimaryPaid: totalPrimary, totalSecondaryPaid: totalSecondary,
    totalPatientOOP: cobResult.totalPatientOOP, savingsFromCOB: cobResult.totalSavings,
    breakdown: [
      { category: 'Primary Insurance', amount: totalPrimary, percentage: Math.round((totalPrimary / cobResult.totalCharges) * 100) },
      { category: 'Secondary Insurance', amount: totalSecondary, percentage: Math.round((totalSecondary / cobResult.totalCharges) * 100) },
      { category: 'Patient Out-of-Pocket', amount: cobResult.totalPatientOOP, percentage: Math.round((cobResult.totalPatientOOP / cobResult.totalCharges) * 100) },
    ],
  };

  // Audio briefing
  const aaravCalc = cobResult.calculations.find(c => c.patientName.includes('Aarav'));
  const priyaCalc = cobResult.calculations.find(c => c.patientName.includes('Priya'));
  let audioBriefing: AudioBriefing;

  try {
    if (process.env.GOOGLE_GEMINI_API_KEY) {
      const script = await generateAudioScript(`Generate a patient-friendly 2-min audio briefing explaining COB results.\nAarav's surgery: ₹${aaravCalc?.totalCharges.toLocaleString('en-IN') || '4,50,000'}, Primary Plan B pays ₹${aaravCalc?.primaryPlan.planPays.toLocaleString('en-IN') || '0'}, Secondary Plan A pays ₹${aaravCalc?.secondaryPlan.planPays.toLocaleString('en-IN') || '0'}.\nPriya's PT: ₹${priyaCalc?.totalCharges.toLocaleString('en-IN') || '30,000'}.\nTotal OOP: ₹${cobResult.totalPatientOOP.toLocaleString('en-IN')}. Savings: ₹${cobResult.totalSavings.toLocaleString('en-IN')}. Currency INR.`);
      audioBriefing = { script, sections: [{ title: 'Full Briefing', content: script }] };
      logs.push(log('AI_AUDIO', 'AI audio script generated', 'success'));
    } else throw new Error('No key');
  } catch {
    audioBriefing = { script: '', sections: [
      { title: 'Introduction', content: `Hello Aarav and Priya. Here is your insurance coordination of benefits analysis summary.` },
      { title: "Aarav's Surgery", content: `For Aarav's ACL reconstruction and meniscectomy, total cost ₹${aaravCalc?.totalCharges.toLocaleString('en-IN') || '4,50,000'}. Plan B (primary) pays ₹${aaravCalc?.primaryPlan.planPays.toLocaleString('en-IN') || '0'} after ₹${aaravCalc?.primaryPlan.deductibleApplied.toLocaleString('en-IN') || '30,000'} deductible. Plan A (secondary) pays additional ₹${aaravCalc?.secondaryPlan.planPays.toLocaleString('en-IN') || '0'}.` },
      { title: "Priya's PT", content: `Priya's physical therapy totals ₹${priyaCalc?.totalCharges.toLocaleString('en-IN') || '30,000'}. Plan A (primary) covers most after deductible. Plan B provides secondary coverage.` },
      { title: 'Summary', content: `Total medical charges: ₹${cobResult.totalCharges.toLocaleString('en-IN')}. Insurance covers: ₹${cobResult.totalInsurancePaid.toLocaleString('en-IN')}. Your out-of-pocket: ₹${cobResult.totalPatientOOP.toLocaleString('en-IN')}. COB savings: ₹${cobResult.totalSavings.toLocaleString('en-IN')}.` },
      { title: 'Next Steps', content: 'Submit pre-authorization letters to both insurers. For Aarav, submit to Insurer2 first (primary), then Insurer1 (secondary). For Priya, submit to Insurer1 first. Include MRI report and surgeon estimate as enclosures.' },
    ] };
    audioBriefing.script = audioBriefing.sections.map(s => `${s.title}:\n${s.content}`).join('\n\n');
    logs.push(log('FALLBACK_AUDIO', 'Fallback audio script', 'info'));
  }

  logs.push(log('COMPLETE', 'All outputs generated', 'success'));
  return { letters, financialSummary, audioBriefing, logs };
}
