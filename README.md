# DuCO-Agent — Dual Coverage AI Agent for Coordination of Benefits

An **agentic AI system** that processes multi-modal medical documents (scanned invoices, surgeon estimates, MRI reports) and autonomously determines Coordination of Benefits (COB) for patients with dual insurance coverage.

## Architecture

```
                        ┌─────────────────────────┐
                        │    React/Next.js UI      │
                        │  Upload · Logs · Approve │
                        └────────┬────────────────┘
                                 │ POST /api/orchestrate
                    ┌────────────▼────────────────┐
                    │   ADK Bridge (route.ts)      │
                    │  Tries Python ADK → Fallback │
                    │  to TypeScript Orchestrator  │
                    └────────────┬────────────────┘
         ┌───────────────────────▼──────────────────────────┐
         │              OrchestratorAgent (State Machine)    │
         │  reflect() → State Transitions → Inter-Agent Msgs │
         └──┬──────────┬──────────────┬─────────────┬───────┘
            ▼          ▼              ▼             ▼
     ┌──────────┐ ┌─────────┐ ┌──────────────┐ ┌──────────┐
     │ Intake   │ │  COB    │ │ Verification │ │  Output  │
     │ Agent    │ │ Agent   │ │   Agent      │ │  Agent   │
     │ (OCR)    │ │ (Math)  │ │ (LLM Judge)  │ │ (Letters)│
     └──────────┘ └─────────┘ └──────────────┘ └──────────┘
```

### Pipeline Stages

| Stage | Agent | Behavior |
|-------|-------|----------|
| **1. INTAKE** | `IntakeAgent` | Gemini Vision OCR extracts structured data from scanned images/PDFs. Classifies documents (invoice/estimate/MRI). Falls back to mock data with logged warning if API unavailable. |
| **2. COB_ANALYSIS** | `COBAgent` | Deterministic COB engine applies Subscriber Rule and Birthday Rule. All math (deductibles, coinsurance, OOP caps) computed by pure functions — **LLM never calculates**. |
| **3. VERIFICATION** | `VerificationAgent` | **3-layer validation**: (a) Code verification against JSON database, (b) Deterministic math audit, (c) **LLM-as-a-Judge** semantic audit via Gemini. Retry loop (max 2) with corrective action on failure. |
| **⏸ HITL GATE** | `HumanApprover` | Pipeline **stops**. Blocking modal shows financial summary. User must explicitly click Approve/Reject. No outputs generated without approval. |
| **4. OUTPUT** | `OutputAgent` | Generates pre-auth letters (Gemini), financial summary, TTS script. PDF download, clipboard copy, text export. |

### Key Design Patterns

- **State Machine**: `IDLE → INTAKE → COB_ANALYSIS → VERIFICATION → [HITL] → OUTPUT → COMPLETE`
- **Reflection**: `reflect()` function examines context at each transition and decides next action
- **Inter-Agent Messaging**: Typed `AgentMessage` envelopes (`DATA`, `ERROR`, `RETRY`, `APPROVAL_REQUEST`)
- **Retry Loop**: On verification failure → corrective action (strip incompatible codes) → re-run COB → re-verify (max 2 retries)
- **LLM-as-a-Judge**: Gemini evaluates COB rule reasoning semantically after deterministic checks pass
- **Human-in-the-Loop**: Two-phase execution (`/api/orchestrate` → `/api/approve`) with blocking approval gate
- **ADK Bridge**: `route.ts` attempts Python Google ADK backend first, seamlessly falls back to TS orchestrator

## Mock Database & REST APIs

All medical codes and rules are stored in JSON files (simulating a real database), queryable via REST APIs:

| File | API Endpoint | Contents |
|------|-------------|----------|
| `data/cpt_codes.json` | `GET /api/codes/cpt/[code]` | 16 CPT procedure codes |
| `data/icd10_codes.json` | `GET /api/codes/icd10/[code]` | 15 ICD-10 diagnosis codes |
| `data/preauth_rules.json` | `POST /api/rules/preauth` | 5 pre-authorization rules with thresholds |
| `data/insurance_plans.json` | — | Plan A (PPO) + Plan B (HMO) with full deductible/coinsurance/OOP details |

## Multi-Modal OCR

