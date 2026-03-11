"""
Pydantic models per Subtitle Service
Definisce enum stati, request/response models e strutture dati per il workflow sottotitoli.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


# ========================
# ENUMERAZIONI
# ========================

class JobStatus(str, Enum):
    DRAFT = "draft"
    QUEUED = "queued"
    PROCESSING = "processing"
    GENERATED = "generated"
    IN_REVIEW = "in_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    ERROR = "error"


class ContentType(str, Enum):
    ORGANICO = "organico"
    PAID_ADS = "paid_ads"


class SubtitleFormat(str, Enum):
    SRT = "srt"
    LRC = "lrc"
    ASS = "ass"
    DUMP = "dump"


class EventType(str, Enum):
    JOB_CREATED = "job_created"
    JOB_QUEUED = "job_queued"
    PROCESSING_STARTED = "processing_started"
    AUDIO_EXTRACTED = "audio_extracted"
    TRANSCRIPTION_COMPLETED = "transcription_completed"
    RATING_COMPLETED = "rating_completed"
    SEGMENTS_GENERATED = "segments_generated"
    EXPORT_COMPLETED = "export_completed"
    DRIVE_UPLOAD_COMPLETED = "drive_upload_completed"
    JOB_GENERATED = "job_generated"
    SUBMITTED_FOR_REVIEW = "submitted_for_review"
    VERSION_UPDATED = "version_updated"
    JOB_APPROVED = "job_approved"
    JOB_REJECTED = "job_rejected"
    ERROR_OCCURRED = "error_occurred"
    RETRY_ATTEMPTED = "retry_attempted"


# ========================
# STRUTTURE DATI SEGMENTO
# ========================

class SubtitleSegment(BaseModel):
    """Singolo segmento di sottotitolo"""
    index: int
    start_time: float  # secondi
    end_time: float    # secondi
    text: str
    confidence: Optional[float] = None
    line1: Optional[str] = None  # Prima riga (max 42 caratteri)
    line2: Optional[str] = None  # Seconda riga (max 42 caratteri)


# ========================
# REQUEST MODELS
# ========================

class CreateJobRequest(BaseModel):
    """Richiesta creazione job sottotitoli"""
    cliente_id: str
    drive_file_id: str
    content_type: ContentType
    created_by_user_id: Optional[str] = None  # Popolato dal token se non fornito
    metadata: Optional[Dict[str, Any]] = None


class SubmitReviewRequest(BaseModel):
    """Richiesta invio a revisione"""
    assigned_reviewer_id: Optional[str] = None  # Se non specificato, inbox globale


class ApproveJobRequest(BaseModel):
    """Richiesta approvazione job"""
    notes: Optional[str] = None


class RejectJobRequest(BaseModel):
    """Richiesta rifiuto job"""
    notes: str  # Obbligatorie per il rifiuto
    request_changes: Optional[List[str]] = None  # Lista modifiche richieste


class UpdateVersionRequest(BaseModel):
    """Richiesta aggiornamento versione sottotitoli (revisore)"""
    segments: List[SubtitleSegment]
    notes: Optional[str] = None


# ========================
# RESPONSE MODELS
# ========================

class SubtitleVersionResponse(BaseModel):
    """Risposta versione sottotitoli"""
    id: str
    job_id: str
    version: int
    segments: Optional[List[SubtitleSegment]] = None
    drive_srt_file_id: Optional[str] = None
    drive_lrc_file_id: Optional[str] = None
    drive_ass_file_id: Optional[str] = None
    drive_dump_file_id: Optional[str] = None
    created_at: str
    created_by_user_id: Optional[str] = None
    notes: Optional[str] = None


class SubtitleEventResponse(BaseModel):
    """Risposta evento audit"""
    id: str
    job_id: str
    event_type: str
    user_id: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    created_at: str


class SubtitleJobResponse(BaseModel):
    """Risposta dettaglio job"""
    id: str
    cliente_id: str
    cliente_name: Optional[str] = None
    content_type: str
    input_drive_file_id: str
    input_drive_file_name: Optional[str] = None
    status: str
    progress: int = 0
    error_message: Optional[str] = None
    retry_count: int = 0
    created_by_user_id: Optional[str] = None
    assigned_reviewer_id: Optional[str] = None
    next_action: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str
    # Sotto-risorse (caricate opzionalmente)
    versions: Optional[List[SubtitleVersionResponse]] = None
    events: Optional[List[SubtitleEventResponse]] = None


class SubtitleJobListResponse(BaseModel):
    """Risposta lista job"""
    jobs: List[SubtitleJobResponse]
    total: int


class JobStatusResponse(BaseModel):
    """Risposta stato job (leggera)"""
    id: str
    status: str
    progress: int
    error_message: Optional[str] = None


# ========================
# COMMENT MODELS
# ========================

class CreateCommentRequest(BaseModel):
    """Richiesta creazione commento"""
    drive_file_id: str
    cliente_id: str
    content: str
    parent_id: Optional[str] = None


class CommentResponse(BaseModel):
    """Risposta commento"""
    id: str
    drive_file_id: str
    cliente_id: str
    user_id: str
    user_name: Optional[str] = None
    content: str
    parent_id: Optional[str] = None
    created_at: str
    updated_at: str
    replies: Optional[List["CommentResponse"]] = None


# ========================
# PIPELINE MODELS (interno)
# ========================

class PipelineStepResult(BaseModel):
    """Risultato di uno step della pipeline (interno)"""
    step: str
    success: bool
    duration_ms: Optional[int] = None
    details: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class TranscriptionResult(BaseModel):
    """Risultato trascrizione singola variante (interno)"""
    strategy: str  # "standard", "enhanced", "fallback"
    segments: List[SubtitleSegment]
    confidence_avg: float
    word_count: int
    duration_seconds: float
    score: float = 0.0  # Rating calcolato


class PipelineResult(BaseModel):
    """Risultato completo pipeline (interno)"""
    job_id: str
    best_strategy: str
    best_score: float
    is_uncertain: bool = False  # confidence < 0.8
    segments: List[SubtitleSegment]
    transcription_results: List[TranscriptionResult]
    steps: List[PipelineStepResult]
    srt_content: Optional[str] = None
    lrc_content: Optional[str] = None
    ass_content: Optional[str] = None
    dump_content: Optional[str] = None
