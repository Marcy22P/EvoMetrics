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

# --- LEAD TAGS (customizzabili con colori infiniti) ---
class LeadTagBase(BaseModel):
    label: str
    color: str = "base"
    hex_color: Optional[str] = None  # V2: colore hex custom (#FF5733)
    index: int = 0

class LeadTagCreate(LeadTagBase):
    pass

class LeadTagUpdate(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = None
    hex_color: Optional[str] = None
    index: Optional[int] = None

class LeadTag(LeadTagBase):
    id: int
    is_system: bool = False
    
    class Config:
        from_attributes = True

DEFAULT_LEAD_TAGS = [
    {"label": "Fissato calendly", "color": "success", "index": 0},
    {"label": "Non fissato", "color": "warning", "index": 1},
    {"label": "Da richiamare", "color": "info", "index": 2},
    {"label": "Non interessato", "color": "critical", "index": 3},
    {"label": "Non ha budget", "color": "attention", "index": 4},
    {"label": "Squalificato", "color": "base", "index": 5},
]

# --- DEAL SERVICE (V2) ---
class DealService(BaseModel):
    name: str
    price: float = 0

# --- LEADS ---
RESPONSE_STATUS_OPTIONS = ["pending", "no_show", "show", "followup", "qualified", "not_interested", "callback"]

SOURCE_CHANNEL_OPTIONS = [
    "Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads",
    "Referral", "Passaparola", "Sito Web", "Organico",
    "ClickFunnels", "Email Marketing", "Evento", "Altro",
]

class LeadBase(BaseModel):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    azienda: Optional[str] = None
    stage: Optional[str] = "optin"
    notes: Optional[str] = None
    response_status: Optional[str] = "pending"
    lead_tag_id: Optional[int] = None
    structured_notes: Optional[List[LeadNote]] = []
    # V2 fields
    deal_value: Optional[float] = None
    deal_currency: Optional[str] = "EUR"
    deal_services: Optional[List[DealService]] = None
    linked_preventivo_id: Optional[str] = None
    linked_contratto_id: Optional[str] = None
    source_channel: Optional[str] = None
    assigned_to_user_id: Optional[str] = None

class LeadCreate(LeadBase):
    clickfunnels_data: Optional[Dict[str, Any]] = None

class LeadUpdate(BaseModel):
    stage: Optional[str] = None
    notes: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    azienda: Optional[str] = None
    response_status: Optional[str] = None
    lead_tag_id: Optional[int] = None
    structured_notes: Optional[List[LeadNote]] = None
    # V2 fields
    deal_value: Optional[float] = None
    deal_currency: Optional[str] = None
    deal_services: Optional[List[DealService]] = None
    linked_preventivo_id: Optional[str] = None
    linked_contratto_id: Optional[str] = None
    source_channel: Optional[str] = None
    assigned_to_user_id: Optional[str] = None

class Lead(LeadBase):
    id: str
    source: str
    clickfunnels_data: Optional[Dict[str, Any]] = None
    lead_tag: Optional[LeadTag] = None
    assigned_to_user: Optional[Dict[str, Any]] = None  # V2: {id, username, nome, cognome}
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# --- ANALYTICS (V2) ---
class MonthlyValueItem(BaseModel):
    month: int
    label: str
    total_value: float
    leads_count: int
    delta_pct: Optional[float] = None

class MonthlyValueResponse(BaseModel):
    year: int
    months: List[MonthlyValueItem]
    year_total: float
