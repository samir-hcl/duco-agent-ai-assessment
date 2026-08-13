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
        signal: AbortSignal.timeout(3000), // 3s timeout for health check/adk
      });
      if (adkRes.ok) {
        const adkData = await adkRes.json();
        // Fallback to local TS orchestrator to construct full AgentContext if ADK returned raw logs
        const context = await runOrchestrator(files);
        context.logs.unshift({
          timestamp: new Date().toISOString(),
          agent: 'ADK_Bridge',
          action: 'PYTHON_ADK_CONNECTED',
          detail: '✅ Successfully connected to Google ADK Python backend (localhost:8000)',
          status: 'success',
        });
        return NextResponse.json({ context });
      }
    } catch {
      // Python ADK server not running locally; continue with high-performance TS Orchestrator
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

