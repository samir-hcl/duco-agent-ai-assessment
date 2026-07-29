"""OCR tools using Google Gemini Vision.

Design: These tools wrap Gemini Vision API calls for medical
document OCR. The IntakeAgent calls these tools to extract
structured data from scanned documents.
"""
import os
import json
import base64


def extract_medical_document(
    image_base64: str,
    mime_type: str,
    document_type: str
) -> dict:
    """Extract structured data from a medical document using Gemini Vision OCR.
    
    Args:
        image_base64: Base64-encoded image data
        mime_type: MIME type of the image (e.g., 'image/jpeg')
        document_type: One of 'invoice', 'estimate', 'mri_report'
    
    Returns:
        dict with success status, extracted data, and extraction method
    """
    api_key = os.environ.get("GOOGLE_GEMINI_API_KEY", "")
    if not api_key:
        return {"error": "No Gemini API key configured", "fallback": True}

    prompts = {
        "invoice": (
            "You are a medical billing OCR specialist. Analyze this scanned "
            "medical invoice image and extract: patientName, patientDOB, "
            "providerName, providerType, dateOfService, diagnosis, services "
            "(array of {description, cptCode, charge}), totalAmount. Return JSON only."
        ),
        "estimate": (
            "You are a medical billing OCR specialist. Analyze this surgeon "
            "billing estimate image and extract: patientName, patientDOB, "
            "surgeonName, facility, proposedDate, procedures (array of "
            "{cptCode, description, estimatedCost}), totalEstimate, diagnosis, "
            "icd10Codes (array). Return JSON only."
        ),
        "mri_report": (
            "You are a radiology report specialist. Extract: patientName, "
            "patientDOB, referringPhysician, facility, dateOfExamination, "
            "findings, impression (array), recommendation. Return JSON only."
        ),
    }

    try:
        from google import genai

        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=[
                {
                    "role": "user",
                    "parts": [
                        {"text": prompts.get(document_type, prompts["invoice"])},
                        {
                            "inline_data": {
                                "mime_type": mime_type,
                                "data": image_base64,
                            }
                        },
                    ],
                }
            ],
        )
        result_text = response.text
        parsed = json.loads(
            result_text.replace("```json", "").replace("```", "").strip()
        )
        return {
            "success": True,
            "data": parsed,
            "extraction_method": "GEMINI_VISION_OCR",
        }
    except Exception as e:
        return {"error": str(e), "fallback": True}


def classify_document(filename: str, content_snippet: str = "") -> dict:
    """Classify a medical document by type based on filename and content.
    
    Args:
        filename: Name of the uploaded file
        content_snippet: Optional text excerpt for content-aware classification
    
    Returns:
        dict with type and confidence
    """
    name = filename.lower()
    snippet = content_snippet.lower()

    if any(w in name for w in ["invoice", "bill", "receipt", "pt_"]) or any(
        w in snippet for w in ["invoice", "therapy session"]
    ):
        return {"type": "invoice", "confidence": 0.9}
    if any(w in name for w in ["estimate", "surgeon", "surgery"]) or any(
        w in snippet for w in ["estimate", "reconstruction"]
    ):
        return {"type": "estimate", "confidence": 0.9}
    if any(w in name for w in ["mri", "report", "radiology"]) or any(
        w in snippet for w in ["impression", "findings"]
    ):
        return {"type": "mri_report", "confidence": 0.9}
    if any(w in name for w in ["query", "question"]) or any(
        w in snippet for w in ["how much", "which plan"]
    ):
        return {"type": "user_query", "confidence": 0.85}
    return {"type": "unknown", "confidence": 0.3}
