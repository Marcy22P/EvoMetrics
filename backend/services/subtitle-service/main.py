"""
Subtitle Service - Microservizio per workflow sottotitoli
Gestisce: creazione job, pipeline AI, revisione, approvazione, export e integrazione Drive.

Pattern: identico a clienti-service/main.py (FastAPI, databases, jose JWT, Drive, RBAC).
"""

from fastapi import FastAPI, HTTPException, status, Depends, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from typing import List, Dict, Any, Optional
import os
import sys
import json
import uuid
import asyncio
import io
from pathlib import Path
from datetime import datetime
from jose import JWTError, jwt
from contextlib import asynccontextmanager

from database import (
    database,
    init_database,
    close_database,
    subtitle_jobs_table,
    subtitle_versions_table,
    subtitle_events_table,
    content_comments_table,
)
from models import (
    JobStatus,
    ContentType,
    SubtitleFormat,
    EventType,
    SubtitleSegment,
    CreateJobRequest,
    SubmitReviewRequest,
    ApproveJobRequest,
    RejectJobRequest,
    UpdateVersionRequest,
    SubtitleJobResponse,
    SubtitleJobListResponse,
    SubtitleVersionResponse,
    SubtitleEventResponse,
    JobStatusResponse,
    CreateCommentRequest,
    CommentResponse,
)

# Carica variabili d'ambiente dalla root del progetto
try:
    from dotenv import load_dotenv
    root_dir = Path(__file__).parent.parent.parent.parent
    env_path = root_dir / ".env"
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()
except ImportError:
    pass

# Drive integration (importa dal clienti-service via path relativo)
try:
    clienti_service_path = Path(__file__).parent.parent / "clienti-service"
    if str(clienti_service_path) not in sys.path:
        sys.path.insert(0, str(clienti_service_path))
    from drive_utils import drive_service
    from drive_structure import drive_structure
except ImportError:
    print("⚠️ Modulo drive_utils non trovato dal subtitle-service")
    drive_service = None
    drive_structure = None

# JWT Configuration
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
ALGORITHM = "HS256"


# ========================
# AUTH & RBAC
# ========================

async def get_current_user_token(request: Request) -> str:
    """Estrae il token da Header Bearer OPPURE da query param ?token="""
    # 1. Prova Bearer header
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1]
    # 2. Fallback: query param (usato per download diretto nel browser)
    token = request.query_params.get("token")
    if token:
        return token
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token mancante",
    )


async def get_current_user(
    token: str = Depends(get_current_user_token),
) -> Dict[str, Any]:
    """Ottieni l'utente corrente dal token JWT"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    query = "SELECT id, username, role, is_active FROM users WHERE username = :username AND is_active = true"
    user = await database.fetch_one(query, {"username": username})
    if user is None:
        raise credentials_exception
    return dict(user)


async def get_user_assigned_cliente_ids(user_id: str) -> List[str]:
    """Ottiene la lista di ID clienti assegnati all'utente"""
    try:
        rows = await database.fetch_all(
            "SELECT cliente_id FROM cliente_assignees WHERE user_id = :user_id",
            {"user_id": str(user_id)},
        )
        return [row["cliente_id"] for row in rows]
    except Exception as e:
        print(f"⚠️ Errore caricamento clienti assegnati: {e}")
        return []


def is_admin_or_superadmin(user: Dict[str, Any]) -> bool:
    """Verifica se l'utente e' admin o superadmin"""
    return user.get("role") in ("admin", "superadmin")


async def get_cliente_name(cliente_id: str) -> Optional[str]:
    """Recupera nome azienda dal cliente_id"""
    try:
        row = await database.fetch_one(
            "SELECT nome_azienda FROM clienti WHERE id = :cid",
            {"cid": cliente_id},
        )
        return row["nome_azienda"] if row else None
    except Exception:
        return None


# ========================
# HELPERS DB
# ========================

async def update_job(job_id: str, **fields):
    """Aggiorna campi di un job nel DB"""
    fields["updated_at"] = datetime.utcnow()

    set_clauses = []
    params = {"job_id": job_id}
    for field, value in fields.items():
        set_clauses.append(f"{field} = :{field}")
        params[field] = value

    query = f"UPDATE subtitle_jobs SET {', '.join(set_clauses)} WHERE id = :job_id"
    await database.execute(query, params)


async def add_event(job_id: str, event_type, user_id: Optional[str], details: Optional[Dict] = None):
    """Aggiunge evento di audit"""
    event_id = str(uuid.uuid4())
    event_type_str = event_type.value if hasattr(event_type, "value") else str(event_type)
    await database.execute(
        subtitle_events_table.insert().values(
            id=event_id,
            job_id=job_id,
            event_type=event_type_str,
            user_id=user_id,
            details=json.dumps(details) if details else None,
            created_at=datetime.utcnow(),
        )
    )


