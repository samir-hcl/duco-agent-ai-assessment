import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const procedureCodes: string[] = body.procedureCodes || [];
  
  const dataPath = path.join(process.cwd(), 'data', 'preauth_rules.json');
  const rules = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  
  const matchingRules = rules.filter((rule: any) => {
    const applicable = rule.applicableCPTCodes || [];
    // If no specific codes listed, it's a general rule (like inpatient)
    if (applicable.length === 0) return false;
    return procedureCodes.some((code: string) => applicable.includes(code));
  });

  return NextResponse.json({
    requiresPreAuth: matchingRules.length > 0,
    matchingRules,
    procedureCodesChecked: procedureCodes,
  });
}
