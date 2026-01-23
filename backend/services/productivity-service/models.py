from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
from datetime import datetime

class Attachment(BaseModel):
    id: Optional[str] = None
    name: str
    url: str
    type: Optional[str] = "file"
    drive_id: Optional[str] = None
    mime_type: Optional[str] = None

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: str = "todo"
    assignee_id: Optional[str] = None
    role_required: Optional[str] = None
    project_id: Optional[str] = None
    entity_type: Optional[str] = "client"  # 'client' o 'lead' per distinguere il tipo di entità
    priority: Optional[str] = "medium"
    estimated_minutes: int = 0
    actual_minutes: Optional[int] = None  # Tempo effettivo impiegato (obbligatorio al completamento)
    due_date: Optional[datetime] = None
    icon: Optional[str] = None
    category_id: Optional[str] = None
    # Nuovo: tipo item (task o evento)
    item_type: Optional[str] = "task"  # 'task' o 'event'
    # Campi specifici per eventi (Google Calendar)
    event_start_time: Optional[datetime] = None
    event_end_time: Optional[datetime] = None
    event_participants: Optional[List[str]] = []  # Lista di email partecipanti
    dependencies: Union[List[str], List[Dict[str, Any]]] = []
    metadata: Dict[str, Any] = {}
    attachments: List[Attachment] = []

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    assignee_id: Optional[str] = None
    role_required: Optional[str] = None
    project_id: Optional[str] = None
    entity_type: Optional[str] = None  # 'client' o 'lead'
    priority: Optional[str] = None
    estimated_minutes: Optional[int] = None
    actual_minutes: Optional[int] = None  # Tempo effettivo impiegato
    due_date: Optional[datetime] = None
    icon: Optional[str] = None
    category_id: Optional[str] = None
    # Tipo item
    item_type: Optional[str] = None  # 'task' o 'event'
    # Campi specifici per eventi
    event_start_time: Optional[datetime] = None
    event_end_time: Optional[datetime] = None
    event_participants: Optional[List[str]] = None
    dependencies: Optional[Union[List[str], List[Dict[str, Any]]]] = None
    metadata: Optional[Dict[str, Any]] = None
    attachments: Optional[List[Attachment]] = None

class Task(TaskBase):
    id: str
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    google_event_id: Optional[str] = None
    efficiency_score: Optional[int] = None  # Punteggio efficienza calcolato

class WorkflowTemplate(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    trigger_type: Optional[str] = "manual"  # 'manual', 'event', 'pipeline_stage'
    trigger_event: Optional[str] = None  # 'client_created', 'contract_signed', 'lead_stage_changed'
    entity_type: Optional[str] = "client"  # 'client' o 'lead'
    trigger_pipeline_stage: Optional[str] = None  # Stage della pipeline (es. 'optin', 'prima_chiamata')
    tasks_definition: List[Dict[str, Any]] = []
    trigger_services: List[str] = [] 

class TaskStatus(BaseModel):
    id: str
    label: str
    color: str
    order_index: int
    is_default: bool = False
    is_terminal: bool = False

# NUOVO: Modello per Categorie Configurable
class TaskCategoryBase(BaseModel):
    label: str
    tone: str # 'critical', 'warning', 'success', 'info', 'base'
    keywords: List[str] = [] # Parole chiave per auto-assegnazione
    icon: Optional[str] = None # Icona di default per questa categoria

class TaskCategory(TaskCategoryBase):
    id: str
    order_index: int = 0
    is_system: bool = False # Se true, non cancellabile

class SyncTaskRequest(BaseModel):
    user_id: int
    task_id: str
    title: str
    description: Optional[str] = None
    due_date: str # ISO format
    google_event_id: Optional[str] = None
    action: str = "create" # create, update, delete