async def save_version(
    job_id: str,
    version: int,
    segments: Any,
    drive_refs: Dict[str, Optional[str]],
    user_id: Optional[str],
    notes: Optional[str] = None,
):
    """Salva una versione di sottotitoli nel DB"""
    version_id = str(uuid.uuid4())
    await database.execute(
        subtitle_versions_table.insert().values(
            id=version_id,
            job_id=job_id,
            version=version,
            content=json.dumps(segments) if segments else None,
            drive_srt_file_id=drive_refs.get("drive_srt_file_id"),
            drive_lrc_file_id=drive_refs.get("drive_lrc_file_id"),
            drive_ass_file_id=drive_refs.get("drive_ass_file_id"),
            drive_dump_file_id=drive_refs.get("drive_dump_file_id"),
            notes=notes,
            created_at=datetime.utcnow(),
            created_by_user_id=user_id,
        )
    )
    return version_id


def serialize_job(row: Dict[str, Any]) -> SubtitleJobResponse:
    """Serializza un job dal database al formato API"""
    job_dict = dict(row)

    # Parse metadata JSON
    metadata = job_dict.get("metadata")
    if metadata and isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except json.JSONDecodeError:
            metadata = {}
    elif not metadata:
        metadata = {}

    return SubtitleJobResponse(
        id=job_dict["id"],
        cliente_id=job_dict["cliente_id"],
        content_type=job_dict["content_type"],
        input_drive_file_id=job_dict["input_drive_file_id"],
        input_drive_file_name=job_dict.get("input_drive_file_name"),
        status=job_dict["status"],
        progress=job_dict.get("progress", 0),
        error_message=job_dict.get("error_message"),
        retry_count=job_dict.get("retry_count", 0),
        created_by_user_id=job_dict.get("created_by_user_id"),
        assigned_reviewer_id=job_dict.get("assigned_reviewer_id"),
        next_action=job_dict.get("next_action"),
        metadata=metadata,
        created_at=job_dict["created_at"].isoformat() if isinstance(job_dict["created_at"], datetime) else str(job_dict["created_at"]),
        updated_at=job_dict["updated_at"].isoformat() if isinstance(job_dict["updated_at"], datetime) else str(job_dict["updated_at"]),
    )


def serialize_version(row: Dict[str, Any]) -> SubtitleVersionResponse:
    """Serializza una versione dal database"""
    v = dict(row)
    segments = None
    if v.get("content"):
        try:
            segments = json.loads(v["content"]) if isinstance(v["content"], str) else v["content"]
            segments = [SubtitleSegment(**s) for s in segments]
        except Exception:
            segments = None

    return SubtitleVersionResponse(
        id=v["id"],
        job_id=v["job_id"],
        version=v["version"],
        segments=segments,
        drive_srt_file_id=v.get("drive_srt_file_id"),
        drive_lrc_file_id=v.get("drive_lrc_file_id"),
        drive_ass_file_id=v.get("drive_ass_file_id"),
        drive_dump_file_id=v.get("drive_dump_file_id"),
        created_at=v["created_at"].isoformat() if isinstance(v["created_at"], datetime) else str(v["created_at"]),
        created_by_user_id=v.get("created_by_user_id"),
        notes=v.get("notes"),
    )


def serialize_event(row: Dict[str, Any]) -> SubtitleEventResponse:
    """Serializza un evento dal database"""
    e = dict(row)
    details = None
    if e.get("details"):
        try:
            details = json.loads(e["details"]) if isinstance(e["details"], str) else e["details"]
        except Exception:
            details = None

    return SubtitleEventResponse(
        id=e["id"],
        job_id=e["job_id"],
        event_type=e["event_type"],
        user_id=e.get("user_id"),
        details=details,
        created_at=e["created_at"].isoformat() if isinstance(e["created_at"], datetime) else str(e["created_at"]),
    )


# ========================
# LIFESPAN
# ========================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler per startup e shutdown"""
    print("🚀 Avvio Subtitle Service...")
    await init_database()
    print("✅ Subtitle Service avviato")
    yield
    print("⏹️ Spegnimento Subtitle Service...")
    await close_database()
    print("✅ Subtitle Service fermato")


# ========================
# APP
# ========================

