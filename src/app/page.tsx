'use client';

import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import type { AgentContext, UploadedFile, AgentState, AgentLogEntry, COBResult, PreAuthLetter, FinancialSummary, ClaimCalculation, CostFlowData } from '@/lib/types';

// ============ ICONS (inline SVG to avoid dependency issues) ============
const Icons = {
  Upload: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>,
  FileText: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>,
  Image: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>,
  Check: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>,
  AlertCircle: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>,
  Play: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>,
  Pause: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/></svg>,
  Copy: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
  Download: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>,
  Zap: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>,
  X: () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>,
};

const AGENT_STATES: { state: AgentState; label: string; icon: string }[] = [
  { state: 'IDLE', label: 'Ready', icon: '⏳' },
  { state: 'INTAKE', label: 'Document Intake', icon: '📄' },
  { state: 'COB_ANALYSIS', label: 'COB Analysis', icon: '🔬' },
  { state: 'VERIFICATION', label: 'Verification', icon: '✅' },
  { state: 'OUTPUT', label: 'Output Generation', icon: '📝' },
  { state: 'COMPLETE', label: 'Complete', icon: '🎉' },
];

function fmt(n: number): string { return `₹${n.toLocaleString('en-IN')}`; }

// ============ COST FLOW VISUALIZATION ============
function CostFlowDiagram({ data }: { data: CostFlowData }) {
  const total = data.nodes.find(n => n.id.startsWith('claim-'))?.value || 1;
  const maxVal = Math.max(...data.nodes.map(n => n.value), 1);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.nodes.filter(n => !n.id.startsWith('claim-')).map(node => (
          <Card key={node.id} className="border-2" style={{ borderColor: node.color }}>
            <CardContent className="pt-4 pb-4">
              <div className="text-sm text-muted-foreground mb-1">{node.label.split(' - ')[0]}</div>
              <div className="text-2xl font-bold" style={{ color: node.color }}>{fmt(node.value)}</div>
              <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${(node.value / maxVal) * 100}%`, backgroundColor: node.color }} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader><CardTitle className="text-lg">Payment Flow</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.links.map((link, i) => {
              const pct = ((link.value / total) * 100).toFixed(1);
              const color = link.target === 'primary-insurance' ? '#10b981' : link.target === 'secondary-insurance' ? '#3b82f6' : '#ef4444';
              return (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-muted-foreground truncate">{link.source.replace('claim-', '').substring(0, 8)}...</div>
                  <div className="flex-1 h-8 bg-muted rounded-lg overflow-hidden relative">
                    <div className="h-full rounded-lg transition-all duration-1000 flex items-center px-3" style={{ width: `${Math.max(Number(pct), 5)}%`, backgroundColor: color }}>
                      <span className="text-xs font-medium text-white whitespace-nowrap">{fmt(link.value)}</span>
                    </div>
                  </div>
                  <div className="w-32 text-xs text-muted-foreground">{link.label.split(' ₹')[0]}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============ AUDIO BRIEFING ============
function AudioBriefingPlayer({ script, sections }: { script: string; sections: { title: string; content: string }[] }) {
  const [playing, setPlaying] = useState(false);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  const toggle = () => {
    if (playing) { window.speechSynthesis.cancel(); setPlaying(false); return; }
    const utterance = new SpeechSynthesisUtterance(script || sections.map(s => `${s.title}. ${s.content}`).join('. '));
    utterance.rate = 0.9; utterance.pitch = 1;
    utterance.onend = () => setPlaying(false);
    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setPlaying(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">🔊 Audio Briefing</CardTitle>
        <CardDescription>Listen to a patient-friendly summary</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={toggle} variant={playing ? "destructive" : "default"} className="w-full" size="lg">
          {playing ? <><Icons.Pause /> Stop Playback</> : <><Icons.Play /> Play Audio Briefing</>}
        </Button>
        <Accordion>
          {sections.map((s, i) => (
            <AccordionItem key={i} value={`section-${i}`}>
              <AccordionTrigger className="text-sm">{s.title}</AccordionTrigger>
              <AccordionContent><p className="text-sm text-muted-foreground leading-relaxed">{s.content}</p></AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

// ============ PRE-AUTH LETTER ============
function PreAuthLetterCard({ letter }: { letter: PreAuthLetter }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(letter.content); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const downloadTxt = () => {
    const blob = new Blob([letter.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `pre-auth-${letter.patientName.replace(/\s/g, '_')}-${letter.letterType}.txt`; a.click();
    URL.revokeObjectURL(url);
  };
  const downloadPdf = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Pre-Auth Letter — ${letter.patientName}</title>
      <style>body{font-family:'Segoe UI',Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#1a1a1a;line-height:1.7;font-size:13px}
      h1{font-size:18px;border-bottom:2px solid #4f46e5;padding-bottom:8px;color:#4f46e5}
      .meta{color:#666;font-size:11px;margin-bottom:20px}
      pre{white-space:pre-wrap;font-family:'Segoe UI',Arial,sans-serif;font-size:13px}
      .footer{margin-top:30px;padding-top:15px;border-top:1px solid #ddd;color:#888;font-size:10px;text-align:center}
      </style></head><body>
      <h1>Pre-Authorization Letter — ${letter.letterType === 'primary' ? 'Primary' : 'Secondary'} Insurance</h1>
      <div class="meta">Patient: ${letter.patientName} | Insurer: ${letter.insurerName} | Generated: ${new Date(letter.generatedAt).toLocaleDateString()}</div>
      <pre>${letter.content}</pre>
      <div class="footer">Generated by DuCO-Agent • Coordination of Benefits AI System</div>
      </body></html>`);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{letter.patientName} — {letter.letterType === 'primary' ? 'Primary' : 'Secondary'}</CardTitle>
            <CardDescription>{letter.insurerName}</CardDescription>
          </div>
          <Badge variant={letter.letterType === 'primary' ? 'default' : 'secondary'}>{letter.letterType}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-3">
          <Button size="sm" variant="outline" onClick={copy}>{copied ? <><Icons.Check /> Copied</> : <><Icons.Copy /> Copy</>}</Button>
          <Button size="sm" variant="outline" onClick={downloadTxt}><Icons.Download /> TXT</Button>
          <Button size="sm" variant="default" onClick={downloadPdf}><Icons.Download /> PDF</Button>
        </div>
        <ScrollArea className="h-80 rounded-lg border bg-muted/30 p-4">
          <pre className="text-sm whitespace-pre-wrap font-mono leading-relaxed">{letter.content}</pre>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

// ============ AGENT LOG ============
function AgentLog({ logs }: { logs: AgentLogEntry[] }) {
  const statusColors: Record<string, string> = { info: 'text-blue-400', success: 'text-emerald-400', warning: 'text-amber-400', error: 'text-red-400' };
  const statusIcons: Record<string, string> = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };

  return (
    <ScrollArea className="h-96">
      <div className="space-y-1 font-mono text-xs">
        {logs.map((entry, i) => (
          <div key={i} className={`flex gap-2 py-1 px-2 rounded hover:bg-muted/50 ${statusColors[entry.status]}`}>
            <span>{statusIcons[entry.status]}</span>
            <span className="text-muted-foreground w-14 shrink-0">{new Date(entry.timestamp).toLocaleTimeString()}</span>
            <Badge variant="outline" className="text-[10px] h-4 shrink-0">{entry.agent}</Badge>
            <span className="font-semibold shrink-0">[{entry.action}]</span>
            <span className="text-muted-foreground">{entry.detail}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

// ============ MAIN PAGE ============
export default function Home() {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [context, setContext] = useState<AgentContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeTab, setActiveTab] = useState('upload');
  const [showApproval, setShowApproval] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getFileType = (file: File): UploadedFile['type'] => {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type === 'application/pdf') return 'pdf';
    return 'text';
  };

  const readFileAsBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { const result = reader.result as string; resolve(result.split(',')[1] || result); };
    reader.onerror = reject;
    if (file.type.startsWith('image/') || file.type === 'application/pdf') reader.readAsDataURL(file);
    else reader.readAsText(file);
  });

  const handleFiles = useCallback(async (fileList: FileList) => {
    const newFiles: UploadedFile[] = [];
    for (const file of Array.from(fileList)) {
      const data = await readFileAsBase64(file);
      newFiles.push({
        id: Math.random().toString(36).substring(7),
        name: file.name, type: getFileType(file), mimeType: file.type || 'text/plain',
        size: file.size, data, status: 'pending',
      });
    }
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const loadDemoFiles = async () => {
    // Fetch actual committed sample files so the full pipeline is exercised
    const fetchAsBase64 = async (url: string): Promise<string> => {
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1] || '');
          reader.readAsDataURL(blob);
        });
      } catch { return ''; }
    };
    const fetchAsText = async (url: string): Promise<string> => {
      try { const res = await fetch(url); return await res.text(); } catch { return ''; }
    };

    const [invoiceData, estimateData, mriText, queryText] = await Promise.all([
      fetchAsBase64('/mock-data/priya_pt_invoice.jpg'),
      fetchAsBase64('/mock-data/aarav_surgeon_estimate.jpg'),
      fetchAsText('/mock-data/aarav_mri_report_text.txt'),
      fetchAsText('/mock-data/user_query.txt'),
    ]);

    setFiles([
      { id: 'demo-1', name: 'priya_pt_invoice.jpg', type: 'image', mimeType: 'image/jpeg', size: invoiceData.length, data: invoiceData, status: 'pending' },
      { id: 'demo-2', name: 'aarav_mri_report.pdf', type: 'pdf', mimeType: 'application/pdf', size: mriText.length, data: mriText, status: 'pending' },
      { id: 'demo-3', name: 'aarav_surgeon_estimate.jpg', type: 'image', mimeType: 'image/jpeg', size: estimateData.length, data: estimateData, status: 'pending' },
      { id: 'demo-4', name: 'user_query.txt', type: 'text', mimeType: 'text/plain', size: queryText.length, data: queryText, status: 'pending' },
    ]);
  };

  const runAnalysis = async () => {
    setLoading(true); setProgress(10);
    try {
      setProgress(25);
      // ═══ PHASE 1: Intake → COB → Verification (stops before output) ═══
      const response = await fetch('/api/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      setProgress(75);
      if (!response.ok) throw new Error(`API error: ${response.status}`);
      const data = await response.json();
      setContext(data.context);
      setProgress(100);
      // Phase 1 returns pendingApproval — show blocking modal
      if (data.context?.cobResult) {
        setShowApproval(true);
      } else {
        setActiveTab('results');
      }
    } catch (error) {
      console.error('Analysis failed:', error);
      alert(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (approved: boolean) => {
    setShowApproval(false);
    if (!context) return;

    setLoading(true);
    setProgress(85);
    try {
      // ═══ PHASE 2: Call /api/approve with approval decision ═══
      const response = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context, approved }),
      });
      if (!response.ok) throw new Error(`Approve API error: ${response.status}`);
      const data = await response.json();
      setContext(data.context);
      setProgress(100);
      setActiveTab(approved ? 'results' : 'logs');
    } catch (error) {
      console.error('Approval failed:', error);
      // Fallback: log the decision client-side if API fails
      const updatedContext = { ...context };
      updatedContext.logs = [...context.logs, {
        timestamp: new Date().toISOString(),
        agent: 'HumanApprover',
        action: approved ? 'APPROVAL_GRANTED' : 'APPROVAL_REJECTED',
        detail: approved
          ? '✅ Human reviewer explicitly approved the COB analysis and letter generation.'
          : '❌ Human reviewer rejected the analysis.',
        status: (approved ? 'success' : 'error') as 'success' | 'error',
      }];
      setContext(updatedContext);
      setActiveTab(approved ? 'results' : 'logs');
    } finally {
      setLoading(false);
    }
  };

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));

  const currentStateIndex = context ? AGENT_STATES.findIndex(s => s.state === context.state) : -1;

  return (
    <>
    {/* ═══ HUMAN APPROVAL GATE MODAL ═══ */}
    {showApproval && context?.cobResult && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" id="approval-gate-modal">
        <div className="bg-card border border-border rounded-2xl shadow-2xl max-w-lg w-full mx-4 p-8 space-y-6 animate-in fade-in zoom-in-95 duration-300">
          <div className="text-center space-y-2">
            <div className="text-5xl">⏸️</div>
            <h2 className="text-2xl font-bold">Human Approval Required</h2>
            <p className="text-muted-foreground text-sm">Review the COB analysis below before generating pre-authorization letters and final outputs.</p>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
              <span className="text-sm text-muted-foreground">Total Charges</span>
              <span className="font-bold text-lg">{fmt(context.cobResult.totalCharges)}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-emerald-500/10">
              <span className="text-sm text-muted-foreground">Insurance Covers</span>
              <span className="font-bold text-lg text-emerald-400">{fmt(context.cobResult.totalInsurancePaid)}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-red-500/10">
              <span className="text-sm text-muted-foreground">Your Out-of-Pocket</span>
              <span className="font-bold text-lg text-red-400">{fmt(context.cobResult.totalPatientOOP)}</span>
            </div>
            {context.errors.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 text-amber-400 text-sm">
                ⚠️ {context.errors.length} verification issue(s) found — review recommended
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              id="approval-reject-btn"
              onClick={() => handleApproval(false)}
              className="flex-1 px-4 py-3 rounded-xl border border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors font-medium"
            >
              ✕ Reject
            </button>
            <button
              id="approval-approve-btn"
              onClick={() => handleApproval(true)}
              className="flex-1 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors shadow-lg"
            >
              ✓ Approve & Generate Letters
            </button>
          </div>
        </div>
      </div>
    )}
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <Icons.Zap />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">DuCO-Agent</h1>
              <p className="text-xs text-muted-foreground">Dual Coverage Coordination of Benefits AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {context?.state === 'COMPLETE' && <Badge variant="default" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Analysis Complete</Badge>}
            {loading && <Badge variant="secondary" className="animate-pulse">Processing...</Badge>}
          </div>
        </div>
      </header>

      {/* Pipeline Progress */}
      {(loading || context) && (
        <div className="border-b bg-card/30">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              {AGENT_STATES.slice(1).map((s, i) => {
                const isActive = context?.state === s.state;
                const isDone = currentStateIndex > i + 1 || context?.state === 'COMPLETE';
                return (
                  <React.Fragment key={s.state}>
                    {i > 0 && <div className={`flex-1 h-0.5 ${isDone ? 'bg-emerald-500' : 'bg-muted'}`} />}
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${isActive ? 'bg-indigo-500/20 text-indigo-400 ring-1 ring-indigo-500/30' : isDone ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      <span>{isDone ? '✅' : isActive ? '⏳' : s.icon}</span>
                      <span className="hidden sm:inline">{s.label}</span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
            {loading && <Progress value={progress} className="mt-2 h-1" />}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="upload">📄 Upload</TabsTrigger>
            <TabsTrigger value="results" disabled={!context}>📊 Results</TabsTrigger>
            <TabsTrigger value="letters" disabled={!context?.preAuthLetters?.length}>📝 Letters</TabsTrigger>
            <TabsTrigger value="logs" disabled={!context?.logs?.length}>🔍 Agent Log</TabsTrigger>
          </TabsList>

          {/* UPLOAD TAB */}
          <TabsContent value="upload">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Upload Zone */}
                <Card className="border-dashed border-2 hover:border-indigo-500/50 transition-colors">
                  <CardContent className="pt-6">
                    <div
                      className="flex flex-col items-center justify-center py-10 cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                      onDrop={e => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
                    >
                      <div className="h-16 w-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-4">
                        <Icons.Upload />
                      </div>
                      <p className="text-lg font-semibold mb-1">Drop files here or click to upload</p>
                      <p className="text-sm text-muted-foreground">Supports PNG, JPG, PDF, TXT</p>
                      <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt" className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
                    </div>
                  </CardContent>
                </Card>

                {/* Demo Files Button */}
                <Button variant="outline" className="w-full" onClick={loadDemoFiles} disabled={loading}>
                  <Icons.Zap /> Load Demo Files (Priya PT Invoice + Aarav MRI + Surgeon Estimate + Query)
                </Button>

                {/* File List */}
                {files.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Uploaded Files ({files.length})</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {files.map(f => (
                        <div key={f.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                          <div className="flex items-center gap-3">
                            {f.type === 'image' ? <Icons.Image /> : <Icons.FileText />}
                            <div>
                              <p className="text-sm font-medium">{f.name}</p>
                              <p className="text-xs text-muted-foreground">{f.type.toUpperCase()} • {f.size > 0 ? `${(f.size / 1024).toFixed(1)} KB` : 'Demo'}</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => removeFile(f.id)}><Icons.X /></Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Run Button */}
                {files.length > 0 && (
                  <Button className="w-full h-14 text-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500" onClick={runAnalysis} disabled={loading}>
                    {loading ? (
                      <><span className="animate-spin mr-2">⚙️</span> Processing...</>
                    ) : (
                      <><Icons.Zap /> Run DuCO-Agent Analysis</>
                    )}
                  </Button>
                )}
              </div>

              {/* Scenario Info */}
              <div className="space-y-4">
                <Card className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
                  <CardHeader><CardTitle className="text-lg">📋 Scenario</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-3">
                    <div><strong>Priya Sen</strong> (Primary on Plan A) — PT bills ₹30,000</div>
                    <div><strong>Aarav Sen</strong> (Primary on Plan B) — ACL Surgery ₹4,50,000</div>
                    <Separator />
                    <div className="text-xs text-muted-foreground">
                      Both are cross-enrolled as dependents on each other&apos;s plans, creating dual coverage. The system determines primary/secondary per the Subscriber Rule and coordinates benefits to minimize OOP costs.
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-lg">🏥 Insurance Plans</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-3">
                    <div>
                      <Badge className="mb-1">Plan A — Insurer1 (PPO)</Badge>
                      <p className="text-xs text-muted-foreground">Deductible: ₹50K | Coinsurance: 80/20 | OOP Max: ₹3L</p>
                    </div>
                    <div>
                      <Badge variant="secondary" className="mb-1">Plan B — Insurer2 (HMO)</Badge>
                      <p className="text-xs text-muted-foreground">Deductible: ₹30K | Coinsurance: 70/30 | OOP Max: ₹4L</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* RESULTS TAB */}
          <TabsContent value="results">
            {loading && (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" />
              </div>
            )}
            {context?.cobResult && context.financialSummary && (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="border-indigo-500/30 bg-indigo-500/5">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Total Charges</p>
                      <p className="text-3xl font-bold text-indigo-400">{fmt(context.cobResult.totalCharges)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-emerald-500/30 bg-emerald-500/5">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Insurance Covers</p>
                      <p className="text-3xl font-bold text-emerald-400">{fmt(context.cobResult.totalInsurancePaid)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-red-500/30 bg-red-500/5">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">Your Out-of-Pocket</p>
                      <p className="text-3xl font-bold text-red-400">{fmt(context.cobResult.totalPatientOOP)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardContent className="pt-4">
                      <p className="text-sm text-muted-foreground">COB Savings</p>
                      <p className="text-3xl font-bold text-amber-400">{fmt(context.cobResult.totalSavings)}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* COB Determination */}
                <Card>
                  <CardHeader><CardTitle>🔍 COB Determination</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {context.cobResult.determinations.map((d, i) => (
                      <Alert key={i}>
                        <Icons.AlertCircle />
                        <AlertTitle>{d.patient} — {d.rule.replace(/_/g, ' ')}</AlertTitle>
                        <AlertDescription className="text-sm mt-1">
                          <strong>Primary:</strong> {d.primaryPlan} | <strong>Secondary:</strong> {d.secondaryPlan}
                          <br /><span className="text-muted-foreground">{d.reasoning}</span>
                        </AlertDescription>
                      </Alert>
                    ))}
                  </CardContent>
                </Card>

                {/* Claims Breakdown Table */}
                <Card>
                  <CardHeader><CardTitle>💰 Claims Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                          <TableHead className="text-right">Primary Ded.</TableHead>
                          <TableHead className="text-right">Primary Pays</TableHead>
                          <TableHead className="text-right">Secondary Ded.</TableHead>
                          <TableHead className="text-right">Secondary Pays</TableHead>
                          <TableHead className="text-right">Patient OOP</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {context.cobResult.calculations.map((c: ClaimCalculation) => (
                          <TableRow key={c.claimId}>
                            <TableCell className="font-medium">{c.patientName}</TableCell>
                            <TableCell className="text-right">{fmt(c.totalCharges)}</TableCell>
                            <TableCell className="text-right text-amber-400">{fmt(c.primaryPlan.deductibleApplied)}</TableCell>
                            <TableCell className="text-right text-emerald-400">{fmt(c.primaryPlan.planPays)}</TableCell>
                            <TableCell className="text-right text-amber-400">{fmt(c.secondaryPlan.deductibleApplied)}</TableCell>
                            <TableCell className="text-right text-blue-400">{fmt(c.secondaryPlan.planPays)}</TableCell>
                            <TableCell className="text-right text-red-400 font-bold">{fmt(c.totalPatientOOP)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="font-bold border-t-2">
                          <TableCell>TOTAL</TableCell>
                          <TableCell className="text-right">{fmt(context.cobResult.totalCharges)}</TableCell>
                          <TableCell className="text-right text-amber-400">{fmt(context.cobResult.calculations.reduce((s: number, c: ClaimCalculation) => s + c.primaryPlan.deductibleApplied, 0))}</TableCell>
                          <TableCell className="text-right text-emerald-400">{fmt(context.cobResult.calculations.reduce((s: number, c: ClaimCalculation) => s + c.primaryPlan.planPays, 0))}</TableCell>
                          <TableCell className="text-right text-amber-400">{fmt(context.cobResult.calculations.reduce((s: number, c: ClaimCalculation) => s + c.secondaryPlan.deductibleApplied, 0))}</TableCell>
                          <TableCell className="text-right text-blue-400">{fmt(context.cobResult.calculations.reduce((s: number, c: ClaimCalculation) => s + c.secondaryPlan.planPays, 0))}</TableCell>
                          <TableCell className="text-right text-red-400">{fmt(context.cobResult.totalPatientOOP)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Cost Flow */}
                <Card>
                  <CardHeader><CardTitle>📊 Cost Flow Visualization</CardTitle></CardHeader>
                  <CardContent>
                    <CostFlowDiagram data={context.cobResult.flowData} />
                  </CardContent>
                </Card>

                {/* Financial Summary Breakdown */}
                {context.financialSummary && (
                  <Card>
                    <CardHeader><CardTitle>📋 Financial Summary Breakdown</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      {context.financialSummary.breakdown.map((b, i) => (
                        <div key={i} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{b.category}</span>
                            <span className="font-semibold">{fmt(b.amount)} ({b.percentage}%)</span>
                          </div>
                          <div className="h-3 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{
                                width: `${Math.max(b.percentage, 2)}%`,
                                backgroundColor: i === 0 ? '#10b981' : i === 1 ? '#3b82f6' : '#ef4444',
                              }}
                            />
                          </div>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex justify-between text-sm font-bold">
                        <span>COB Dual-Coverage Savings</span>
                        <span className="text-amber-400">{fmt(context.financialSummary.savingsFromCOB)}</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Audio Briefing — dynamically constructed from actual calculation data */}
                {context.cobResult && (
                  <AudioBriefingPlayer
                    script=""
                    sections={(() => {
                      const calcs = context.cobResult!.calculations as ClaimCalculation[];
                      const sections: { title: string; content: string }[] = [
                        { title: 'Introduction', content: `Hello. Here is your insurance coordination of benefits analysis for ${[...new Set(calcs.map(c => c.patientName))].join(' and ')}.` },
                      ];
                      calcs.forEach((c: ClaimCalculation) => {
                        sections.push({
                          title: `${c.patientName}'s Claim`,
                          content: `${c.patientName}'s total charges are ${fmt(c.totalCharges)}. The primary plan (${c.primaryPlan.planName}) pays ${fmt(c.primaryPlan.planPays)} after a ${fmt(c.primaryPlan.deductibleApplied)} deductible at ${c.primaryPlan.coinsuranceRate}% coinsurance. The secondary plan (${c.secondaryPlan.planName}) picks up an additional ${fmt(c.secondaryPlan.planPays)}. ${c.patientName}'s out-of-pocket is ${fmt(c.totalPatientOOP)}.`,
                        });
                      });
                      sections.push(
                        { title: 'Total Summary', content: `Across all claims: total charges ${fmt(context.cobResult!.totalCharges)}, insurance covers ${fmt(context.cobResult!.totalInsurancePaid)}, your combined out-of-pocket is ${fmt(context.cobResult!.totalPatientOOP)}. Dual coverage saved you ${fmt(context.cobResult!.totalSavings)}.` },
                        { title: 'Next Steps', content: 'Submit the pre-authorization letters generated in the Letters tab to both insurers. For each patient, submit to the primary insurer first, then the secondary insurer with the primary EOB attached.' },
                      );
                      return sections;
                    })()}
                  />
                )}

                {/* Errors */}
                {context.errors.length > 0 && (
                  <Alert variant="destructive">
                    <Icons.AlertCircle />
                    <AlertTitle>Verification Issues</AlertTitle>
                    <AlertDescription>
                      <ul className="list-disc pl-4 mt-2">{context.errors.map((e, i) => <li key={i} className="text-sm">{e}</li>)}</ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </TabsContent>

          {/* LETTERS TAB */}
          <TabsContent value="letters">
            {context?.preAuthLetters && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {context.preAuthLetters.map((letter: PreAuthLetter) => <PreAuthLetterCard key={letter.id} letter={letter} />)}
              </div>
            )}
          </TabsContent>

          {/* LOGS TAB */}
          <TabsContent value="logs">
            {context?.logs && (
              <Card>
                <CardHeader>
                  <CardTitle>🔍 Agent Reasoning Log ({context.logs.length} entries)</CardTitle>
                  <CardDescription>Full trace of agent decisions, state transitions, and actions</CardDescription>
                </CardHeader>
                <CardContent>
                  <AgentLog logs={context.logs} />
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t mt-12 py-6 text-center text-sm text-muted-foreground">
        <p>DuCO-Agent — Multi-Modal AI Coordination of Benefits System</p>
        <p className="text-xs mt-1">Built with Next.js, shadcn/ui, and Google Gemini 2.0 Flash</p>
      </footer>
    </div>
    </>
  );
}
