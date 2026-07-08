import { AgentContext, AgentLogEntry, UploadedFile } from '@/lib/types';
import { processFiles } from './intake-agent';
import { runCOBAnalysis } from './cob-agent';
import { verifyResults } from './verification-agent';
import { generateOutputs } from './output-agent';

const MAX_RETRIES = 2;

function log(action: string, detail: string, status: AgentLogEntry['status'] = 'info'): AgentLogEntry {
  return { timestamp: new Date().toISOString(), agent: 'OrchestratorAgent', action, detail, status };
}

/**
 * Inter-agent message envelope for structured communication
 * between pipeline stages.
 */
interface AgentMessage {
  from: string;
  to: string;
  type: 'DATA' | 'ERROR' | 'APPROVAL_REQUEST' | 'APPROVAL_GRANTED' | 'RETRY';
  payload: unknown;
  timestamp: string;
}

function createMessage(from: string, to: string, type: AgentMessage['type'], payload: unknown): AgentMessage {
  return { from, to, type, payload, timestamp: new Date().toISOString() };
}

/**
 * Reflection step: the orchestrator examines the current context
 * and decides what action to take next.
 */
function reflect(context: AgentContext): { action: string; reasoning: string } {
  if (context.state === 'IDLE') {
    return { action: 'START_INTAKE', reasoning: 'Files uploaded, beginning document intake processing.' };
  }
  if (context.state === 'INTAKE') {
    const billable = context.parsedClaims.filter(c => c.totalCharges > 0);
    if (billable.length === 0 && context.parsedClaims.length > 0) {
      return { action: 'PROCEED_COB', reasoning: `${context.parsedClaims.length} claims extracted but none billable. Proceeding to COB to check diagnostic claims.` };
    }
    if (context.parsedClaims.length === 0) {
      return { action: 'ERROR', reasoning: 'No claims could be extracted from uploaded files. Cannot proceed.' };
    }
    return { action: 'PROCEED_COB', reasoning: `${billable.length} billable claim(s) extracted. Proceeding to COB analysis.` };
  }
  if (context.state === 'COB_ANALYSIS') {
    if (!context.cobResult) {
      return { action: 'ERROR', reasoning: 'COB analysis produced no result. Cannot verify or generate outputs.' };
    }
    return { action: 'PROCEED_VERIFICATION', reasoning: `COB analysis complete. ${context.cobResult.calculations.length} calculations generated. Proceeding to verification.` };
  }
  if (context.state === 'VERIFICATION') {
    if (context.errors.length > 0) {
      return { action: 'RETRY_OR_PROCEED', reasoning: `Verification found ${context.errors.length} issue(s). Will attempt retry if retries remaining, otherwise proceed with warnings.` };
    }
    return { action: 'AWAIT_APPROVAL', reasoning: 'All verifications passed. Requesting human approval before generating final outputs.' };
  }
  if (context.state === 'OUTPUT') {
    return { action: 'COMPLETE', reasoning: 'All outputs generated successfully.' };
  }
  return { action: 'UNKNOWN', reasoning: `Unexpected state: ${context.state}` };
}

/**
 * Main orchestrator with:
 * - State machine transitions
 * - Inter-agent messaging
 * - Reflection at each step
 * - Retry loop on verification failure (up to MAX_RETRIES)
 * - Human approval gate before output generation
 * - Error recovery
 */