app = FastAPI(
    title="Subtitle Service",
    description="Microservizio per workflow sottotitoli: creazione, trascrizione AI, revisione, approvazione",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========================
# HEALTH CHECK
# ========================

@app.get("/health")
async def health_check():
    drive_status = "connected" if (drive_service and drive_service.is_ready()) else "disconnected"
    return {"status": "healthy", "service": "subtitle-service", "drive": drive_status}


# ========================
# ENDPOINT 1: POST /api/subtitles/jobs - Crea e avvia job
# ========================

@app.post("/api/subtitles/jobs", response_model=SubtitleJobResponse)
async def create_job(
    request_data: CreateJobRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Crea un nuovo job di sottotitoli e avvia la pipeline in background.
    RBAC: Editor puo' avviare solo su file del cliente assegnato. Admin vede tutto.
    """
    user_id = str(current_user["id"])

    # RBAC: verifica accesso al cliente
    if not is_admin_or_superadmin(current_user):
        assigned_clients = await get_user_assigned_cliente_ids(user_id)
        if request_data.cliente_id not in assigned_clients:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Non sei assegnato a questo cliente",
            )

    # Idempotenza: se esiste gia' un job per questo file, ritornalo
    existing = await database.fetch_one(
        """SELECT * FROM subtitle_jobs
           WHERE input_drive_file_id = :file_id AND cliente_id = :cid
           AND status NOT IN ('error', 'rejected')
           ORDER BY created_at DESC LIMIT 1""",
        {"file_id": request_data.drive_file_id, "cid": request_data.cliente_id},
    )
    if existing:
        existing_job = serialize_job(dict(existing))
        existing_job.cliente_name = await get_cliente_name(existing_job.cliente_id)
        # Carica versioni
        version_rows = await database.fetch_all(
            "SELECT * FROM subtitle_versions WHERE job_id = :job_id ORDER BY version ASC",
            {"job_id": existing_job.id},
        )
        existing_job.versions = [serialize_version(dict(v)) for v in version_rows]
        return existing_job

    # Ottieni nome file e verifica formato da Drive
    input_file_name = None
    if drive_service and drive_service.is_ready():
        try:
            meta = drive_service.get_file_metadata(request_data.drive_file_id)
            if meta:
                input_file_name = meta.get("name")
                mime_type = meta.get("mimeType", "")
                
                # Verifica che il file sia un video supportato
                SUPPORTED_VIDEO_MIMES = [
                    "video/mp4", "video/quicktime",  # .mp4, .mov
                    "video/x-msvideo", "video/avi",  # .avi
                    "video/x-matroska",              # .mkv
                    "video/webm",                    # .webm
                ]
                SUPPORTED_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv", ".webm"]
                
                name_lower = (input_file_name or "").lower()
                is_video_mime = any(mime_type.startswith(m) for m in SUPPORTED_VIDEO_MIMES) or mime_type.startswith("video/")
                is_video_ext = any(name_lower.endswith(ext) for ext in SUPPORTED_EXTENSIONS)
                
                if not is_video_mime and not is_video_ext:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Formato file non supportato: {mime_type} ({input_file_name}). Formati accettati: MP4, MOV, AVI, MKV, WebM.",
                    )
                
                # Check dimensione file (max 2GB)
                file_size = int(meta.get("size", 0) or 0)
                if file_size > 2 * 1024 * 1024 * 1024:  # 2GB
                    raise HTTPException(
                        status_code=400,
                        detail=f"File troppo grande ({file_size / (1024*1024*1024):.1f}GB). Limite: 2GB.",
                    )
        except HTTPException:
            raise
        except Exception:
            pass

    # Crea job
    job_id = str(uuid.uuid4())
    now = datetime.utcnow()

    await database.execute(
        subtitle_jobs_table.insert().values(
            id=job_id,
            cliente_id=request_data.cliente_id,
            content_type=request_data.content_type.value,
            input_drive_file_id=request_data.drive_file_id,
            input_drive_file_name=input_file_name,
            status=JobStatus.QUEUED.value,
            progress=0,
            retry_count=0,
            created_by_user_id=request_data.created_by_user_id or user_id,
            metadata=json.dumps(request_data.metadata) if request_data.metadata else None,
            created_at=now,
            updated_at=now,
        )
    )

    await add_event(job_id, EventType.JOB_CREATED, user_id, {
        "cliente_id": request_data.cliente_id,
        "drive_file_id": request_data.drive_file_id,
        "content_type": request_data.content_type.value,
    })

    # Avvia pipeline in background
    cliente_name = await get_cliente_name(request_data.cliente_id) or request_data.cliente_id
    asyncio.create_task(
        _run_pipeline_with_retry(job_id, request_data.drive_file_id, cliente_name)
    )

    # Ritorna job creato
    job_row = await database.fetch_one(
        subtitle_jobs_table.select().where(subtitle_jobs_table.c.id == job_id)
    )
    return serialize_job(dict(job_row))


async def _run_pipeline_with_retry(job_id: str, drive_file_id: str, cliente_name: str):
    """
    Esegue la pipeline con retry controllato (max 3 tentativi).
    
    Retry SOLO per errori transitori (timeout, network, Drive temporaneo).
    NON retry per errori permanenti (file non trovato, API key mancante, 
    formato non supportato, errore di codice).
    """
    from pipeline import process_subtitle_job, MAX_RETRY_COUNT

    # Errori che NON devono triggerare retry (permanenti)
    NON_RETRYABLE_ERRORS = [
        "OPENAI_API_KEY non configurata",
        "File not found",
        "No audio track",
        "codec",
        "Pydantic",
        "ImportError",
        "ModuleNotFoundError",
        "not installed",
        "format",
        "permission denied",
        "403",
        "401",
    ]

    for attempt in range(MAX_RETRY_COUNT):
        try:
            await process_subtitle_job(
                job_id=job_id,
                drive_file_id=drive_file_id,
                cliente_name=cliente_name,
                drive_service_instance=drive_service,
                drive_structure_instance=drive_structure,
                update_job_callback=update_job,
                add_event_callback=add_event,
                save_version_callback=save_version,
            )
            return  # Successo, esci
        except Exception as e:
            error_str = str(e)
            print(f"❌ Pipeline tentativo {attempt + 1}/{MAX_RETRY_COUNT} fallito: {error_str}")

            # Aggiorna retry count
            await update_job(job_id, retry_count=attempt + 1)

            # Controlla se è un errore permanente (non retryabile)
            is_permanent = any(marker.lower() in error_str.lower() for marker in NON_RETRYABLE_ERRORS)

            if is_permanent or attempt >= MAX_RETRY_COUNT - 1:
                # Errore permanente O ultimo tentativo: stato ERROR definitivo
                reason = "errore permanente" if is_permanent else f"fallito dopo {MAX_RETRY_COUNT} tentativi"
                await update_job(
                    job_id,
                    status=JobStatus.ERROR.value,
                    error_message=f"Pipeline fallita ({reason}): {error_str[:300]}",
                )
                await add_event(job_id, EventType.ERROR_OCCURRED, None, {
                    "final_error": error_str[:500],
                    "total_attempts": attempt + 1,
                    "is_permanent": is_permanent,
                })
                return  # Esci definitivamente
            else:
                await add_event(job_id, EventType.RETRY_ATTEMPTED, None, {
                    "attempt": attempt + 1,
                    "error": error_str[:200],
                })
                # Attendi prima di riprovare (backoff esponenziale)
                wait_time = min(30, 5 * (2 ** attempt))
                print(f"⏳ Retry tra {wait_time}s...")
                await asyncio.sleep(wait_time)


# ========================
# ENDPOINT 2: GET /api/subtitles/jobs - Lista job
# ========================

@app.get("/api/subtitles/jobs", response_model=SubtitleJobListResponse)
async def list_jobs(
    cliente_id: Optional[str] = Query(None),
    job_status: Optional[str] = Query(None, alias="status"),
    assigned_to_me: Optional[bool] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Lista job sottotitoli con filtri.
    RBAC:
    - Editor: vede solo job dei propri clienti assegnati
    - Revisore/Admin con assigned_to_me=true: inbox globale con status=IN_REVIEW
    - Admin: vede tutto
    """
    user_id = str(current_user["id"])
    user_role = current_user.get("role", "user")

    # Costruisci query dinamica
    conditions = []
    params: Dict[str, Any] = {}

    # Filtro per status
    if job_status:
        conditions.append("sj.status = :status")
        params["status"] = job_status

    # Filtro per cliente
    if cliente_id:
        conditions.append("sj.cliente_id = :cliente_id")
        params["cliente_id"] = cliente_id

    # RBAC
    if is_admin_or_superadmin(current_user):
        # Admin: vede tutto (applica solo filtri espliciti)
        if assigned_to_me:
            # Inbox revisore per admin
            conditions.append("sj.status = :review_status")
            params["review_status"] = JobStatus.IN_REVIEW.value
    else:
        # Utente normale: filtra per clienti assegnati
        if assigned_to_me:
            # Inbox revisore: job in review assegnati a me o senza revisore specifico
            conditions.append(
                "(sj.assigned_reviewer_id = :user_id OR sj.assigned_reviewer_id IS NULL)"
            )
            conditions.append("sj.status = :review_status")
            params["user_id"] = user_id
            params["review_status"] = JobStatus.IN_REVIEW.value
        else:
            # Editor: solo clienti assegnati
            assigned_clients = await get_user_assigned_cliente_ids(user_id)
            if not assigned_clients:
                return SubtitleJobListResponse(jobs=[], total=0)

            # Genera placeholder per IN clause
            placeholders = ", ".join([f":cid_{i}" for i in range(len(assigned_clients))])
            conditions.append(f"sj.cliente_id IN ({placeholders})")
            for i, cid in enumerate(assigned_clients):
                params[f"cid_{i}"] = cid

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = f"""
        SELECT sj.* FROM subtitle_jobs sj
        {where_clause}
        ORDER BY sj.created_at DESC
    """

    rows = await database.fetch_all(query, params)
    jobs = []
    for row in rows:
        job = serialize_job(dict(row))
        # Arricchisci con nome cliente
        job.cliente_name = await get_cliente_name(job.cliente_id)
        jobs.append(job)

    return SubtitleJobListResponse(jobs=jobs, total=len(jobs))


# ========================
# ENDPOINT 3: GET /api/subtitles/jobs/{id} - Dettaglio job
# ========================

@app.get("/api/subtitles/jobs/{job_id}", response_model=SubtitleJobResponse)
async def get_job(
    job_id: str,
    include_versions: bool = Query(True),
    include_events: bool = Query(False),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Dettaglio job con versioni ed eventi (opzionale)."""
    row = await database.fetch_one(
        subtitle_jobs_table.select().where(subtitle_jobs_table.c.id == job_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job non trovato")

    job = serialize_job(dict(row))

    # RBAC check
    if not is_admin_or_superadmin(current_user):
        user_id = str(current_user["id"])
        assigned_clients = await get_user_assigned_cliente_ids(user_id)
        is_reviewer = job.assigned_reviewer_id == user_id
        is_in_review = job.status == JobStatus.IN_REVIEW.value
        if job.cliente_id not in assigned_clients and not (is_reviewer or is_in_review):
            raise HTTPException(status_code=403, detail="Non autorizzato")

    # Arricchisci con nome cliente
    job.cliente_name = await get_cliente_name(job.cliente_id)

    # Carica versioni
    if include_versions:
        version_rows = await database.fetch_all(
            "SELECT * FROM subtitle_versions WHERE job_id = :job_id ORDER BY version ASC",
            {"job_id": job_id},
        )
        job.versions = [serialize_version(dict(v)) for v in version_rows]

    # Carica eventi
    if include_events:
        event_rows = await database.fetch_all(
            "SELECT * FROM subtitle_events WHERE job_id = :job_id ORDER BY created_at ASC",
            {"job_id": job_id},
        )
        job.events = [serialize_event(dict(e)) for e in event_rows]

    return job


# ========================
# ENDPOINT 4: POST /api/subtitles/jobs/{id}/submit-review
# ========================

@app.post("/api/subtitles/jobs/{job_id}/submit-review", response_model=SubtitleJobResponse)
async def submit_for_review(
    job_id: str,
    request_data: SubmitReviewRequest = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Invia job a revisione (status -> IN_REVIEW)."""
    row = await database.fetch_one(
        subtitle_jobs_table.select().where(subtitle_jobs_table.c.id == job_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job non trovato")

    job_dict = dict(row)

    # Solo job GENERATED o REJECTED possono essere inviati a revisione
    if job_dict["status"] not in (JobStatus.GENERATED.value, JobStatus.REJECTED.value):
        raise HTTPException(
            status_code=400,
            detail=f"Il job deve essere in stato GENERATED o REJECTED per essere inviato a revisione (stato attuale: {job_dict['status']})",
        )

    # RBAC
    user_id = str(current_user["id"])
    if not is_admin_or_superadmin(current_user):
        assigned_clients = await get_user_assigned_cliente_ids(user_id)
        if job_dict["cliente_id"] not in assigned_clients:
            raise HTTPException(status_code=403, detail="Non autorizzato")

    reviewer_id = None
    if request_data and request_data.assigned_reviewer_id:
        reviewer_id = request_data.assigned_reviewer_id

    await update_job(
        job_id,
        status=JobStatus.IN_REVIEW.value,
        assigned_reviewer_id=reviewer_id,
    )
    await add_event(job_id, EventType.SUBMITTED_FOR_REVIEW, user_id, {
        "assigned_reviewer_id": reviewer_id,
    })

    updated = await database.fetch_one(
        subtitle_jobs_table.select().where(subtitle_jobs_table.c.id == job_id)
    )
    return serialize_job(dict(updated))


# ========================
# ENDPOINT 5: POST /api/subtitles/jobs/{id}/approve
# ========================

@app.post("/api/subtitles/jobs/{job_id}/approve", response_model=SubtitleJobResponse)
async def approve_job(
    job_id: str,
    request_data: ApproveJobRequest = None,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Approva job (crea v3 final, status -> APPROVED).
    Routing post-approvazione in base a content_type (organico/paid_ads).
    """
    row = await database.fetch_one(
        subtitle_jobs_table.select().where(subtitle_jobs_table.c.id == job_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job non trovato")

    job_dict = dict(row)

    if job_dict["status"] != JobStatus.IN_REVIEW.value:
        raise HTTPException(
            status_code=400,
            detail=f"Il job deve essere IN_REVIEW per essere approvato (stato attuale: {job_dict['status']})",
        )

    user_id = str(current_user["id"])

    # Prendi l'ultima versione esistente
    latest_version = await database.fetch_one(
        "SELECT * FROM subtitle_versions WHERE job_id = :job_id ORDER BY version DESC LIMIT 1",
        {"job_id": job_id},
    )

    if not latest_version:
        raise HTTPException(status_code=400, detail="Nessuna versione disponibile per l'approvazione")

    latest_dict = dict(latest_version)

    # Crea versione v3 (approved / final)
    drive_refs = {
        "drive_srt_file_id": latest_dict.get("drive_srt_file_id"),
        "drive_lrc_file_id": latest_dict.get("drive_lrc_file_id"),
        "drive_ass_file_id": latest_dict.get("drive_ass_file_id"),
        "drive_dump_file_id": latest_dict.get("drive_dump_file_id"),
    }

    # Se la versione corrente ha contenuto, re-upload come _final su Drive
    cliente_name = await get_cliente_name(job_dict["cliente_id"]) or job_dict["cliente_id"]
    if latest_dict.get("content") and drive_service and drive_service.is_ready():
        try:
            from pipeline import (
                export_srt,
                export_lrc,
                export_ass,
                export_dump,
                upload_subtitle_files_to_drive,
            )

            segments_data = json.loads(latest_dict["content"]) if isinstance(latest_dict["content"], str) else latest_dict["content"]
            segments = [SubtitleSegment(**s) for s in segments_data]

            srt = export_srt(segments)
            lrc = export_lrc(segments)
            ass = export_ass(segments, video_name=job_dict.get("input_drive_file_name", "video"))
            dump = export_dump(segments, {"status": "approved", "approved_by": user_id})

            new_drive_refs = upload_subtitle_files_to_drive(
                drive_service, drive_structure, cliente_name,
                job_dict.get("input_drive_file_name", "video"),
                99,  # version 99 = "final" (mapped to _final suffix)
                srt, lrc, ass, dump,
            )
            drive_refs.update({k: v for k, v in new_drive_refs.items() if v})
        except Exception as e:
            print(f"⚠️ Re-upload finale fallito, uso drive refs esistenti: {e}")

    await save_version(
        job_id=job_id,
        version=3,
        segments=latest_dict.get("content"),
        drive_refs=drive_refs,
        user_id=user_id,
        notes=request_data.notes if request_data else "Approvato",
    )

    # Routing post-approvazione
    next_action = None
    content_type = job_dict.get("content_type", "organico")
    if content_type == ContentType.ORGANICO.value:
        next_action = "SCHEDULED_FOR_PUBLISH"
    elif content_type == ContentType.PAID_ADS.value:
        next_action = "CREATIVE_ITERATION"

    await update_job(
        job_id,
        status=JobStatus.APPROVED.value,
        next_action=next_action,
    )
    await add_event(job_id, EventType.JOB_APPROVED, user_id, {
        "notes": request_data.notes if request_data else None,
        "next_action": next_action,
        "content_type": content_type,
    })

    updated = await database.fetch_one(
        subtitle_jobs_table.select().where(subtitle_jobs_table.c.id == job_id)
    )
    return serialize_job(dict(updated))


# ========================
# ENDPOINT 6: POST /api/subtitles/jobs/{id}/reject
# ========================

@app.post("/api/subtitles/jobs/{job_id}/reject", response_model=SubtitleJobResponse)
async def reject_job(
    job_id: str,
    request_data: RejectJobRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Rifiuta job con note (status -> REJECTED)."""
    row = await database.fetch_one(
        subtitle_jobs_table.select().where(subtitle_jobs_table.c.id == job_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job non trovato")

    job_dict = dict(row)

    if job_dict["status"] != JobStatus.IN_REVIEW.value:
        raise HTTPException(
            status_code=400,
            detail=f"Il job deve essere IN_REVIEW per essere rifiutato (stato attuale: {job_dict['status']})",
        )

    user_id = str(current_user["id"])

    await update_job(
        job_id,
        status=JobStatus.REJECTED.value,
        error_message=request_data.notes,
    )
    await add_event(job_id, EventType.JOB_REJECTED, user_id, {
        "notes": request_data.notes,
        "request_changes": request_data.request_changes,
    })

    updated = await database.fetch_one(
        subtitle_jobs_table.select().where(subtitle_jobs_table.c.id == job_id)
    )
    return serialize_job(dict(updated))


# ========================
# ENDPOINT 7: PUT /api/subtitles/jobs/{id}/versions/{version}
# ========================

@app.put("/api/subtitles/jobs/{job_id}/versions/{version}", response_model=SubtitleVersionResponse)
async def update_version(
    job_id: str,
    version: int,
    request_data: UpdateVersionRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Aggiorna segmenti sottotitoli (crea v2 revised).
    Il revisore modifica i segmenti senza alterare il significato.
    """
    row = await database.fetch_one(
        subtitle_jobs_table.select().where(subtitle_jobs_table.c.id == job_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job non trovato")

    job_dict = dict(row)

    # Verifica che il job sia in uno stato editabile
    if job_dict["status"] not in (JobStatus.GENERATED.value, JobStatus.IN_REVIEW.value, JobStatus.REJECTED.value):
        raise HTTPException(
            status_code=400,
            detail=f"Il job non e' in uno stato editabile (stato attuale: {job_dict['status']})",
        )

    user_id = str(current_user["id"])

    # Determina il numero di versione da creare
    # Se esiste gia' una versione con questo numero, crea la successiva
    existing_version = await database.fetch_one(
        "SELECT id FROM subtitle_versions WHERE job_id = :job_id AND version = :version",
        {"job_id": job_id, "version": version},
    )

    target_version = version
    if existing_version:
        # Aggiorna la versione esistente
        segments_json = json.dumps([s.model_dump() for s in request_data.segments])
        await database.execute(
            """UPDATE subtitle_versions SET content = :content, notes = :notes,
               created_by_user_id = :user_id, created_at = :now
               WHERE job_id = :job_id AND version = :version""",
            {
                "content": segments_json,
                "notes": request_data.notes,
                "user_id": user_id,
                "now": datetime.utcnow(),
                "job_id": job_id,
                "version": version,
            },
        )
    else:
        # Crea nuova versione
        segments_json = [s.model_dump() for s in request_data.segments]
        await save_version(
            job_id=job_id,
            version=target_version,
            segments=segments_json,
            drive_refs={},
            user_id=user_id,
            notes=request_data.notes,
        )

    await add_event(job_id, EventType.VERSION_UPDATED, user_id, {
        "version": target_version,
        "segments_count": len(request_data.segments),
    })

    # Re-upload su Drive se disponibile
    if drive_service and drive_service.is_ready():
        try:
            from pipeline import (
                export_srt,
                export_lrc,
                export_ass,
                export_dump,
                upload_subtitle_files_to_drive,
            )

            segments = request_data.segments
            srt = export_srt(segments)
            lrc = export_lrc(segments)
            ass = export_ass(segments, video_name=job_dict.get("input_drive_file_name", "video"))
            dump = export_dump(segments, {"version": target_version, "revised_by": user_id})

            cliente_name = await get_cliente_name(job_dict["cliente_id"]) or job_dict["cliente_id"]

            loop = asyncio.get_event_loop()
            new_refs = await loop.run_in_executor(
                None,
                upload_subtitle_files_to_drive,
                drive_service,
                drive_structure,
                cliente_name,
                job_dict.get("input_drive_file_name", "video"),
                target_version,
                srt, lrc, ass, dump,
            )

            # Aggiorna drive refs nella versione
            if any(v for v in new_refs.values() if v):
                set_parts = []
                update_params = {"job_id": job_id, "version": target_version}
                for key, val in new_refs.items():
                    if val:
                        set_parts.append(f"{key} = :{key}")
                        update_params[key] = val
                if set_parts:
                    await database.execute(
                        f"UPDATE subtitle_versions SET {', '.join(set_parts)} WHERE job_id = :job_id AND version = :version",
                        update_params,
                    )
        except Exception as e:
            print(f"⚠️ Upload drive per versione {target_version} fallito: {e}")

    # Ritorna versione aggiornata
    updated_version = await database.fetch_one(
        "SELECT * FROM subtitle_versions WHERE job_id = :job_id AND version = :version",
        {"job_id": job_id, "version": target_version},
    )
    return serialize_version(dict(updated_version))


# ========================
# ENDPOINT 8: GET /api/subtitles/jobs/{id}/download/{format}
# ========================

@app.get("/api/subtitles/jobs/{job_id}/download/{format}")
async def download_subtitle(
    job_id: str,
    format: SubtitleFormat,
    version: int = Query(None, description="Numero versione (default: ultima)"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Download sottotitoli in formato SRT, LRC, ASS o dump JSON.
    Usa la versione specificata o l'ultima disponibile.
    """
    row = await database.fetch_one(
        subtitle_jobs_table.select().where(subtitle_jobs_table.c.id == job_id)
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job non trovato")

    job_dict = dict(row)

    # RBAC
    if not is_admin_or_superadmin(current_user):
        user_id = str(current_user["id"])
        assigned_clients = await get_user_assigned_cliente_ids(user_id)
        if job_dict["cliente_id"] not in assigned_clients:
            raise HTTPException(status_code=403, detail="Non autorizzato")

    # Trova versione
    if version:
        ver_row = await database.fetch_one(
            "SELECT * FROM subtitle_versions WHERE job_id = :job_id AND version = :version",
            {"job_id": job_id, "version": version},
        )
    else:
        ver_row = await database.fetch_one(
            "SELECT * FROM subtitle_versions WHERE job_id = :job_id ORDER BY version DESC LIMIT 1",
            {"job_id": job_id},
        )

    if not ver_row:
        raise HTTPException(status_code=404, detail="Nessuna versione disponibile")

    ver_dict = dict(ver_row)

    # Se il file e' su Drive, prova a scaricarlo da li'
    drive_key_map = {
        SubtitleFormat.SRT: "drive_srt_file_id",
        SubtitleFormat.LRC: "drive_lrc_file_id",
        SubtitleFormat.ASS: "drive_ass_file_id",
        SubtitleFormat.DUMP: "drive_dump_file_id",
    }

    drive_file_id = ver_dict.get(drive_key_map.get(format))
    if drive_file_id and drive_service and drive_service.is_ready():
        try:
            stream, content_type, filename = drive_service.download_file_stream(drive_file_id)
            return StreamingResponse(
                stream,
                media_type=content_type or "text/plain",
                headers={"Content-Disposition": f'attachment; filename="{filename}"'},
            )
        except Exception as e:
            print(f"⚠️ Download da Drive fallito, genero dal DB: {e}")

    # Fallback: genera dal contenuto nel DB
    if not ver_dict.get("content"):
        raise HTTPException(status_code=404, detail="Contenuto sottotitoli non disponibile")

    try:
        segments_data = json.loads(ver_dict["content"]) if isinstance(ver_dict["content"], str) else ver_dict["content"]
        segments = [SubtitleSegment(**s) for s in segments_data]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore parsing segmenti: {e}")

    from pipeline import export_srt, export_lrc, export_ass, export_dump

    video_name = job_dict.get("input_drive_file_name", "subtitles")
    safe_name = "".join(c for c in video_name if c.isalnum() or c in (' ', '-', '_', '.')).strip().replace(' ', '_')
    if '.' in safe_name:
        safe_name = safe_name.rsplit('.', 1)[0]

    version_num = ver_dict["version"]

    if format == SubtitleFormat.SRT:
        content = export_srt(segments)
        filename = f"{safe_name}_v{version_num}.srt"
        mime = "text/plain; charset=utf-8"
    elif format == SubtitleFormat.LRC:
        content = export_lrc(segments)
        filename = f"{safe_name}_v{version_num}.lrc"
        mime = "text/plain; charset=utf-8"
    elif format == SubtitleFormat.ASS:
        content = export_ass(segments, video_name=video_name)
        filename = f"{safe_name}_v{version_num}.ass"
        mime = "text/plain; charset=utf-8"
    elif format == SubtitleFormat.DUMP:
        content = export_dump(segments, {"version": version_num})
        filename = f"{safe_name}_v{version_num}_dump.json"
        mime = "application/json; charset=utf-8"
    else:
        raise HTTPException(status_code=400, detail="Formato non supportato")

    return StreamingResponse(
        io.BytesIO(content.encode("utf-8")),
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ========================
# ENDPOINT 9: GET /api/subtitles/jobs/{id}/events - Log eventi
# ========================

@app.get("/api/subtitles/jobs/{job_id}/events", response_model=List[SubtitleEventResponse])
async def get_job_events(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Ritorna log eventi per un job (audit trail)."""
    # Verifica esistenza job
    row = await database.fetch_one(
        "SELECT id, cliente_id FROM subtitle_jobs WHERE id = :job_id",
        {"job_id": job_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job non trovato")

    # RBAC
    if not is_admin_or_superadmin(current_user):
        user_id = str(current_user["id"])
        assigned_clients = await get_user_assigned_cliente_ids(user_id)
        if dict(row)["cliente_id"] not in assigned_clients:
            raise HTTPException(status_code=403, detail="Non autorizzato")

    event_rows = await database.fetch_all(
        "SELECT * FROM subtitle_events WHERE job_id = :job_id ORDER BY created_at ASC",
        {"job_id": job_id},
    )
    return [serialize_event(dict(e)) for e in event_rows]


# ========================
# ENDPOINT 10: GET /api/subtitles/jobs/{id}/status - Status leggero
# ========================

@app.get("/api/subtitles/jobs/{job_id}/status", response_model=JobStatusResponse)
async def get_job_status(
    job_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Endpoint leggero per polling status job."""
    row = await database.fetch_one(
        "SELECT id, status, progress, error_message FROM subtitle_jobs WHERE id = :job_id",
        {"job_id": job_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job non trovato")

    r = dict(row)
    return JobStatusResponse(
        id=r["id"],
        status=r["status"],
        progress=r.get("progress", 0),
        error_message=r.get("error_message"),
    )


# ========================
# ENDPOINT 11: GET /api/subtitles/comments/{drive_file_id}
# ========================

@app.get("/api/subtitles/comments/{drive_file_id}", response_model=List[CommentResponse])
async def get_comments(
    drive_file_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Lista commenti per un file Drive, con risposte nested."""
    rows = await database.fetch_all(
        "SELECT * FROM content_comments WHERE drive_file_id = :fid ORDER BY created_at ASC",
        {"fid": drive_file_id},
    )

    # Organizza in thread: top-level + risposte
    top_level = []
    replies_map: Dict[str, List] = {}

    for row in rows:
        r = dict(row)
        comment = CommentResponse(
            id=r["id"],
            drive_file_id=r["drive_file_id"],
            cliente_id=r["cliente_id"],
            user_id=r["user_id"],
            user_name=r.get("user_name"),
            content=r["content"],
            parent_id=r.get("parent_id"),
            created_at=r["created_at"].isoformat() if hasattr(r["created_at"], "isoformat") else str(r["created_at"]),
            updated_at=r["updated_at"].isoformat() if hasattr(r["updated_at"], "isoformat") else str(r["updated_at"]),
        )
        if comment.parent_id:
            replies_map.setdefault(comment.parent_id, []).append(comment)
        else:
            top_level.append(comment)

    # Attach replies
    for comment in top_level:
        comment.replies = replies_map.get(comment.id, [])

    return top_level


# ========================
# ENDPOINT 12: POST /api/subtitles/comments
# ========================

@app.post("/api/subtitles/comments", response_model=CommentResponse)
async def create_comment(
    request_data: CreateCommentRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Crea un commento su un file Drive."""
    user_id = str(current_user["id"])
    user_name = current_user.get("username", "Utente")

    # Recupera nome completo se disponibile
    try:
        user_row = await database.fetch_one(
            "SELECT nome, cognome FROM users WHERE id = :uid",
            {"uid": user_id},
        )
        if user_row:
            r = dict(user_row)
            full_name = f"{r.get('nome', '')} {r.get('cognome', '')}".strip()
            if full_name:
                user_name = full_name
    except Exception:
        pass

    comment_id = str(uuid.uuid4())
    now = datetime.utcnow()

    await database.execute(
        content_comments_table.insert().values(
            id=comment_id,
            drive_file_id=request_data.drive_file_id,
            cliente_id=request_data.cliente_id,
            user_id=user_id,
            user_name=user_name,
            content=request_data.content,
            parent_id=request_data.parent_id,
            created_at=now,
            updated_at=now,
        )
    )

    return CommentResponse(
        id=comment_id,
        drive_file_id=request_data.drive_file_id,
        cliente_id=request_data.cliente_id,
        user_id=user_id,
        user_name=user_name,
        content=request_data.content,
        parent_id=request_data.parent_id,
        created_at=now.isoformat(),
        updated_at=now.isoformat(),
    )


# ========================
# ENDPOINT 13: DELETE /api/subtitles/comments/{id}
# ========================

@app.delete("/api/subtitles/comments/{comment_id}")
async def delete_comment(
    comment_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Elimina un commento. Solo autore o admin."""
    row = await database.fetch_one(
        "SELECT id, user_id FROM content_comments WHERE id = :cid",
        {"cid": comment_id},
    )
    if not row:
        raise HTTPException(status_code=404, detail="Commento non trovato")

    r = dict(row)
    user_id = str(current_user["id"])

    if r["user_id"] != user_id and not is_admin_or_superadmin(current_user):
        raise HTTPException(status_code=403, detail="Non autorizzato a eliminare questo commento")

    # Elimina risposte figlie
    await database.execute(
        "DELETE FROM content_comments WHERE parent_id = :pid",
        {"pid": comment_id},
    )
    # Elimina commento
    await database.execute(
        "DELETE FROM content_comments WHERE id = :cid",
        {"cid": comment_id},
    )

    return {"deleted": True, "id": comment_id}


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
