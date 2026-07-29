"""Insurance math tools - agents delegate ALL calculations here.

Critical Design Decision: Agents NEVER do math themselves.
They pass raw numbers to these tool functions which return
exact, deterministic results.
"""


def calculate_deductible(
    total_charges: float,
    deductible_amount: float,
    deductible_already_met: float
) -> dict:
    """Calculate how much deductible applies to this claim.
    
    Args:
        total_charges: Total amount billed
        deductible_amount: Plan's deductible threshold
        deductible_already_met: How much deductible patient already paid this year
    
    Returns:
        dict with deductible_applied, deductible_remaining, amount_after_deductible
    """
    remaining_deductible = max(0, deductible_amount - deductible_already_met)
    deductible_applied = min(remaining_deductible, total_charges)
    amount_after_deductible = total_charges - deductible_applied
    return {
        "deductible_applied": deductible_applied,
        "deductible_remaining": max(0, remaining_deductible - deductible_applied),
        "amount_after_deductible": amount_after_deductible
    }


def calculate_coinsurance(
    eligible_amount: float,
    coinsurance_rate_percent: float
) -> dict:
    """Calculate plan payment based on coinsurance rate.
    
    Args:
        eligible_amount: Amount after deductible
        coinsurance_rate_percent: e.g. 80 means plan pays 80%
    
    Returns:
        dict with plan_pays and patient_pays
    """
    plan_pays = eligible_amount * (coinsurance_rate_percent / 100)
    patient_pays = eligible_amount - plan_pays
    return {
        "plan_pays": round(plan_pays, 2),
        "patient_pays": round(patient_pays, 2)
    }


def calculate_oop_cap(
    patient_responsibility: float,
    oop_max: float,
    oop_already_met: float
) -> dict:
    """Apply out-of-pocket maximum cap.
    
    Args:
        patient_responsibility: What patient would owe before cap
        oop_max: Plan's OOP maximum
        oop_already_met: How much patient already paid toward OOP max
    
    Returns:
        dict with final_patient_pays, oop_remaining, oop_cap_applied
    """
    remaining_oop = max(0, oop_max - oop_already_met)
    final_patient_pays = min(patient_responsibility, remaining_oop)
    return {
        "final_patient_pays": round(final_patient_pays, 2),
        "oop_remaining": round(max(0, remaining_oop - final_patient_pays), 2),
        "oop_cap_applied": patient_responsibility > remaining_oop
    }


