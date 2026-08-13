import { NextRequest, NextResponse } from 'next/server';
import { runOrchestrator } from '@/lib/agents/orchestrator-agent';
import { UploadedFile } from '@/lib/types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const files: UploadedFile[] = body.files || [];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided' }, { status: 400 });
    }

    // Attempt to invoke Python ADK Backend on localhost:8000
    try {
      const adkRes = await fetch('http://localhost:8000/api/adk/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
        signal: AbortSignal.timeout(3000),
      });
      if (adkRes.ok) {
        const adkData = await adkRes.json();
        if (adkData?.context?.state) {
          // ADK returned a valid AgentContext — use it directly
          adkData.context.logs.unshift({
            timestamp: new Date().toISOString(),
            agent: 'ADK_Bridge',
            action: 'PYTHON_ADK_CONNECTED',
            detail: '✅ Using Google ADK Python backend (localhost:8000)',
            status: 'success',
          });
          return NextResponse.json({ context: adkData.context });
        }
      }
    } catch {
      // Python ADK server not running; fall through to TS orchestrator
    }

    const context = await runOrchestrator(files);
    return NextResponse.json({ context });
  } catch (error) {
    console.error('Orchestration error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

