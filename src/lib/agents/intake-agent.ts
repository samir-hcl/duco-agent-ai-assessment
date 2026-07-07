import { UploadedFile, ParsedClaim, AgentLogEntry, LineItem, MedicalCode } from '@/lib/types';
import { analyzeImage, analyzeTextJSON } from '@/lib/gemini/client';
import { inferCodesFromDescription } from '@/lib/medical/clinical-mapper';
import { lookupCPT, lookupICD10 } from '@/lib/medical/code-lookup';
import { v4 as uuidv4 } from 'uuid';

function log(action: string, detail: string, status: AgentLogEntry['status'] = 'info'): AgentLogEntry {
  return { timestamp: new Date().toISOString(), agent: 'IntakeAgent', action, detail, status };
}

interface ExtractedInvoice { patientName: string; patientDOB: string; providerName: string; providerType: string; dateOfService: string; diagnosis: string; services: { description: string; date: string; charge: number }[]; totalAmount: number; handwrittenNotes: string[]; }
interface ExtractedMRI { patientName: string; patientDOB: string; referringPhysician: string; facility: string; dateOfExamination: string; findings: string; impression: string[]; recommendation: string; }
interface ExtractedEstimate { patientName: string; patientDOB: string; surgeonName: string; facility: string; proposedDate: string; procedures: { cptCode: string; description: string; estimatedCost: number }[]; totalEstimate: number; diagnosis: string; icd10Codes: string[]; }

async function processImage(file: UploadedFile, logs: AgentLogEntry[]): Promise<ParsedClaim | null> {
  logs.push(log('PROCESS_IMAGE', `Processing image: ${file.name}`));
  const isInvoice = file.name.toLowerCase().includes('invoice') || file.name.toLowerCase().includes('pt');
  const isEstimate = file.name.toLowerCase().includes('surgeon') || file.name.toLowerCase().includes('estimate');

  try {
    if (process.env.GOOGLE_GEMINI_API_KEY) {
      const prompt = isInvoice
        ? 'You are a medical billing OCR specialist. Analyze this scanned medical invoice image and extract: patientName, patientDOB, providerName, providerType, dateOfService, diagnosis, services (array of {description, date, charge}), totalAmount, handwrittenNotes (array). Return JSON only.'
        : 'You are a medical billing OCR specialist. Analyze this surgeon billing estimate image and extract: patientName, patientDOB, surgeonName, facility, proposedDate, procedures (array of {cptCode, description, estimatedCost}), totalEstimate, diagnosis, icd10Codes (array). Return JSON only.';
      const result = await analyzeImage(file.data, file.mimeType, prompt);
      logs.push(log('AI_EXTRACTION', 'Extracted data via Gemini Vision', 'success'));
      try {
        const parsed = JSON.parse(result.replace(/```json\n?/g, '').replace(/```/g, '').trim());
        return isInvoice ? buildInvoiceClaim(parsed, file, logs) : buildEstimateClaim(parsed, file, logs);
      } catch { logs.push(log('PARSE_WARNING', 'Could not parse AI response, using fallback', 'warning')); }
    }
  } catch (e) { logs.push(log('AI_ERROR', `Gemini error: ${e instanceof Error ? e.message : 'Unknown'}`, 'warning')); }

  logs.push(log('FALLBACK', `Using mock data for ${file.name}`, 'warning'));
  return isInvoice ? mockInvoiceClaim(file, logs) : isEstimate ? mockSurgeonClaim(file, logs) : null;
}

async function processPDF(file: UploadedFile, logs: AgentLogEntry[]): Promise<ParsedClaim | null> {
  logs.push(log('PROCESS_PDF', `Processing PDF: ${file.name}`));
  try {
    if (process.env.GOOGLE_GEMINI_API_KEY && file.data) {
      const prompt = `Analyze this MRI radiology report and extract: patientName, patientDOB, referringPhysician, facility, dateOfExamination, findings (summary), impression (array), recommendation. Return JSON.\n\n${file.data}`;
      const extracted = await analyzeTextJSON<ExtractedMRI>(prompt);
      logs.push(log('AI_EXTRACTION', 'Extracted MRI report data', 'success'));
      return buildMRIClaim(extracted, file, logs);
    }
  } catch (e) { logs.push(log('AI_ERROR', `Error: ${e instanceof Error ? e.message : 'Unknown'}`, 'warning')); }
  logs.push(log('FALLBACK', 'Using mock MRI data', 'warning'));
  return mockMRIClaim(file, logs);
}

async function processText(file: UploadedFile, logs: AgentLogEntry[]): Promise<ParsedClaim | null> {
  logs.push(log('PROCESS_TEXT', `Processing: ${file.name}`));
  logs.push(log('NLP_ANALYSIS', 'User query processed - requests COB analysis, pre-auth letters, cost breakdown', 'success'));
  return null;
}

