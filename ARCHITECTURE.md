# DuCO-Agent Architecture

## System Overview

DuCO-Agent implements a multi-agent pipeline architecture for Coordination of Benefits (COB) analysis. The system processes multi-modal medical documents, determines insurance primary/secondary status, calculates benefit coordination, and generates actionable outputs.

## Agent Pipeline Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR AGENT                        │
│                                                              │
│  State Machine: IDLE → INTAKE → COB → VERIFY → OUTPUT       │
│                                                              │
├──────────┬──────────┬──────────────┬─────────────────────────┤
│          │          │              │                          │
│  Intake  │   COB    │ Verification │     Output              │
│  Agent   │  Agent   │    Agent     │     Agent               │
│          │          │              │                          │
│ • OCR    │ • Sub-   │ • Code       │ • Pre-Auth Letters      │
│ • PDF    │   scriber│   validation │ • Financial Summary     │
│ • NLP    │   Rule   │ • Math       │ • Audio Briefing        │
│ • Code   │ • Deduct-│   checks     │ • Agent Log             │
│   Infer  │   ibles  │ • Compliance │                          │
│          │ • Coins. │              │                          │
└──────────┴──────────┴──────────────┴─────────────────────────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
     ┌──────┴──────┐ ┌───┴────┐ ┌──────┴──────┐
     │   Medical   │ │ Gemini │ │  Insurance  │
     │   Library   │ │ Client │ │   Library   │
     │             │ │        │ │             │
     │ • CPT Codes │ │ • OCR  │ │ • Plan A/B  │
     │ • ICD-10    │ │ • NLP  │ │ • Deductible│
     │ • Clinical  │ │ • Gen. │ │ • COB Engine│
     │   Mapper    │ │        │ │             │
     └─────────────┘ └────────┘ └─────────────┘
```

## Data Flow

1. **Upload** → User uploads files (images, PDFs, text)
2. **Intake** → Multi-modal processing extracts structured claims
3. **COB Analysis** → Determines primary/secondary, calculates payments
4. **Verification** → Cross-checks codes, math, compliance
5. **Output** → Generates letters, summaries, audio briefing
6. **Display** → Results shown in interactive dashboard

## Key Design Decisions

### 1. Subscriber Rule for COB Determination
The system uses the **Subscriber Rule** (not Birthday Rule) as primary determination logic:
- The plan where the patient is the subscriber/policyholder is always primary
- Aarav → Primary Plan B (he's the subscriber), Secondary Plan A (he's a dependent)
- Priya → Primary Plan A (she's the subscriber), Secondary Plan B (she's a dependent)

### 2. Graceful AI Fallback
Every AI-dependent operation has a deterministic fallback:
- If Gemini API key is absent → mock data provides identical flow
- If API call fails → fallback to keyword-based code inference
- Letters fall back to template-based generation

### 3. Single-Page Application
All functionality is on a single page with tabs to simplify navigation and demonstrate the full pipeline in one view.

## Technology Choices

| Layer | Technology | Reason |
|---|---|---|
| Framework | Next.js 14+ (App Router) | Server-side API routes + client SPA |
| Language | TypeScript (strict) | Type safety for complex insurance logic |
| UI | Tailwind CSS + shadcn/ui | Rapid, consistent, accessible components |
| AI | Google Gemini 2.0 Flash | Free tier, multimodal (text + vision) |
| Speech | Web Speech API | Zero-dependency browser TTS |
