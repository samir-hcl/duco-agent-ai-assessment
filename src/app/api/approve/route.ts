import { NextRequest, NextResponse } from 'next/server';
import { runOrchestratorPhase2 } from '@/lib/agents/orchestrator-agent';
import { AgentContext } from '@/lib/types';
import { requireAuth } from '@/lib/auth/middleware';

/**
 * POST /api/approve
 * Phase 2 of the two-phase orchestrator pipeline.
 * Receives the pending AgentContext + approval decision from the human reviewer.
 * Only generates outputs (letters, financial summary, audio) if approved === true.
 */
export async function POST(request: NextRequest) {
  // Authentication: require valid API key for approval actions
  const authError = requireAuth(request);
  if (authError) return authError;

  try {
    const body = await request.json();
    const { context, approved } = body as { context: AgentContext; approved: boolean };

    if (!context) {
      return NextResponse.json({ error: 'Missing context' }, { status: 400 });
    }

    if (typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'Missing approval decision (approved: true|false)' }, { status: 400 });
    }

    const result = await runOrchestratorPhase2(context, approved);
    return NextResponse.json({ context: result });
  } catch (error) {
    console.error('Approve endpoint error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
