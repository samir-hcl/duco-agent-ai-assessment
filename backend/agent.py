"""DuCO-Agent: ADK-based multi-agent orchestrator for Coordination of Benefits.

Architecture (based on Google ADK orchestration patterns):

  SequentialAgent (DuCO_Orchestrator)
    +-- IntakeAgent (LlmAgent) - document parsing + OCR
    +-- COBAgent (LlmAgent) - primary/secondary determination + math via tools
    +-- LoopAgent (ValidationLoop) - LLM-as-judge, max 3 iterations
    |     +-- ValidationJudge (LlmAgent)
    +-- [HUMAN-IN-THE-LOOP APPROVAL GATE]
    +-- OutputAgent (LlmAgent) - letters + TTS script generation

Key Design Principles:
  1. ALL math delegated to tool functions (agents never compute)
  2. ALL code lookups go through mock database tools
  3. Validation loop catches errors before human review
  4. Human approval required before output generation
"""
from google.adk.agents import LlmAgent, SequentialAgent, LoopAgent

from tools.math_tools import (
    calculate_deductible,
    calculate_coinsurance,
    calculate_oop_cap,
    determine_primary_payer,
    run_full_cob_calculation,
)
from tools.database_tools import (
    lookup_cpt_code,
    lookup_icd10_code,
    check_preauth_requirements,
    get_insurance_plan,
    search_codes,
)
from tools.ocr_tools import extract_medical_document, classify_document
from tools.output_tools import generate_preauth_letter, generate_tts_script
from tools.validation_tools import validate_cob_determination, validate_math_accuracy

MODEL = "gemini-2.0-flash"

# === Sub-Agents ===

intake_agent = LlmAgent(
    name="IntakeAgent",
    model=MODEL,
    instruction=(
        "You are a medical document intake specialist.\n"
        "For each uploaded document:\n"
        "1. Use classify_document to determine the document type.\n"
        "2. Use extract_medical_document for images/PDFs to extract data via OCR.\n"
        "3. Look up CPT codes using lookup_cpt_code and ICD-10 codes using lookup_icd10_code.\n"
        "4. Return a structured summary of each claim with: patient name, DOB, "
        "provider, procedures, diagnoses, total charges.\n"
        "IMPORTANT: Do NOT calculate anything yourself. Only extract and look up data."
    ),
    tools=[
        classify_document,
        extract_medical_document,
        lookup_cpt_code,
        lookup_icd10_code,
        search_codes,
    ],
)

cob_agent = LlmAgent(
    name="COBAgent",
    model=MODEL,
    instruction=(
        "You are a Coordination of Benefits (COB) specialist.\n"
        "Given parsed claims from IntakeAgent:\n"
        "1. Use determine_primary_payer for each patient.\n"
        "2. Use get_insurance_plan to retrieve plan details.\n"
        "3. Use check_preauth_requirements to check pre-auth needs.\n"
        "4. Use run_full_cob_calculation to compute exact payment amounts.\n"
        "CRITICAL: ALL math MUST go through tool functions. "
        "Never compute numbers yourself - pass raw numbers to the tools."
    ),
    tools=[
        determine_primary_payer,
        get_insurance_plan,
        check_preauth_requirements,
        run_full_cob_calculation,
        calculate_deductible,
        calculate_coinsurance,
        calculate_oop_cap,
    ],
)

validation_judge = LlmAgent(
    name="ValidationJudge",
    model=MODEL,
    instruction=(
        "You are a quality assurance judge for insurance COB analysis.\n"
        "Review the COB determination and calculations:\n"
        "1. Use validate_cob_determination to check rule logic and reasoning.\n"
        "2. Use validate_math_accuracy to verify all calculations.\n"
        "If ALL checks pass, respond EXACTLY with: VALIDATION_PASSED\n"
        "If issues found, describe them and respond with: NEEDS_CORRECTION\n"
        "You have a maximum of 3 validation attempts."
    ),
    tools=[
        validate_cob_determination,
        validate_math_accuracy,
    ],
)

# Validation loop - re-validates up to 3 times
validation_loop = LoopAgent(
    name="ValidationLoop",
    sub_agent=validation_judge,
    max_iterations=3,
)

output_agent = LlmAgent(
    name="OutputAgent",
    model=MODEL,
    instruction=(
        "You are a medical document output specialist.\n"
        "Given approved COB results:\n"
        "1. Use generate_preauth_letter for each patient needing pre-auth.\n"
        "   Generate both primary and secondary insurer letters.\n"
        "2. Use generate_tts_script to create a spoken verdict summary.\n"
        "Return all generated letters and the TTS script."
    ),
    tools=[
        generate_preauth_letter,
        generate_tts_script,
        lookup_cpt_code,
        lookup_icd10_code,
    ],
)

# === Root Orchestrator (Sequential Pattern) ===

orchestrator = SequentialAgent(
    name="DuCO_Orchestrator",
    description=(
        "Multi-agent orchestrator for Dual Coverage Coordination of Benefits. "
        "Runs: Intake -> COB Analysis -> Validation Loop -> [Human Approval] -> Output"
    ),
    sub_agents=[intake_agent, cob_agent, validation_loop, output_agent],
)
