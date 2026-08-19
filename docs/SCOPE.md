# DuCO-Agent — Scope & Supported Use Cases

## Supported Use Cases

1. **Dual-coverage COB analysis** for patients covered under two Indian health insurance plans (PPO + HMO)
2. **Multi-modal document intake**: scanned PT invoices (JPG), surgeon cost estimates (JPG), MRI radiology reports (TXT), and free-text user queries
3. **Primary/secondary payer determination** using Subscriber Rule and Birthday Rule per NAIC model guidelines
4. **Deterministic claim calculation**: deductible application, coinsurance splits (in-network/out-of-network), OOP maximum enforcement
5. **Pre-authorization letter generation** for procedures exceeding plan thresholds (e.g., surgical procedures > ₹1,00,000)
6. **LLM-as-a-Judge verification** with self-correction retry loop (max 2 retries) and corrective action
7. **Human-in-the-Loop approval gate** — pipeline halts for explicit human review before generating outputs
8. **Financial summary with cost-flow visualization** showing payment distribution across Primary, Secondary, and Patient OOP
9. **Text-to-Speech briefing** with section-by-section highlighting during playback
10. **PDF export** of pre-authorization letters with clinical formatting

## Out-of-Scope Scenarios

The following are explicitly **not supported** in the current version:

| Scenario | Reason |
|----------|--------|
| **Dental / Vision claims** | Only medical (orthopedic, physical therapy) claims are modeled |
| **Medicare / Medicaid coordination** | US government payer rules differ significantly from private COB |
| **International insurance** | Only Indian insurance plans (INR currency, Indian regulatory context) |
| **Multi-year deductible rollover** | Deductible tracking is within a single plan year only |
| **Family deductible accumulation across members** | Individual deductibles tracked; family accumulator is simplified |
| **Workers' compensation or auto insurance** | These follow separate coordination rules outside standard COB |
| **Real-time eligibility verification** | No live connection to insurance company APIs |
| **Claims submission / EDI 837** | System generates pre-auth letters, not electronic claim submissions |
| **Appeals or denial management** | Post-adjudication workflows are not implemented |
| **Provider credentialing** | Network status is assumed from plan data, not verified in real-time |
| **Multiple (3+) insurance plans** | Only dual-coverage (2 plans) is supported |
| **Pharmacy / prescription drug claims** | Only medical procedure and diagnostic claims |

## Assumptions

- Patient demographic data and insurance plan details are pre-loaded in `data/insurance_plans.json`
- Medical code databases (`data/cpt_codes.json`, `data/icd10_codes.json`) represent a subset relevant to the demo scenario
- Gemini API availability is optional — the system falls back to mock data with logged warnings when unavailable
- All monetary values are in Indian Rupees (₹ / INR)