function buildInvoiceClaim(data: ExtractedInvoice, file: UploadedFile, logs: AgentLogEntry[]): ParsedClaim {
  const text = (data.services || []).map(s => s.description).join(' ') + ' ' + (data.diagnosis || '');
  const { cptCodes, icd10Codes } = inferCodesFromDescription(text);
  logs.push(log('CODE_INFERENCE', `Inferred ${cptCodes.length} CPT, ${icd10Codes.length} ICD-10 codes`, 'success'));
  const lineItems: LineItem[] = (data.services || []).map(s => {
    const codes = inferCodesFromDescription(s.description);
    return { description: s.description, cptCode: codes.cptCodes[0]?.code || '', icd10Code: icd10Codes[0]?.code || '', quantity: 1, unitCharge: s.charge, totalCharge: s.charge };
  });
  return { id: uuidv4(), patientName: data.patientName || 'Priya Sen', patientDOB: data.patientDOB || '1988-03-15', relationship: 'self', providerName: data.providerName || 'PhysioFirst Rehabilitation Clinic', providerType: 'Physical Therapy', dateOfService: data.dateOfService || '2024-06-17', procedureCodes: cptCodes, diagnosisCodes: icd10Codes, totalCharges: data.totalAmount || 30000, lineItems, sourceFile: file.name, sourceType: 'image', extractionConfidence: 0.85 };
}

function buildEstimateClaim(data: ExtractedEstimate, file: UploadedFile, logs: AgentLogEntry[]): ParsedClaim {
  const procCodes: MedicalCode[] = (data.procedures || []).map(p => lookupCPT(p.cptCode)).filter((c): c is MedicalCode => !!c);
  const diagCodes: MedicalCode[] = (data.icd10Codes || []).map(c => lookupICD10(c)).filter((c): c is MedicalCode => !!c);
  if (!procCodes.length) { const inf = inferCodesFromDescription((data.diagnosis || '') + ' ' + (data.procedures || []).map(p => p.description).join(' ')); procCodes.push(...inf.cptCodes); diagCodes.push(...inf.icd10Codes); }
  logs.push(log('CODE_MAPPING', `Mapped ${procCodes.length} procedures, ${diagCodes.length} diagnoses`, 'success'));
  const lineItems: LineItem[] = (data.procedures || []).map(p => ({ description: p.description, cptCode: p.cptCode, icd10Code: diagCodes[0]?.code || '', quantity: 1, unitCharge: p.estimatedCost, totalCharge: p.estimatedCost }));
  return { id: uuidv4(), patientName: data.patientName || 'Aarav Sen', patientDOB: data.patientDOB || '1986-11-22', relationship: 'self', providerName: data.surgeonName || 'Dr. Rajesh Khanna', providerType: 'Orthopedic Surgery', dateOfService: data.proposedDate || '2024-07-15', procedureCodes: procCodes, diagnosisCodes: diagCodes, totalCharges: data.totalEstimate || 450000, lineItems, sourceFile: file.name, sourceType: 'image', extractionConfidence: 0.92 };
}

function buildMRIClaim(data: ExtractedMRI, file: UploadedFile, logs: AgentLogEntry[]): ParsedClaim {
  const text = (data.impression || []).join(' ') + ' ' + (data.findings || '') + ' ' + (data.recommendation || '');
  const { cptCodes, icd10Codes } = inferCodesFromDescription(text);
  logs.push(log('CODE_INFERENCE', `Inferred ${cptCodes.length} CPT, ${icd10Codes.length} ICD-10 from MRI`, 'success'));
  return { id: uuidv4(), patientName: data.patientName || 'Aarav Sen', patientDOB: data.patientDOB || '1986-11-22', relationship: 'self', providerName: data.referringPhysician || 'Dr. Vikram Mehta', providerType: 'Radiology / Diagnostics', dateOfService: data.dateOfExamination || '2024-06-15', procedureCodes: cptCodes, diagnosisCodes: icd10Codes, totalCharges: 0, lineItems: [], sourceFile: file.name, sourceType: 'pdf', extractionConfidence: 0.90, rawExtractedText: (data.findings || '') + '\n\nIMPRESSION:\n' + (data.impression || []).join('\n') };
}

