from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

# --- STAGES ---
class PipelineStageBase(BaseModel):
    key: str
    label: str
    color: str = "base"
    index: int
    is_system: bool = False

class PipelineStageCreate(PipelineStageBase):
    pass

class PipelineStageUpdate(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None
    index: Optional[int] = None

class PipelineStage(PipelineStageBase):
    id: int
    
    class Config:
        from_attributes = True

# --- LEAD NOTE ---
class LeadNote(BaseModel):
    id: str
    content: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class LeadNoteCreate(BaseModel):
    content: str

# --- LEADS ---
# Possibili stati di risposta del lead
RESPONSE_STATUS_OPTIONS = ["pending", "no_show", "show", "followup", "qualified", "not_interested", "callback"]

class LeadBase(BaseModel):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    azienda: Optional[str] = None  # Nome azienda
    stage: Optional[str] = "optin"
    notes: Optional[str] = None  # Legacy - campo singolo (verrà deprecato)
    response_status: Optional[str] = "pending"  # Stato risposta: pending, no_show, show, followup, etc.
    structured_notes: Optional[List[LeadNote]] = []  # Note strutturate

class LeadCreate(LeadBase):
    clickfunnels_data: Optional[Dict[str, Any]] = None

class LeadUpdate(BaseModel):
    stage: Optional[str] = None
    notes: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    azienda: Optional[str] = None  # Nome azienda
    response_status: Optional[str] = None  # Stato risposta
    structured_notes: Optional[List[LeadNote]] = None  # Note strutturate

class Lead(LeadBase):
    id: str
    source: str
    clickfunnels_data: Optional[Dict[str, Any]] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
