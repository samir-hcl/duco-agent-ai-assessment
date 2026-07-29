"""Output generation tools for pre-auth letters and TTS scripts."""
from datetime import datetime


def generate_preauth_letter(
    patient_name: str,
    patient_dob: str,
    insurer_name: str,
    plan_name: str,
    policy_number: str,
    letter_type: str,
    procedures: list[dict],
    diagnoses: list[dict],
    estimated_cost: float,
    provider_name: str,
) -> dict:
    """Generate a formatted pre-authorization request letter.
    
    Args:
        patient_name: Patient's full name
        patient_dob: Patient's date of birth
        insurer_name: Insurance company name
        plan_name: Insurance plan name
        policy_number: Policy number
        letter_type: 'primary' or 'secondary'
        procedures: List of dicts with 'code' and 'description'
        diagnoses: List of dicts with 'code' and 'description'
        estimated_cost: Total estimated cost
        provider_name: Treating physician name
    
    Returns:
        dict with letter content and metadata
    """
    today = datetime.now().strftime("%B %d, %Y")
    proc_list = "\n".join(
        f"  - CPT {p['code']}: {p['description']}" for p in procedures
    )
    diag_list = "\n".join(
        f"  - {d['code']}: {d['description']}" for d in diagnoses
    )

    content = f"""PRE-AUTHORIZATION REQUEST
{'=' * 50}
Date: {today}
To: {insurer_name} - {plan_name}
Policy: {policy_number}
Type: {letter_type.upper()} Insurance Submission

RE: Pre-Authorization Request for {patient_name}

Dear Medical Review Team,

I am writing to request pre-authorization for the following
medical procedures for our patient, {patient_name} (DOB: {patient_dob}).

PROCEDURES REQUESTED:
{proc_list}

SUPPORTING DIAGNOSES:
{diag_list}

ESTIMATED COST: Rs. {estimated_cost:,.0f}

CLINICAL JUSTIFICATION:
The above procedures are medically necessary based on the
patient's diagnosis and clinical presentation. Conservative
treatment options have been explored and deemed insufficient.
The proposed intervention represents the standard of care
for the documented conditions.

Please process this request at your earliest convenience.
All supporting documentation is enclosed.

Sincerely,
{provider_name}
Attending Physician
"""
    return {
        "patient_name": patient_name,
        "letter_type": letter_type,
        "insurer_name": insurer_name,
        "content": content,
        "generated_at": datetime.now().isoformat(),
    }


def generate_tts_script(
    patients: list[str],
    total_charges: float,
    total_insurance_paid: float,
    total_patient_oop: float,
    savings: float,
    claim_details: list[dict],
) -> dict:
    """Generate a TTS-ready spoken summary of the COB final verdict.
    
    Args:
        patients: List of patient names
        total_charges: Sum of all charges
        total_insurance_paid: Sum of all insurance payments
        total_patient_oop: Sum of all patient OOP costs
        savings: Total savings from dual coverage
        claim_details: List of per-claim calculation dicts
    
    Returns:
        dict with script text and structured sections
    """
    details = ""
    for claim in claim_details:
        details += (
            f"For {claim['patient_name']}, total charges are Rupees "
            f"{claim['total_charges']:,.0f}. "
            f"The primary plan pays Rupees {claim['primary_plan_pays']:,.0f}. "
            f"The secondary plan covers an additional Rupees "
            f"{claim['secondary_plan_pays']:,.0f}. "
            f"Out-of-pocket cost is Rupees {claim['total_patient_oop']:,.0f}. "
        )

    script = (
        f"Hello. Here is your Coordination of Benefits analysis for "
        f"{', '.join(patients)}.\n\n"
        f"{details}\n"
        f"In total, charges are Rupees {total_charges:,.0f}. "
        f"Insurance covers Rupees {total_insurance_paid:,.0f}. "
        f"Your combined out-of-pocket is Rupees {total_patient_oop:,.0f}. "
        f"Dual coverage saved you Rupees {savings:,.0f}.\n\n"
        f"Next steps: Submit the pre-authorization letters to both insurers. "
        f"Submit to the primary insurer first, then the secondary with the "
        f"primary explanation of benefits attached."
    )

    return {
        "script": script,
        "sections": [
            {"title": "Introduction", "content": f"Analysis for {', '.join(patients)}"},
            *[
                {
                    "title": f"{c['patient_name']}'s Claim",
                    "content": (
                        f"Charges: Rs.{c['total_charges']:,.0f}, "
                        f"Primary: Rs.{c['primary_plan_pays']:,.0f}, "
                        f"Secondary: Rs.{c['secondary_plan_pays']:,.0f}, "
                        f"OOP: Rs.{c['total_patient_oop']:,.0f}"
                    ),
                }
                for c in claim_details
            ],
            {
                "title": "Summary",
                "content": (
                    f"Total: Rs.{total_charges:,.0f}, "
                    f"Insured: Rs.{total_insurance_paid:,.0f}, "
                    f"OOP: Rs.{total_patient_oop:,.0f}, "
                    f"Savings: Rs.{savings:,.0f}"
                ),
            },
            {
                "title": "Next Steps",
                "content": (
                    "Submit pre-auth letters to primary insurer first, "
                    "then secondary with EOB."
                ),
            },
        ],
    }