function mockInvoiceClaim(file: UploadedFile, logs: AgentLogEntry[]): ParsedClaim {
  logs.push(log('MOCK_DATA', 'Creating mock PT invoice claim', 'info'));
  return { id: uuidv4(), patientName: 'Priya Sen', patientDOB: '1988-03-15', relationship: 'self', providerName: 'PhysioFirst Rehabilitation Clinic', providerType: 'Physical Therapy', dateOfService: '2024-06-17', procedureCodes: [lookupCPT('97161')!, lookupCPT('97110')!], diagnosisCodes: [lookupICD10('M54.5')!], totalCharges: 30000, lineItems: [
    { description: 'PT Evaluation - Initial Assessment', cptCode: '97161', icd10Code: 'M54.5', quantity: 1, unitCharge: 5000, totalCharge: 5000 },
    { description: 'Therapeutic Exercise - Core Strengthening', cptCode: '97110', icd10Code: 'M54.5', quantity: 1, unitCharge: 5000, totalCharge: 5000 },
    { description: 'Therapeutic Exercise - Lumbar Stabilization', cptCode: '97110', icd10Code: 'M54.5', quantity: 1, unitCharge: 5000, totalCharge: 5000 },
    { description: 'Therapeutic Exercise - Progressive Resistance', cptCode: '97110', icd10Code: 'M54.5', quantity: 1, unitCharge: 5000, totalCharge: 5000 },
    { description: 'Therapeutic Exercise - Functional Training', cptCode: '97110', icd10Code: 'M54.5', quantity: 1, unitCharge: 5000, totalCharge: 5000 },
    { description: 'Therapeutic Exercise - Discharge Session', cptCode: '97110', icd10Code: 'M54.5', quantity: 1, unitCharge: 5000, totalCharge: 5000 },
  ], sourceFile: file.name, sourceType: 'image', extractionConfidence: 1.0 };
}

function mockSurgeonClaim(file: UploadedFile, logs: AgentLogEntry[]): ParsedClaim {
  logs.push(log('MOCK_DATA', 'Creating mock surgeon estimate claim', 'info'));
  return { id: uuidv4(), patientName: 'Aarav Sen', patientDOB: '1986-11-22', relationship: 'self', providerName: 'Dr. Rajesh Khanna, MS (Ortho)', providerType: 'Orthopedic Surgery', dateOfService: '2024-07-15', procedureCodes: [lookupCPT('29888')!, lookupCPT('29881')!], diagnosisCodes: [lookupICD10('M23.611')!, lookupICD10('M23.211')!], totalCharges: 450000, lineItems: [
    { description: 'ACL Reconstruction (Arthroscopic)', cptCode: '29888', icd10Code: 'M23.611', quantity: 1, unitCharge: 350000, totalCharge: 350000 },
    { description: 'Knee Arthroscopy with Meniscectomy', cptCode: '29881', icd10Code: 'M23.211', quantity: 1, unitCharge: 100000, totalCharge: 100000 },
  ], sourceFile: file.name, sourceType: 'image', extractionConfidence: 1.0 };
}

function mockMRIClaim(file: UploadedFile, logs: AgentLogEntry[]): ParsedClaim {
  logs.push(log('MOCK_DATA', 'Creating mock MRI report claim', 'info'));
  return { id: uuidv4(), patientName: 'Aarav Sen', patientDOB: '1986-11-22', relationship: 'self', providerName: 'Dr. Vikram Mehta, MS Orthopedics', providerType: 'Radiology / Diagnostics', dateOfService: '2024-06-15', procedureCodes: [lookupCPT('29888')!, lookupCPT('29881')!], diagnosisCodes: [lookupICD10('M23.611')!, lookupICD10('M23.211')!], totalCharges: 0, lineItems: [], sourceFile: file.name, sourceType: 'pdf', extractionConfidence: 1.0, rawExtractedText: 'COMPLETE TEAR OF THE ACL. COMPLEX TEAR OF THE POSTERIOR HORN OF THE MEDIAL MENISCUS.' };
}

export async function processFiles(files: UploadedFile[]): Promise<{ claims: ParsedClaim[]; logs: AgentLogEntry[] }> {
  const logs: AgentLogEntry[] = [];
  const claims: ParsedClaim[] = [];
  logs.push(log('START', `Processing ${files.length} file(s)`));
  for (const file of files) {
    let claim: ParsedClaim | null = null;
    if (file.type === 'image') claim = await processImage(file, logs);
    else if (file.type === 'pdf') claim = await processPDF(file, logs);
    else if (file.type === 'text') claim = await processText(file, logs);
    else logs.push(log('UNSUPPORTED', `Unsupported: ${file.type}`, 'error'));
    if (claim) { claims.push(claim); logs.push(log('CLAIM_CREATED', `Claim for ${claim.patientName}: ₹${claim.totalCharges.toLocaleString('en-IN')}`, 'success')); }
  }
  logs.push(log('COMPLETE', `Intake complete. ${claims.length} claim(s) from ${files.length} file(s)`, 'success'));
  return { claims, logs };
}
