import { AgentContext, AgentLogEntry, UploadedFile } from '@/lib/types';
import { processFiles } from './intake-agent';
import { runCOBAnalysis } from './cob-agent';
import { verifyResults } from './verification-agent';
import { generateOutputs } from './output-agent';

function log(action: string, detail: string, status: AgentLogEntry['status'] = 'info'): AgentLogEntry {
  return { timestamp: new Date().toISOString(), agent: 'OrchestratorAgent', action, detail, status };
}

/**
 * Main orchestrator: IDLE → INTAKE → COB_ANALYSIS → VERIFICATION → OUTPUT → COMPLETE
 */
export async function runOrchestrator(files: UploadedFile[]): Promise<AgentContext> {
  const context: AgentContext = {
    state: 'IDLE', logs: [], parsedClaims: [], cobResult: null, preAuthLetters: [], financialSummary: null, errors: [],
  };

  try {
    // INTAKE
    context.state = 'INTAKE';
    context.logs.push(log('STATE_TRANSITION', 'IDLE → INTAKE: Processing uploaded files'));
    const intake = await processFiles(files);
    context.parsedClaims = intake.claims;
    context.logs.push(...intake.logs);
    context.logs.push(log('INTAKE_COMPLETE', `${context.parsedClaims.length} claim(s) extracted`, 'success'));

    // COB_ANALYSIS
    context.state = 'COB_ANALYSIS';
    context.logs.push(log('STATE_TRANSITION', 'INTAKE → COB_ANALYSIS'));
    const billable = context.parsedClaims.filter(c => c.totalCharges > 0);
    if (billable.length > 0) {
      const cob = await runCOBAnalysis(context.parsedClaims);
      context.cobResult = cob.result;
      context.logs.push(...cob.logs);
    } else {
      context.logs.push(log('SKIP', 'No billable claims', 'warning'));
    }

    // VERIFICATION
    context.state = 'VERIFICATION';
    context.logs.push(log('STATE_TRANSITION', 'COB_ANALYSIS → VERIFICATION'));
    if (context.cobResult) {
      const v = await verifyResults(context.parsedClaims, context.cobResult);
      context.logs.push(...v.logs);
      if (!v.verified) { v.issues.forEach(i => context.errors.push(i)); }
    }

    // OUTPUT
    context.state = 'OUTPUT';
    context.logs.push(log('STATE_TRANSITION', 'VERIFICATION → OUTPUT'));
    if (context.cobResult) {
      const outputs = await generateOutputs(context.parsedClaims, context.cobResult);
      context.preAuthLetters = outputs.letters;
      context.financialSummary = outputs.financialSummary;
      context.logs.push(...outputs.logs);
    }

    // COMPLETE
    context.state = 'COMPLETE';
    context.logs.push(log('STATE_TRANSITION', 'OUTPUT → COMPLETE'));
    context.logs.push(log('SUMMARY', `Pipeline complete: ${context.parsedClaims.length} claims, ${context.preAuthLetters.length} letters, OOP: ₹${context.cobResult?.totalPatientOOP.toLocaleString('en-IN') || '0'}`, 'success'));
  } catch (error) {
    context.state = 'ERROR';
    const msg = error instanceof Error ? error.message : 'Unknown error';
    context.errors.push(msg);
    context.logs.push(log('ERROR', `Pipeline error: ${msg}`, 'error'));
  }

  return context;
}
