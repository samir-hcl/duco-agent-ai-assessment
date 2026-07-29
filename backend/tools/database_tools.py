"""Mock database query tools - reads from JSON files.

Design: All medical code lookups and rule queries go through these
tools, which read from the JSON mock database. This replaces
hardcoded data in the TypeScript source.
"""
import json
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent.parent / "data"


def lookup_cpt_code(code: str) -> dict:
    """Look up a CPT procedure code from the mock database.
    
    Args:
        code: CPT code string, e.g. '29888'
    
    Returns:
        dict with code details or error message
    """
    with open(DATA_DIR / "cpt_codes.json") as f:
        codes = json.load(f)
    found = next((c for c in codes if c["code"] == code), None)
    return found or {"error": f"CPT code {code} not found in database"}


def lookup_icd10_code(code: str) -> dict:
    """Look up an ICD-10 diagnosis code from the mock database.
    
    Args:
        code: ICD-10 code string, e.g. 'M23.611'
    
    Returns:
        dict with code details or error message
    """
    with open(DATA_DIR / "icd10_codes.json") as f:
        codes = json.load(f)
    found = next((c for c in codes if c["code"] == code), None)
    return found or {"error": f"ICD-10 code {code} not found in database"}


def check_preauth_requirements(procedure_codes: list[str]) -> dict:
    """Check which pre-authorization rules apply to the given procedure codes.
    
    Args:
        procedure_codes: List of CPT codes to check
    
    Returns:
        dict with requires_preauth, matching_rules, procedure_codes_checked
    """
    with open(DATA_DIR / "preauth_rules.json") as f:
        rules = json.load(f)
    matching = []
    for rule in rules:
        applicable = rule.get("applicableCPTCodes", [])
        if not applicable:
            continue
        if any(code in applicable for code in procedure_codes):
            matching.append(rule)
    return {
        "requires_preauth": len(matching) > 0,
        "matching_rules": matching,
        "procedure_codes_checked": procedure_codes
    }


def get_insurance_plan(plan_id: str) -> dict:
    """Retrieve insurance plan details from the mock database.
    
    Args:
        plan_id: Plan identifier, e.g. 'plan-a' or 'plan-b'
    
    Returns:
        dict with full plan details or error message
    """
    with open(DATA_DIR / "insurance_plans.json") as f:
        plans = json.load(f)
    found = next((p for p in plans if p["id"] == plan_id), None)
    return found or {"error": f"Insurance plan {plan_id} not found"}


def search_codes(query: str, code_type: str = "all") -> dict:
    """Search CPT and/or ICD-10 codes by keyword.
    
    Args:
        query: Search term (matches code, description, or category)
        code_type: 'CPT', 'ICD10', or 'all'
    
    Returns:
        dict with query, results array, and count
    """
    results = []
    q = query.lower()
    if code_type in ("all", "CPT"):
        with open(DATA_DIR / "cpt_codes.json") as f:
            for c in json.load(f):
                if q in c["code"].lower() or q in c["description"].lower() or q in c["category"].lower():
                    results.append(c)
    if code_type in ("all", "ICD10"):
        with open(DATA_DIR / "icd10_codes.json") as f:
            for c in json.load(f):
                if q in c["code"].lower() or q in c["description"].lower() or q in c["category"].lower():
                    results.append(c)
    return {"query": query, "results": results, "count": len(results)}