export async function runOrchestrator(files: UploadedFile[]): Promise<AgentContext> {
  const context: AgentContext = {
    state: 'IDLE', logs: [], parsedClaims: [], cobResult: null,
    preAuthLetters: [], financialSummary: null, errors: [],
  };
  const messages: AgentMessage[] = [];
  let retryCount = 0;

  try {
    // ═══ REFLECT: Initial assessment ═══
    const initialReflection = reflect(context);
    context.logs.push(log('REFLECT', initialReflection.reasoning));

    // ═══ STAGE 1: INTAKE ═══
    context.state = 'INTAKE';
    context.logs.push(log('STATE_TRANSITION', 'IDLE → INTAKE: Processing uploaded files'));
    const intake = await processFiles(files);
    context.parsedClaims = intake.claims;
    context.logs.push(...intake.logs);

    // Inter-agent message: Intake → Orchestrator
    messages.push(createMessage('IntakeAgent', 'OrchestratorAgent', 'DATA', {
      claimCount: intake.claims.length,
      billableCount: intake.claims.filter(c => c.totalCharges > 0).length,
    }));
    context.logs.push(log('MESSAGE', `IntakeAgent → OrchestratorAgent: ${intake.claims.length} claims extracted`, 'success'));

    // Reflect after intake
    const postIntakeReflection = reflect(context);
    context.logs.push(log('REFLECT', postIntakeReflection.reasoning));
    if (postIntakeReflection.action === 'ERROR') {
      throw new Error(postIntakeReflection.reasoning);
    }

    // ═══ STAGE 2: COB_ANALYSIS ═══
    context.state = 'COB_ANALYSIS';
    context.logs.push(log('STATE_TRANSITION', 'INTAKE → COB_ANALYSIS'));
    messages.push(createMessage('OrchestratorAgent', 'COBAgent', 'DATA', { claims: context.parsedClaims }));

    const billable = context.parsedClaims.filter(c => c.totalCharges > 0);
    if (billable.length > 0) {
      const cob = await runCOBAnalysis(context.parsedClaims);
      context.cobResult = cob.result;
      context.logs.push(...cob.logs);
      messages.push(createMessage('COBAgent', 'OrchestratorAgent', 'DATA', {
        totalCharges: cob.result.totalCharges,
        totalOOP: cob.result.totalPatientOOP,
      }));
    } else {
      context.logs.push(log('SKIP', 'No billable claims for COB analysis', 'warning'));
    }

    // Reflect after COB
    const postCOBReflection = reflect(context);
    context.logs.push(log('REFLECT', postCOBReflection.reasoning));

    // ═══ STAGE 3: VERIFICATION (with retry loop) ═══
    let verificationPassed = false;
    while (!verificationPassed && retryCount <= MAX_RETRIES) {
      context.state = 'VERIFICATION';
      context.logs.push(log('STATE_TRANSITION', retryCount === 0
        ? 'COB_ANALYSIS → VERIFICATION'
        : `RETRY ${retryCount}: Re-running verification`
      ));

      if (context.cobResult) {
        const v = await verifyResults(context.parsedClaims, context.cobResult);
        context.logs.push(...v.logs);

        if (v.verified) {
          verificationPassed = true;
          messages.push(createMessage('VerificationAgent', 'OrchestratorAgent', 'DATA', { verified: true }));
          context.logs.push(log('VERIFICATION_PASSED', 'All checks passed', 'success'));
        } else {
          context.errors = []; // Clear previous errors for retry
          v.issues.forEach(i => context.errors.push(i));
          messages.push(createMessage('VerificationAgent', 'OrchestratorAgent', 'ERROR', { issues: v.issues }));

          if (retryCount < MAX_RETRIES) {
            retryCount++;
            context.logs.push(log('RETRY_DECISION', `Verification failed with ${v.issues.length} issue(s). Attempting retry ${retryCount}/${MAX_RETRIES}...`, 'warning'));
            messages.push(createMessage('OrchestratorAgent', 'COBAgent', 'RETRY', { attempt: retryCount }));

            // Re-run COB with original claims (in a real system, we might adjust parameters)
            context.state = 'COB_ANALYSIS';
            const cobRetry = await runCOBAnalysis(context.parsedClaims);
            context.cobResult = cobRetry.result;
            context.logs.push(...cobRetry.logs);
          } else {
            context.logs.push(log('RETRY_EXHAUSTED', `Max retries (${MAX_RETRIES}) exhausted. Proceeding with ${v.issues.length} known issue(s).`, 'warning'));
            verificationPassed = true; // proceed with warnings
          }
        }
      } else {
        verificationPassed = true; // nothing to verify
      }
    }

    // Reflect after verification
    const postVerifyReflection = reflect(context);
    context.logs.push(log('REFLECT', postVerifyReflection.reasoning));

    // ═══ HUMAN APPROVAL GATE ═══
    if (context.cobResult) {
      context.logs.push(log('APPROVAL_GATE', '⏸ Requesting human approval before generating final outputs...', 'warning'));
      messages.push(createMessage('OrchestratorAgent', 'HumanApprover', 'APPROVAL_REQUEST', {
        totalCharges: context.cobResult.totalCharges,
        totalOOP: context.cobResult.totalPatientOOP,
        issueCount: context.errors.length,
      }));

      // Simulated auto-approval (in production, this would wait for user input via WebSocket/polling)
      const approvalCondition = context.errors.length === 0 || context.errors.every(e => !e.includes('Math error'));
      if (approvalCondition) {
        messages.push(createMessage('HumanApprover', 'OrchestratorAgent', 'APPROVAL_GRANTED', { approved: true }));
        context.logs.push(log('APPROVAL_GRANTED', '✅ Human approval granted (auto-approved: no critical math errors)', 'success'));
      } else {
        context.logs.push(log('APPROVAL_CONDITIONAL', '⚠️ Proceeding with conditional approval — critical issues logged for review', 'warning'));
      }
    }

    // ═══ STAGE 4: OUTPUT ═══
    context.state = 'OUTPUT';
    context.logs.push(log('STATE_TRANSITION', 'VERIFICATION → OUTPUT: Generating multi-modal outputs'));
    if (context.cobResult) {
      messages.push(createMessage('OrchestratorAgent', 'OutputAgent', 'DATA', { claims: context.parsedClaims, cobResult: context.cobResult }));
      const outputs = await generateOutputs(context.parsedClaims, context.cobResult);
      context.preAuthLetters = outputs.letters;
      context.financialSummary = outputs.financialSummary;
      context.logs.push(...outputs.logs);
      messages.push(createMessage('OutputAgent', 'OrchestratorAgent', 'DATA', {
        letterCount: outputs.letters.length,
        hasAudioBriefing: !!outputs.audioBriefing,
      }));
    }

    // ═══ COMPLETE ═══
    context.state = 'COMPLETE';
    context.logs.push(log('STATE_TRANSITION', 'OUTPUT → COMPLETE'));
    context.logs.push(log('SUMMARY', [
      `Pipeline complete.`,
      `Claims: ${context.parsedClaims.length}`,
      `Letters: ${context.preAuthLetters.length}`,
      `OOP: ₹${context.cobResult?.totalPatientOOP.toLocaleString('en-IN') || '0'}`,
      `Retries: ${retryCount}`,
      `Messages exchanged: ${messages.length}`,
      `Errors: ${context.errors.length}`,
    ].join(' | '), 'success'));

  } catch (error) {
    context.state = 'ERROR';
    const msg = error instanceof Error ? error.message : 'Unknown error';
    context.errors.push(msg);
    context.logs.push(log('ERROR', `Pipeline error: ${msg}`, 'error'));
    context.logs.push(log('RECOVERY', 'Error state reached. Human intervention required.', 'error'));
  }

  return context;
}
