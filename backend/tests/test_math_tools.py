"""
Pytest tests for math_tools.py — proves the Python ADK backend
has a real, independently-tested deterministic math engine.
Run: cd backend && python -m pytest tests/ -v
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from tools.math_tools import (
    calculate_deductible,
    calculate_coinsurance,
    calculate_oop_cap,
    determine_primary_payer,
    run_full_cob_calculation,
)

# ─── calculate_deductible ───────────────────────────────────────────────────

def test_deductible_fully_unmet():
    result = calculate_deductible(30000, 5000, 0)
    assert result["deductible_applied"] == 5000
    assert result["amount_after_deductible"] == 25000
    assert result["deductible_remaining"] == 0

def test_deductible_partially_met():
    result = calculate_deductible(30000, 5000, 3000)
    assert result["deductible_applied"] == 2000
    assert result["amount_after_deductible"] == 28000

def test_deductible_fully_met():
    result = calculate_deductible(30000, 5000, 5000)
    assert result["deductible_applied"] == 0
    assert result["amount_after_deductible"] == 30000

def test_deductible_charge_less_than_remaining():
    result = calculate_deductible(1000, 5000, 0)
    assert result["deductible_applied"] == 1000
    assert result["amount_after_deductible"] == 0

def test_deductible_zero_charge():
    result = calculate_deductible(0, 5000, 0)
    assert result["deductible_applied"] == 0
    assert result["amount_after_deductible"] == 0


# ─── calculate_coinsurance ──────────────────────────────────────────────────

def test_coinsurance_80_20():
    result = calculate_coinsurance(25000, 80)
    assert result["plan_pays"] == 20000
    assert result["patient_pays"] == 5000

def test_coinsurance_60_40():
    result = calculate_coinsurance(10000, 60)
    assert result["plan_pays"] == 6000
    assert result["patient_pays"] == 4000

def test_coinsurance_100_percent():
    result = calculate_coinsurance(10000, 100)
    assert result["plan_pays"] == 10000
    assert result["patient_pays"] == 0

def test_coinsurance_zero_eligible():
    result = calculate_coinsurance(0, 80)
    assert result["plan_pays"] == 0
    assert result["patient_pays"] == 0


# ─── calculate_oop_cap ──────────────────────────────────────────────────────

def test_oop_cap_not_hit():
    result = calculate_oop_cap(5000, 15000, 0)
    assert result["final_patient_pays"] == 5000
    assert result["oop_cap_applied"] is False

def test_oop_cap_hit():
    result = calculate_oop_cap(20000, 15000, 0)
    assert result["final_patient_pays"] == 15000
    assert result["oop_cap_applied"] is True

def test_oop_cap_already_at_max():
    result = calculate_oop_cap(5000, 15000, 15000)
    assert result["final_patient_pays"] == 0
    assert result["oop_cap_applied"] is True

def test_oop_cap_partially_met():
    result = calculate_oop_cap(10000, 15000, 10000)
    assert result["final_patient_pays"] == 5000


# ─── determine_primary_payer ────────────────────────────────────────────────

def test_subscriber_rule_plan_a():
    result = determine_primary_payer(
        "Aarav Sen", "Aarav Sen", "Priya Sen",
        "1982-07-22", "1985-03-15", "self", "dependent"
    )
    assert result["primary_plan"] == "PLAN_A"
    assert result["rule_used"] == "SUBSCRIBER_RULE"

def test_subscriber_rule_plan_b():
    result = determine_primary_payer(
        "Priya Sen", "Aarav Sen", "Priya Sen",
        "1982-07-22", "1985-03-15", "dependent", "self"
    )
    assert result["primary_plan"] == "PLAN_B"
    assert result["rule_used"] == "SUBSCRIBER_RULE"

def test_birthday_rule_earlier_month():
    result = determine_primary_payer(
        "Aryan Sen", "Aarav Sen", "Priya Sen",
        "1982-07-22", "1985-03-15", "dependent", "dependent"
    )
    # Priya born March (03) < Aarav born July (07) → PLAN_B primary
    assert result["primary_plan"] == "PLAN_B"
    assert result["rule_used"] == "BIRTHDAY_RULE"

def test_birthday_rule_reasoning_present():
    result = determine_primary_payer(
        "Aryan Sen", "Aarav Sen", "Priya Sen",
        "1982-07-22", "1985-03-15", "dependent", "dependent"
    )
    assert "Birthday Rule" in result["reasoning"]


# ─── run_full_cob_calculation ───────────────────────────────────────────────

def test_full_cob_math_integrity():
    """Primary + secondary + OOP must equal total charges."""
    result = run_full_cob_calculation(
        patient_name="Priya Sen",
        total_charges=30000,
        primary_plan_id="PLAN_A",
        primary_deductible=5000, primary_deductible_met=0,
        primary_coinsurance=80, primary_oop_max=15000, primary_oop_met=0,
        secondary_deductible=3000, secondary_deductible_met=0,
        secondary_coinsurance=80, secondary_oop_max=10000, secondary_oop_met=0,
    )
    total = round(result["primary_plan_pays"] + result["secondary_plan_pays"] + result["total_patient_oop"], 2)
    assert abs(total - result["total_charges"]) <= 1, f"Math check failed: {total} != {result['total_charges']}"

def test_full_cob_dual_coverage_saves_money():
    """Patient OOP with dual coverage must be less than without any secondary."""
    result = run_full_cob_calculation(
        patient_name="Aarav Sen",
        total_charges=450000,
        primary_plan_id="PLAN_B",
        primary_deductible=3000, primary_deductible_met=0,
        primary_coinsurance=80, primary_oop_max=20000, primary_oop_met=0,
        secondary_deductible=5000, secondary_deductible_met=0,
        secondary_coinsurance=80, secondary_oop_max=15000, secondary_oop_met=0,
    )
    assert result["savings_from_dual_coverage"] >= 0
    assert result["total_patient_oop"] < 450000

def test_full_cob_zero_charges():
    result = run_full_cob_calculation(
        "Test", 0, "PLAN_A", 5000, 0, 80, 15000, 0, 3000, 0, 80, 10000, 0
    )
    assert result["total_patient_oop"] == 0
    assert result["total_insurance_paid"] == 0
