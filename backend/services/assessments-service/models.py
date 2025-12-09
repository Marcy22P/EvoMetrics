"""
Pydantic models per Assessments Service
"""

from pydantic import BaseModel
from typing import Optional, Dict, Any


class AssessmentData(BaseModel):
    """Dati per creare un assessment (dal webhook)"""
    data: Dict[str, Any]  # Dati del form assessment


class AssessmentResponse(BaseModel):
    """Risposta con dati assessment"""
    id: str
    data: Dict[str, Any]
    status: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    source: Optional[str] = None
    client_info: Optional[Dict[str, Any]] = None
    notes: Optional[str] = None


class WebhookResponse(BaseModel):
    """Risposta del webhook"""
    status: str
    message: str
    id: Optional[str] = None