- **Engine**: Gemini 2.0 Flash Vision API (`@google/generative-ai`)
- **Inputs**: Scanned JPG invoices, surgeon estimates, text MRI reports, user queries
- **Committed Samples**: `public/mock-data/priya_pt_invoice.jpg`, `aarav_surgeon_estimate.jpg`, `aarav_mri_report_text.txt`, `user_query.txt`
- **Fallback**: If API key missing or quota exhausted, logs `FALLBACK` warning and uses mock data — never silently substitutes

## Mathematical Engine

All insurance math is **deterministic TypeScript** — the LLM is never used for calculations:

- **COB Rules**: `determinePrimaryPlan()` in `cob-engine.ts` — Subscriber Rule + Birthday Rule
- **Deductibles**: `calculateDeductible()` in `deductible-calculator.ts` — tracks individual/family met amounts
- **Coinsurance**: In-network (80/20) and out-of-network (60/40) splits
- **OOP Max**: Caps patient responsibility at plan maximums
- **INR Formatting**: `Math.round()` + `toLocaleString('en-IN')` with ₹ symbol

## Test Coverage

```
TypeScript (Vitest) — 6 files | 77 tests | 0 failures

 ✓ src/lib/insurance/cob-engine.test.ts                (12 tests) — COB rules, birthday/subscriber rule
 ✓ src/lib/insurance/deductible-calculator.test.ts     (11 tests) — deductible tracking, OOP caps
 ✓ src/lib/medical/clinical-mapper.test.ts             (18 tests) — code inference, compatibility
 ✓ src/lib/agents/intake-agent.test.ts                 (12 tests) — OCR schema validation
 ✓ src/lib/agents/intake-ocr-integration.test.ts       (14 tests) — real file reads + pipeline
 ✓ src/lib/agents/verification-agent.test.ts           (10 tests) — math integrity + reconciliation

Python (pytest) — 1 file | 20 tests | 0 failures

 ✓ backend/tests/test_math_tools.py                    (20 tests) — deductible, coinsurance,
                                                                    OOP cap, COB rules, full calc
```

## Outputs

| Output | Implementation |
|--------|---------------|
| **Cost Flow Visualization** | Interactive bar chart showing payment flow: Total → Primary → Secondary → Patient OOP |
| **Pre-Auth Letters** | Gemini-generated, clinically formatted. Copy/TXT/PDF download |
| **TTS Final Verdict** | Browser Web Speech API with section highlighting during playback |
| **Agent Trace Logs** | Real-time streaming log viewer with per-agent filter badges |
| **PDF Export** | Direct `.pdf` download with A4 formatting, CPT/ICD-10 codes, cost summary |

## Quick Start

```bash
# Install dependencies
npm install

# Set Gemini API key
echo "GOOGLE_GEMINI_API_KEY=your_key" > .env.local

# Run tests (63 tests)
npm test

# Start dev server (Next.js only)
npm run dev

# Start with Python ADK backend
npm run dev:full
```

Open [http://localhost:3000](http://localhost:3000)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Next.js 16 + shadcn/ui + Tailwind CSS 4 |
| AI/LLM | Gemini 2.0 Flash (Vision OCR + text reasoning + Judge) |
| Agent Framework | Google ADK (Python backend) + TS State Machine (primary) |
| Database | JSON mock database with REST API endpoints |
| Testing | Vitest — 63 unit tests across 5 test files |
| TTS | Web Speech API with section tracking |

## Python ADK Backend (Optional)

The `backend/` directory contains a Google ADK implementation with `SequentialAgent`, `LoopAgent`, and `LlmAgent`. Start it alongside Next.js with `npm run dev:full`. When running, the Next.js API route automatically bridges to it.

```
backend/
├── agent.py           # ADK agents (IntakeAgent, COBAgent, ValidationLoop, OutputAgent)
├── server.py          # FastAPI + SSE streaming
├── requirements.txt   # google-adk, fastapi, uvicorn
└── tools/
    ├── math_tools.py        # Deterministic insurance math
    ├── database_tools.py    # JSON database queries
    ├── ocr_tools.py         # Gemini Vision extraction
    ├── validation_tools.py  # LLM-as-judge checks
    └── output_tools.py      # Letter + TTS generation
```
