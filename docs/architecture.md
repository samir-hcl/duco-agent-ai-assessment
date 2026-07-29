# DuCO-Agent Architecture — Google ADK Orchestration

## System Overview

DuCO-Agent uses **Google ADK (Agent Development Kit)** with a **SequentialAgent** orchestration pattern enhanced by a **LoopAgent** for LLM-as-judge validation and **Human-in-the-Loop (HITL)** approval gate.

## Orchestration Pattern

```mermaid
graph TD
    subgraph "Google ADK SequentialAgent"
        A["IntakeAgent<br/>(LlmAgent)"] --> B["COBAgent<br/>(LlmAgent)"]
        B --> C["ValidationLoop<br/>(LoopAgent, max 3)"]
        C --> D{"Human Approval<br/>Gate (HITL)"}
        D -->|Approved| E["OutputAgent<br/>(LlmAgent)"]
        D -->|Rejected| F["Pipeline Halted"]
        C -->|"Issues Found"| C
    end

    subgraph "IntakeAgent Tools"
        A1["classify_document()"]
        A2["extract_medical_document()<br/>Gemini Vision OCR"]
        A3["lookup_cpt_code()"]
        A4["lookup_icd10_code()"]
    end

    subgraph "COBAgent Tools (Math Delegated)"
        B1["determine_primary_payer()"]
        B2["get_insurance_plan()"]
        B3["check_preauth_requirements()"]
        B4["run_full_cob_calculation()"]
        B5["calculate_deductible()"]
        B6["calculate_coinsurance()"]
        B7["calculate_oop_cap()"]
    end

    subgraph "ValidationJudge Tools"
        C1["validate_cob_determination()"]
        C2["validate_math_accuracy()"]
    end

    subgraph "OutputAgent Tools"
        E1["generate_preauth_letter()"]
        E2["generate_tts_script()"]
    end

    subgraph "Mock Database (JSON)"
        DB1["cpt_codes.json"]
        DB2["icd10_codes.json"]
        DB3["preauth_rules.json"]
        DB4["insurance_plans.json"]
    end

    A --- A1 & A2 & A3 & A4
    B --- B1 & B2 & B3 & B4 & B5 & B6 & B7
    C --- C1 & C2
    E --- E1 & E2
    B3 -.->|queries| DB3
    A3 -.->|queries| DB1
    A4 -.->|queries| DB2
    B2 -.->|queries| DB4
```

## Data Flow

```mermaid
sequenceDiagram
    participant U as User (React Frontend)
    participant FE as Next.js API
    participant BE as Python ADK Backend
    participant G as Gemini 2.0 Flash
    participant DB as JSON Mock DB

    U->>FE: Upload documents
    FE->>BE: POST /api/adk/orchestrate
    
    Note over BE: Phase 1: SequentialAgent
    
    BE->>G: IntakeAgent: OCR extraction
    G-->>BE: Extracted text/JSON
    BE->>DB: lookup_cpt_code(), lookup_icd10_code()
    DB-->>BE: Code details
    
    BE->>DB: get_insurance_plan()
    DB-->>BE: Plan A, Plan B details
    BE->>BE: determine_primary_payer() [Tool]
    BE->>BE: run_full_cob_calculation() [Tool]
    
    Note over BE: LoopAgent: Validation (max 3x)
    BE->>BE: validate_cob_determination()
    BE->>BE: validate_math_accuracy()
    
    BE-->>FE: Phase 1 results + logs
    FE-->>U: Show results + Approval modal
    
    Note over U: HUMAN-IN-THE-LOOP GATE
    U->>FE: Click "Approve"
    
    FE->>BE: POST /api/adk/approve
    Note over BE: Phase 2: OutputAgent
    BE->>BE: generate_preauth_letter() [Tool]
    BE->>BE: generate_tts_script() [Tool]
    BE-->>FE: Letters + TTS script
    FE-->>U: Display letters, play TTS
```

## Key Design Principles

| Principle | Implementation |
|---|---|
| **Math → Tools** | Agents NEVER compute. They call `calculate_deductible()`, `calculate_coinsurance()`, `calculate_oop_cap()` with raw numbers |
| **Codes → Database** | All CPT/ICD-10 lookups go through `lookup_cpt_code()` / `lookup_icd10_code()` which query JSON files |
| **Validation → Loop** | `LoopAgent` runs `ValidationJudge` up to 3 times. Uses both rule-based and LLM-as-judge validation |
| **Approval → HITL** | Pipeline pauses after validation. Human must explicitly approve before output generation |
| **Logs → Streaming** | SSE endpoint streams agent traces in real-time to the frontend |
| **OCR → Gemini** | `extract_medical_document()` uses Gemini 2.0 Flash Vision API |

## ADK Pattern Reference

Based on [Google ADK Documentation](https://google.github.io/adk-docs/agents/):

- **SequentialAgent**: Runs sub-agents in order. Used as the root orchestrator.
- **LlmAgent**: Each specialized agent (Intake, COB, Validation, Output) with specific tools.
- **LoopAgent**: Wraps ValidationJudge for iterative quality checks.
- **FunctionTool**: All math, database, OCR, and output operations are tools.
