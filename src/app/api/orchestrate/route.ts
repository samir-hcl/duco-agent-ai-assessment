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