def determine_primary_payer(
    patient_name: str,
    plan_a_subscriber_name: str,
    plan_b_subscriber_name: str,
    plan_a_subscriber_dob: str,
    plan_b_subscriber_dob: str,
    patient_relationship_to_plan_a: str,
    patient_relationship_to_plan_b: str
) -> dict:
    """Determine primary vs secondary payer using COB rules.
    
    Applies Subscriber Rule first, then Birthday Rule.
    
    Args:
        patient_name: Name of the patient
        plan_a_subscriber_name: Subscriber name on Plan A
        plan_b_subscriber_name: Subscriber name on Plan B
        plan_a_subscriber_dob: DOB of Plan A subscriber (YYYY-MM-DD)
        plan_b_subscriber_dob: DOB of Plan B subscriber (YYYY-MM-DD)
        patient_relationship_to_plan_a: 'self', 'spouse', or 'dependent'
        patient_relationship_to_plan_b: 'self', 'spouse', or 'dependent'
    
    Returns:
        dict with primary_plan, secondary_plan, rule_used, reasoning
    """
    # Subscriber Rule: if patient is subscriber on one plan, that plan is primary
    if patient_relationship_to_plan_a == "self":
        return {
            "primary_plan": "PLAN_A",
            "secondary_plan": "PLAN_B",
            "rule_used": "SUBSCRIBER_RULE",
            "reasoning": (
                f"{patient_name} is the primary policyholder (subscriber) on Plan A "
                f"and listed as a dependent on Plan B. Per the Subscriber Rule, "
                f"Plan A is primary."
            )
        }
    if patient_relationship_to_plan_b == "self":
        return {
            "primary_plan": "PLAN_B",
            "secondary_plan": "PLAN_A",
            "rule_used": "SUBSCRIBER_RULE",
            "reasoning": (
                f"{patient_name} is the primary policyholder (subscriber) on Plan B "
                f"and listed as a dependent on Plan A. Per the Subscriber Rule, "
                f"Plan B is primary."
            )
        }
    # Birthday Rule: plan of parent whose birthday is earlier in year is primary
    a_month_day = plan_a_subscriber_dob[5:]  # MM-DD
    b_month_day = plan_b_subscriber_dob[5:]
    if a_month_day <= b_month_day:
        return {
            "primary_plan": "PLAN_A",
            "secondary_plan": "PLAN_B",
            "rule_used": "BIRTHDAY_RULE",
            "reasoning": (
                f"{patient_name} is a dependent on both plans. Plan A subscriber "
                f"birthday ({plan_a_subscriber_dob}) falls earlier in the calendar "
                f"year than Plan B ({plan_b_subscriber_dob}). Per the Birthday Rule, "
                f"Plan A is primary."
            )
        }
    else:
        return {
            "primary_plan": "PLAN_B",
            "secondary_plan": "PLAN_A",
            "rule_used": "BIRTHDAY_RULE",
            "reasoning": (
                f"{patient_name} is a dependent on both plans. Plan B subscriber "
                f"birthday ({plan_b_subscriber_dob}) falls earlier in the calendar "
                f"year than Plan A ({plan_a_subscriber_dob}). Per the Birthday Rule, "
                f"Plan B is primary."
            )
        }


def run_full_cob_calculation(
    patient_name: str,
    total_charges: float,
    primary_plan_id: str,
    primary_deductible: float,
    primary_deductible_met: float,
    primary_coinsurance: float,
    primary_oop_max: float,
    primary_oop_met: float,
    secondary_deductible: float,
    secondary_deductible_met: float,
    secondary_coinsurance: float,
    secondary_oop_max: float,
    secondary_oop_met: float
) -> dict:
    """Run complete COB calculation for a single claim through both plans.
    
    This is the master calculation function that chains:
    deductible -> coinsurance -> OOP cap for primary,
    then feeds remainder through secondary plan.
    """
    # Primary plan
    p_ded = calculate_deductible(total_charges, primary_deductible, primary_deductible_met)
    p_coins = calculate_coinsurance(p_ded["amount_after_deductible"], primary_coinsurance)
    p_oop = calculate_oop_cap(
        p_coins["patient_pays"] + p_ded["deductible_applied"],
        primary_oop_max, primary_oop_met
    )

    # Secondary plan - covers patient's remaining responsibility
    patient_after_primary = p_oop["final_patient_pays"]
    s_ded = calculate_deductible(patient_after_primary, secondary_deductible, secondary_deductible_met)
    s_coins = calculate_coinsurance(s_ded["amount_after_deductible"], secondary_coinsurance)
    s_oop = calculate_oop_cap(
        s_coins["patient_pays"] + s_ded["deductible_applied"],
        secondary_oop_max, secondary_oop_met
    )

    total_insurance = p_coins["plan_pays"] + s_coins["plan_pays"]
    final_patient_oop = s_oop["final_patient_pays"]

    return {
        "patient_name": patient_name,
        "total_charges": total_charges,
        "primary_plan_id": primary_plan_id,
        "primary_plan_pays": p_coins["plan_pays"],
        "primary_deductible_applied": p_ded["deductible_applied"],
        "secondary_plan_pays": s_coins["plan_pays"],
        "secondary_deductible_applied": s_ded["deductible_applied"],
        "total_insurance_paid": round(total_insurance, 2),
        "total_patient_oop": round(final_patient_oop, 2),
        "savings_from_dual_coverage": round(patient_after_primary - final_patient_oop, 2)
    }
