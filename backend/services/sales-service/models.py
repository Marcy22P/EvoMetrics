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

# --- LEAD TAGS (customizzabili) ---
class LeadTagBase(BaseModel):
    label: str
    color: str = "base"  # base, info, success, warning, critical, attention
    index: int = 0

class LeadTagCreate(LeadTagBase):
    pass

class LeadTagUpdate(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None
    index: Optional[int] = None

class LeadTag(LeadTagBase):
    id: int
    is_system: bool = False  # True se è un tag di default che non può essere eliminato
    
    class Config:
        from_attributes = True

# Tag di default per i lead (per seeding iniziale)
DEFAULT_LEAD_TAGS = [
    {"label": "Fissato calendly", "color": "success", "index": 0},
    {"label": "Non fissato", "color": "warning", "index": 1},
    {"label": "Da richiamare", "color": "info", "index": 2},
    {"label": "Non interessato", "color": "critical", "index": 3},
    {"label": "Non ha budget", "color": "attention", "index": 4},
    {"label": "Squalificato", "color": "base", "index": 5},
]

# --- LEADS ---
# Deprecato - ora usiamo LeadTags dinamici
RESPONSE_STATUS_OPTIONS = ["pending", "no_show", "show", "followup", "qualified", "not_interested", "callback"]

class LeadBase(BaseModel):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    azienda: Optional[str] = None  # Nome azienda
    stage: Optional[str] = "optin"
    notes: Optional[str] = None  # Legacy - campo singolo (verrà deprecato)
    response_status: Optional[str] = "pending"  # Deprecato - mantenuto per compatibilità
    lead_tag_id: Optional[int] = None  # Nuovo sistema di tag customizzabili
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
    response_status: Optional[str] = None  # Deprecato - mantenuto per compatibilità
    lead_tag_id: Optional[int] = None  # Nuovo sistema di tag customizzabili
    structured_notes: Optional[List[LeadNote]] = None  # Note strutturate

class Lead(LeadBase):
    id: str
    source: str
    clickfunnels_data: Optional[Dict[str, Any]] = None
    lead_tag: Optional[LeadTag] = None  # Tag associato (opzionale, popolato dal backend)
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
