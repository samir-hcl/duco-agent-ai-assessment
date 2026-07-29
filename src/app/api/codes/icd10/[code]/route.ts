import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  const dataPath = path.join(process.cwd(), 'data', 'icd10_codes.json');
  const codes = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  const found = codes.find((c: any) => c.code === code);
  if (!found) {
    return NextResponse.json({ error: `ICD-10 code ${code} not found in database` }, { status: 404 });
  }
  return NextResponse.json(found);
}
