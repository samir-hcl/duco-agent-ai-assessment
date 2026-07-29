"""Validation tools - LLM-as-judge pattern for quality assurance.

Design: These tools provide both deterministic rule-based validation
and LLM-powered semantic validation. Used inside a LoopAgent to
re-validate up to 3 times if issues are found.
"""
import json


def validate_cob_determination(determination_json: str) -> dict:
    """Validate COB determination logic for correctness.
    
    Checks:
    - Correct rule was applied (Subscriber vs Birthday)
    - Reasoning is consistent with the rule
    - Primary plan is assigned
    
    Args:
        determination_json: JSON string of determination results
    
    Returns:
        dict with valid flag, issues list, and suggestion
    """
    try:
        determination = (
            json.loads(determination_json)
            if isinstance(determination_json, str)
            else determination_json
        )
    except (json.JSONDecodeError, TypeError):
        return {
            "valid": False,
            "issues": ["Could not parse determination JSON"],
            "suggestion": "Provide valid JSON",
        }

    issues = []
    items = determination if isinstance(determination, list) else [determination]

    for det in items:
        rule = det.get("rule_used", "")
        primary = det.get("primary_plan", "")
        patient = det.get("patient_name", "Unknown")
        reasoning = det.get("reasoning", "").lower()

        if rule == "SUBSCRIBER_RULE":
            if "subscriber" not in reasoning and "policyholder" not in reasoning:
                issues.append(
                    f"{patient}: Subscriber rule cited but reasoning "
                    f"doesn't mention subscriber/policyholder status"
                )
        elif rule == "BIRTHDAY_RULE":
            if "birthday" not in reasoning and "earlier" not in reasoning:
                issues.append(
                    f"{patient}: Birthday rule cited but reasoning "
                    f"doesn't reference birthday comparison"
                )
        elif rule:
            issues.append(f"{patient}: Unknown rule '{rule}'")

        if not primary:
            issues.append(f"{patient}: No primary plan assigned")
        elif primary not in ("PLAN_A", "PLAN_B"):
            issues.append(f"{patient}: Invalid primary plan '{primary}'")

    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "checked_fields": ["rule_used", "primary_plan", "reasoning"],
        "suggestion": (
            "Re-run determination with corrected logic"
            if issues
            else "All validation checks passed"
        ),
    }


def validate_math_accuracy(calculations_json: str) -> dict:
    """Validate that COB calculations are internally consistent.
    
    Checks:
    - primary + secondary + OOP = total charges
    - No negative values
    - Deductible doesn't exceed total charges
    
    Args:
        calculations_json: JSON string of calculation results
    
    Returns:
        dict with valid flag, issues list, and suggestion
    """
    try:
        calcs = (
            json.loads(calculations_json)
            if isinstance(calculations_json, str)
            else calculations_json
        )
    except (json.JSONDecodeError, TypeError):
        return {
            "valid": False,
            "issues": ["Could not parse calculations JSON"],
            "suggestion": "Provide valid JSON",
        }

    issues = []
    items = calcs if isinstance(calcs, list) else [calcs]

    for calc in items:
        name = calc.get("patient_name", "Unknown")
        total = calc.get("total_charges", 0)
        primary = calc.get("primary_plan_pays", 0)
        secondary = calc.get("secondary_plan_pays", 0)
        oop = calc.get("total_patient_oop", 0)
        p_ded = calc.get("primary_deductible_applied", 0)
        s_ded = calc.get("secondary_deductible_applied", 0)

        # Check: primary + secondary + oop should equal total
        computed = primary + secondary + oop
        if abs(computed - total) > 1:  # allow rounding tolerance
            issues.append(
                f"{name}: primary({primary}) + secondary({secondary}) + "
                f"oop({oop}) = {computed} != total({total})"
            )

        # Check: no negative values
        for field, value in [
            ("primary_plan_pays", primary),
            ("secondary_plan_pays", secondary),
            ("total_patient_oop", oop),
        ]:
            if value < 0:
                issues.append(f"{name}: Negative value in {field}: {value}")

        # Check: deductible doesn't exceed total
        if p_ded > total:
            issues.append(
                f"{name}: Primary deductible ({p_ded}) exceeds "
                f"total charges ({total})"
            )

    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "suggestion": (
            "Recalculate with corrected parameters"
            if issues
            else "All math verified correctly"
        ),
    }
