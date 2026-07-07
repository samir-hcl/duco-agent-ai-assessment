# DuCO-Agent 🏥⚡

**Dual Coverage Coordination of Benefits AI Agent**

A multi-modal AI system that automates insurance Coordination of Benefits (COB) analysis for patients with dual health insurance coverage. Built with Next.js 14+, TypeScript, Tailwind CSS, shadcn/ui, and Google Gemini 2.0 Flash.

---

## Problem Statement

**Priya and Aarav Sen** are a married couple in Mumbai with dual insurance coverage:

| | Plan A (Insurer1 – PPO) | Plan B (Insurer2 – HMO) |
|---|---|---|
| **Primary Holder** | Priya Sen | Aarav Sen |
| **Dependent** | Aarav Sen | Priya Sen |
| **Deductible** | ₹50,000 | ₹30,000 |
| **Coinsurance** | 80/20 | 70/30 |
| **OOP Max** | ₹3,00,000 | ₹4,00,000 |

**Aarav** needs ACL reconstruction surgery (₹4,50,000) and **Priya** has physiotherapy bills (₹30,000). The system must determine which plan pays first, calculate deductibles/coinsurance/crossover, and generate pre-authorization letters.

---

## Features

### Multi-Modal Document Intake
- 📷 **Image OCR** — Scanned invoices and surgeon estimates via Gemini Vision
- 📄 **PDF Analysis** — MRI radiology reports extraction
- 🎙️ **Text/Voice Processing** — Natural language user queries (voice-to-text)
- 🔍 **AI-Powered Extraction** — Falls back to mock data when API key is absent

### COB Analysis Engine
- ✅ **Subscriber Rule** — Determines primary/secondary per insurance standards
- 💰 **Deductible Tracking** — Individual and family deductible accumulation
- 📊 **Coinsurance Calculation** — Primary → Secondary crossover amounts
- 🔄 **Cost Flow Visualization** — Visual breakdown of payment distribution

### Verification & Compliance
- 🏥 **Medical Code Validation** — CPT-4 and ICD-10 code lookup
- ⚕️ **Procedure-Diagnosis Compatibility** — Cross-checks clinical appropriateness
- ✓ **Math Verification** — Ensures all calculations balance
- 🔒 **Pre-Auth Detection** — Flags procedures requiring prior authorization

### Multi-Modal Outputs
- 📝 **Pre-Authorization Letters** — AI-generated formal letters for both insurers (primary + secondary)
- 📊 **Financial Summary** — Detailed cost breakdown with percentages
- 🔊 **Audio Briefing** — Patient-friendly TTS summary using Web Speech API
- 📋 **Agent Reasoning Log** — Full decision trace with timestamps

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              ORCHESTRATOR AGENT              │
│   State: IDLE → INTAKE → COB → VERIFY → OUT│
├────────┬────────┬──────────┬────────────────┤
│ Intake │  COB   │  Verify  │    Output      │
│ Agent  │ Agent  │  Agent   │    Agent       │
├────────┴────────┴──────────┴────────────────┤
│          Core Libraries                      │
│  Gemini Client │ Medical Codes │ COB Engine  │
└─────────────────────────────────────────────┘
```

### Agent Pipeline

| Agent | Responsibility |
|---|---|
| **IntakeAgent** | Multi-modal file processing (OCR, PDF, NLP), medical code inference |
| **COBAgent** | Primary/secondary determination, deductible/coinsurance calculations |
| **VerificationAgent** | Code validation, math checks, compliance verification |
| **OutputAgent** | Pre-auth letters, financial summary, audio briefing script |
| **OrchestratorAgent** | State machine driving the full pipeline |

---

## Tech Stack

- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript (strict)
- **Styling:** Tailwind CSS v4 + shadcn/ui
- **AI Model:** Google Gemini 2.0 Flash (free tier)
- **Speech:** Web Speech API (browser TTS)

---

## Getting Started

### Prerequisites
- Node.js ≥ 18
- npm

### Installation

```bash
npm install
```

### Environment Setup

```bash
cp .env.example .env.local
```

Add your Google Gemini API key (optional — app works with mock data without it):

```env
GOOGLE_GEMINI_API_KEY=your_api_key_here
```

### Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Usage

1. Click **"Load Demo Files"** to load the scenario files
2. Click **"Run DuCO-Agent Analysis"**
3. View results across 4 tabs: Results, Letters, Agent Log
4. Play the **Audio Briefing** for a patient-friendly summary
5. **Download** or **Copy** pre-auth letters

---

## Project Structure

```
src/
├── app/
│   ├── api/orchestrate/route.ts    # API endpoint
│   ├── layout.tsx                   # Root layout
│   ├── page.tsx                     # Main SPA
│   └── globals.css                  # Theme
├── lib/
│   ├── agents/
│   │   ├── intake-agent.ts         # Multi-modal intake
│   │   ├── cob-agent.ts            # COB analysis
│   │   ├── verification-agent.ts   # Verification
│   │   ├── output-agent.ts         # Output generation
│   │   └── orchestrator-agent.ts   # Pipeline orchestrator
│   ├── gemini/
│   │   └── client.ts               # Gemini API wrapper
│   ├── insurance/
│   │   ├── mock-plans.ts           # Plan A & B definitions
│   │   ├── deductible-calculator.ts# Deductible tracking
│   │   └── cob-engine.ts           # COB calculation engine
│   ├── medical/
│   │   ├── code-lookup.ts          # CPT/ICD-10 database
│   │   └── clinical-mapper.ts      # Text → code inference
│   └── types/
│       └── index.ts                 # Type definitions
├── components/ui/                   # shadcn/ui components
public/
└── mock-data/
    ├── user_query.txt               # Aarav's voice query
    └── aarav_mri_report_text.txt    # MRI report text
```

---

## License

MIT
