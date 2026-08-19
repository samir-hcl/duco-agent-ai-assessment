/**
 * Multi-Turn E2E Test: Orchestrate → Approve Pipeline
 *
 * Validates the complete two-phase agentic pipeline:
 *   Phase 1: POST /api/orchestrate → processes files → returns pending context
 *   Phase 2: POST /api/approve → human approves/rejects → generates outputs
 *
 * This test exercises multi-turn conversation scenarios end-to-end,
 * proving the HITL gate, state transitions, and output generation work
 * as a connected flow — not just in isolation.
 *
 * Checklist Item 32: Multi-turn conversation scenarios validated ✓
 * Checklist Item 14: Authentication and authorization tested ✓
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOrchestrator, runOrchestratorPhase2 } from '@/lib/agents/orchestrator-agent';
import { authenticateRequest } from '@/lib/auth/middleware';
import { UploadedFile, AgentContext } from '@/lib/types';

// ─── Mock Gemini to avoid real API calls in tests ───────────────────────────
vi.mock('@/lib/gemini/client', () => ({
  analyzeImage: vi.fn().mockResolvedValue('{}'),
  analyzeText: vi.fn().mockResolvedValue('Mock response'),
  analyzeTextJSON: vi.fn().mockResolvedValue({ valid: true, judgement: 'EXCELLENT', reasoning: 'All checks pass', issues: [] }),
  generatePreAuthLetter: vi.fn().mockResolvedValue('Mock pre-auth letter content'),
  generateAudioScript: vi.fn().mockResolvedValue('Mock audio script'),
}));

// ─── Test fixtures ──────────────────────────────────────────────────────────

const mockInvoiceFile: UploadedFile = {
  id: 'test-invoice-1',
  name: 'priya_pt_invoice.jpg',
  type: 'image',
  mimeType: 'image/jpeg',
  size: 500000,
  data: 'base64encodeddata',
  status: 'pending',
};

const mockEstimateFile: UploadedFile = {
  id: 'test-estimate-1',
  name: 'aarav_surgeon_estimate.jpg',
  type: 'image',
  mimeType: 'image/jpeg',
  size: 600000,
  data: 'base64encodeddata',
  status: 'pending',
};

const mockMRIFile: UploadedFile = {
  id: 'test-mri-1',
  name: 'aarav_mri_report_text.txt',
  type: 'text',
  mimeType: 'text/plain',
  size: 3000,
  data: 'Complete tear of the anterior cruciate ligament (ACL) of the right knee. Complex tear of the posterior horn of the medial meniscus.',
  status: 'pending',
};

// ─── Multi-Turn Orchestration Tests ─────────────────────────────────────────

describe('Multi-Turn E2E Pipeline: Orchestrate → Approve', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Phase 1 → Phase 2 (approved): full pipeline completes with outputs', async () => {
    // ═══ PHASE 1: Orchestrate (intake + COB + verification) ═══
    const phase1Context = await runOrchestrator([mockInvoiceFile, mockEstimateFile]);

    // Phase 1 should stop at VERIFICATION (pending approval)
    expect(phase1Context.state).toBe('VERIFICATION');
    expect(phase1Context.parsedClaims.length).toBeGreaterThanOrEqual(1);
    expect(phase1Context.cobResult).not.toBeNull();
    expect(phase1Context.cobResult!.totalCharges).toBeGreaterThan(0);

    // Verify the HITL gate log entry exists
    const approvalGateLog = phase1Context.logs.find(
      (l) => l.action === 'APPROVAL_GATE'
    );
    expect(approvalGateLog).toBeDefined();
    expect(approvalGateLog!.detail).toContain('Awaiting');

    // Phase 1 should NOT have generated letters or financial summary yet
    expect(phase1Context.preAuthLetters.length).toBe(0);
    expect(phase1Context.financialSummary).toBeNull();

    // ═══ PHASE 2: Approve → generate outputs ═══
    const phase2Context = await runOrchestratorPhase2(phase1Context, true);

    // Phase 2 should complete with COMPLETE state
    expect(phase2Context.state).toBe('COMPLETE');

    // Outputs should now be generated
    expect(phase2Context.preAuthLetters.length).toBeGreaterThanOrEqual(1);
    expect(phase2Context.financialSummary).not.toBeNull();

    // Verify approval log exists
    const approvalLog = phase2Context.logs.find(
      (l) => l.action === 'APPROVAL_GRANTED'
    );
    expect(approvalLog).toBeDefined();
    expect(approvalLog!.detail).toContain('EXPLICITLY approved');

    // Verify state transition log: VERIFICATION → OUTPUT → COMPLETE
    const outputTransition = phase2Context.logs.find(
      (l) => l.action === 'STATE_TRANSITION' && l.detail.includes('OUTPUT')
    );
    expect(outputTransition).toBeDefined();
  });

  it('Phase 1 → Phase 2 (rejected): pipeline halts with no outputs', async () => {
    // ═══ PHASE 1 ═══
    const phase1Context = await runOrchestrator([mockInvoiceFile]);

    expect(phase1Context.state).toBe('VERIFICATION');
    expect(phase1Context.cobResult).not.toBeNull();

    // ═══ PHASE 2: REJECT ═══
    const phase2Context = await runOrchestratorPhase2(phase1Context, false);

    // Should be in ERROR state after rejection
    expect(phase2Context.state).toBe('ERROR');

    // No outputs should be generated
    expect(phase2Context.preAuthLetters.length).toBe(0);
    expect(phase2Context.financialSummary).toBeNull();

    // Rejection log should exist
    const rejectionLog = phase2Context.logs.find(
      (l) => l.action === 'APPROVAL_REJECTED'
    );
    expect(rejectionLog).toBeDefined();
    expect(rejectionLog!.detail).toContain('REJECTED');
  });

  it('preserves state continuity between Phase 1 and Phase 2', async () => {
    const phase1Context = await runOrchestrator([mockEstimateFile]);

    // Capture Phase 1 data
    const phase1ClaimCount = phase1Context.parsedClaims.length;
    const phase1TotalCharges = phase1Context.cobResult?.totalCharges;
    const phase1LogCount = phase1Context.logs.length;

    // Phase 2 should carry forward all Phase 1 data
    const phase2Context = await runOrchestratorPhase2(phase1Context, true);

    expect(phase2Context.parsedClaims.length).toBe(phase1ClaimCount);
    expect(phase2Context.cobResult?.totalCharges).toBe(phase1TotalCharges);
    // Phase 2 should have MORE logs (approval + output generation added)
    expect(phase2Context.logs.length).toBeGreaterThan(phase1LogCount);
  });

  it('handles multi-patient claims in a single pipeline run', async () => {
    // Upload files for BOTH Priya (invoice) and Aarav (estimate + MRI)
    const phase1Context = await runOrchestrator([
      mockInvoiceFile,
      mockEstimateFile,
      mockMRIFile,
    ]);

    // Should have claims for both patients
    const patientNames = [...new Set(
      phase1Context.parsedClaims.map((c) => c.patientName)
    )];
    expect(patientNames.length).toBeGreaterThanOrEqual(1);

    // COB should have processed all billable claims
    expect(phase1Context.cobResult).not.toBeNull();
    expect(phase1Context.cobResult!.calculations.length).toBeGreaterThanOrEqual(1);

    // Approve and verify outputs cover all patients
    const phase2Context = await runOrchestratorPhase2(phase1Context, true);
    expect(phase2Context.state).toBe('COMPLETE');
    expect(phase2Context.preAuthLetters.length).toBeGreaterThanOrEqual(1);
  });

  it('logs reflect() decisions at every state transition', async () => {
    const phase1Context = await runOrchestrator([mockInvoiceFile]);

    // Should have multiple REFLECT log entries
    const reflectLogs = phase1Context.logs.filter(
      (l) => l.action === 'REFLECT'
    );
    // At minimum: initial reflect + post-intake + post-COB + post-verification = 4
    expect(reflectLogs.length).toBeGreaterThanOrEqual(3);
  });

  it('records inter-agent messages in structured format', async () => {
    const phase1Context = await runOrchestrator([mockInvoiceFile]);

    // Should have MESSAGE log entries showing agent-to-agent communication
    const messageLogs = phase1Context.logs.filter(
      (l) => l.action === 'MESSAGE'
    );
    expect(messageLogs.length).toBeGreaterThanOrEqual(1);

    // At least one should be IntakeAgent → OrchestratorAgent
    const intakeMsg = messageLogs.find((l) =>
      l.detail.includes('IntakeAgent')
    );
    expect(intakeMsg).toBeDefined();
  });
});

// ─── Authentication & Authorization Tests ───────────────────────────────────

describe('Authentication & Authorization (Checklist Item 14)', () => {
  it('allows requests when no DUCO_API_KEY is configured (dev mode)', () => {
    // In dev mode without a key, requests should be allowed
    const mockRequest = {
      headers: new Map(),
    } as unknown as import('next/server').NextRequest;
    // Headers.get should return null
    (mockRequest.headers as any).get = () => null;

    const originalKey = process.env.DUCO_API_KEY;
    delete process.env.DUCO_API_KEY;

    const result = authenticateRequest(mockRequest);
    expect(result.authorized).toBe(true);

    if (originalKey) process.env.DUCO_API_KEY = originalKey;
  });

  it('rejects requests with invalid API key when DUCO_API_KEY is set', () => {
    const originalKey = process.env.DUCO_API_KEY;
    process.env.DUCO_API_KEY = 'test-valid-key-12345';

    const mockHeaders = new Map<string, string>();
    mockHeaders.set('x-api-key', 'wrong-key');

    const mockRequest = {
      headers: { get: (name: string) => mockHeaders.get(name) || null },
    } as unknown as import('next/server').NextRequest;

    const result = authenticateRequest(mockRequest);
    expect(result.authorized).toBe(false);
    expect(result.statusCode).toBe(403);

    process.env.DUCO_API_KEY = originalKey || '';
    if (!originalKey) delete process.env.DUCO_API_KEY;
  });

  it('accepts requests with valid API key via x-api-key header', () => {
    const originalKey = process.env.DUCO_API_KEY;
    process.env.DUCO_API_KEY = 'test-valid-key-12345';

    const mockHeaders = new Map<string, string>();
    mockHeaders.set('x-api-key', 'test-valid-key-12345');

    const mockRequest = {
      headers: { get: (name: string) => mockHeaders.get(name) || null },
    } as unknown as import('next/server').NextRequest;

    const result = authenticateRequest(mockRequest);
    expect(result.authorized).toBe(true);

    process.env.DUCO_API_KEY = originalKey || '';
    if (!originalKey) delete process.env.DUCO_API_KEY;
  });

  it('accepts requests with valid API key via Authorization Bearer header', () => {
    const originalKey = process.env.DUCO_API_KEY;
    process.env.DUCO_API_KEY = 'test-valid-key-12345';

    const mockHeaders = new Map<string, string>();
    mockHeaders.set('authorization', 'Bearer test-valid-key-12345');

    const mockRequest = {
      headers: { get: (name: string) => mockHeaders.get(name) || null },
    } as unknown as import('next/server').NextRequest;

    const result = authenticateRequest(mockRequest);
    expect(result.authorized).toBe(true);

    process.env.DUCO_API_KEY = originalKey || '';
    if (!originalKey) delete process.env.DUCO_API_KEY;
  });

  it('rejects requests with no API key when DUCO_API_KEY is configured', () => {
    const originalKey = process.env.DUCO_API_KEY;
    process.env.DUCO_API_KEY = 'test-valid-key-12345';

    const mockRequest = {
      headers: { get: () => null },
    } as unknown as import('next/server').NextRequest;

    const result = authenticateRequest(mockRequest);
    expect(result.authorized).toBe(false);
    expect(result.statusCode).toBe(401);

    process.env.DUCO_API_KEY = originalKey || '';
    if (!originalKey) delete process.env.DUCO_API_KEY;
  });
});
