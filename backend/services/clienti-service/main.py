"""
Clienti Service - Microservizio per gestione clienti e magic links
"""

from fastapi import FastAPI, HTTPException, status, Depends, Request, UploadFile, File, Form, Query
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import os
import sys
import json
import uuid
import secrets
from pathlib import Path
from datetime import datetime, timedelta
from jose import JWTError, jwt
from contextlib import asynccontextmanager
import httpx
import re
import io
import csv

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    from drive_utils import drive_service
    from drive_structure import drive_structure
except ImportError:
    print("⚠️ Modulo drive_utils non trovato")
    drive_service = None
    drive_structure = None

from database import database, init_database, close_database, clienti_table, magic_links_table, cliente_assignees_table, drive_folder_permissions_table
from models import (
    ClienteData,
    ClienteResponse,
    MagicLinkResponse,
    CreateMagicLinkResponse,
    VerifyMagicLinkResponse,
    ImportSourcesResponse,
    ImportClienteRequest,
    ImportSource,
    DettagliCliente
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
    
    # Aggiungi root al path per importare shared
    if str(root_dir) not in sys.path:
        sys.path.append(str(root_dir))
except ImportError:
    pass

# Import internal calls
try:
    from backend.shared.internal_calls import get_preventivi_internal, get_contratti_internal
except ImportError:
    # Fallback se path non funziona
    print("⚠️ Impossibile importare internal_calls, le funzioni di import potrebbero non funzionare")
    async def get_preventivi_internal(token=None): return []
    async def get_contratti_internal(token=None): 
        # Fallback HTTP se internal_calls non disponibile
        import httpx
        url = os.environ.get("CONTRATTI_SERVICE_URL") or os.environ.get("BASE_URL") or os.environ.get("GATEWAY_URL")
        if not url:
            print("⚠️ CONTRATTI_SERVICE_URL, BASE_URL o GATEWAY_URL non configurato, impossibile recuperare contratti")
            return []
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{url}/api/contratti", headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    return data.get("contratti", []) if isinstance(data, dict) else data
        except Exception as e:
            print(f"⚠️ Errore get_contratti fallback: {e}")
        return []

# JWT Configuration
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
ALGORITHM = "HS256"

FRONTEND_URL = os.environ.get("FRONTEND_URL")
if not FRONTEND_URL:
    raise ValueError("FRONTEND_URL environment variable is required")

BASE_URL = os.environ.get("BASE_URL")
if not BASE_URL:
    raise ValueError("BASE_URL environment variable is required")

# Default permissions per ruolo
DEFAULT_PERMISSIONS_BY_ROLE: Dict[str, Any] = {
    "superadmin": {"__all__": True},
    "admin": {
        "clienti:read": True,
        "clienti:create": True,
        "clienti:update": True,
        "clienti:delete": True,
    },
    "user": {
        "clienti:read": True,
        "clienti:update": True,
    },
}


async def get_current_user_token(
    request: Request,
    token_query: Optional[str] = Query(None, alias="token")
) -> str:
    """Estrae il token da Header Bearer O Query param (per download diretti)"""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1]
    
    if token_query:
        return token_query
        
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token mancante",
    )


async def get_current_user(
    token: str = Depends(get_current_user_token)
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


def get_default_permissions(role: str) -> Dict[str, bool]:
    """Ottieni permessi di default per ruolo"""
    defaults = DEFAULT_PERMISSIONS_BY_ROLE.get(role, {})
    if defaults.get("__all__"):
        return {"__all__": True}
    return defaults.copy()


async def load_user_permissions(user: Dict[str, Any]) -> Dict[str, bool]:
    """Carica permessi utente dal database"""
    if user["role"] == "superadmin":
        return {"__all__": True}
    
    perms = {}
    row = await database.fetch_one(
        "SELECT permissions FROM user_permissions WHERE user_id = :uid",
        {"uid": user["id"]},
    )
    
    if row and row["permissions"]:
        try:
            perms = json.loads(row["permissions"]) or {}
        except json.JSONDecodeError:
            perms = {}
    else:
        perms = get_default_permissions(user["role"])
    
    # OVERRIDE: Garantisci sempre accesso al Drive (clienti:read/update) per il ruolo 'user'
    # Questo serve perché vecchi utenti potrebbero avere permessi salvati nel DB che non includono queste nuove flag
    if user["role"] == "user":
        perms["clienti:read"] = True
        perms["clienti:update"] = True
    
    return perms


# Dependency per verificare permesso clienti:read
async def check_clienti_read(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("clienti:read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: clienti:read"
        )
    return current_user

# Dependency per verificare permesso clienti:create
async def check_clienti_create(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("clienti:create"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: clienti:create"
        )
    return current_user

# Dependency per verificare permesso clienti:update
async def check_clienti_update(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("clienti:update"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: clienti:update"
        )
    return current_user

# Dependency per verificare permesso clienti:delete
async def check_clienti_delete(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("clienti:delete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: clienti:delete"
        )
    return current_user


# ============================================
# DRIVE FOLDER PERMISSIONS HELPERS
# ============================================

async def get_user_drive_folder_permissions(user_id: str) -> Dict[str, Dict[str, bool]]:
    """Ottiene i permessi Drive dell'utente per tutte le cartelle speciali"""
    permissions = {
        "procedure": {"can_read": False, "can_write": False},
        "contratti": {"can_read": False, "can_write": False},
        "preventivi": {"can_read": False, "can_write": False},
    }
    
    try:
        rows = await database.fetch_all(
            "SELECT folder_type, can_read, can_write FROM drive_folder_permissions WHERE user_id = :user_id",
            {"user_id": str(user_id)}
        )
        for row in rows:
            folder_type = row["folder_type"]
            if folder_type in permissions:
                permissions[folder_type] = {
                    "can_read": row["can_read"],
                    "can_write": row["can_write"]
                }
    except Exception as e:
        print(f"⚠️ Errore caricamento permessi Drive: {e}")
    
    return permissions


async def get_user_assigned_cliente_ids(user_id: str) -> List[str]:
    """Ottiene la lista di ID clienti assegnati all'utente"""
    try:
        rows = await database.fetch_all(
            "SELECT cliente_id FROM cliente_assignees WHERE user_id = :user_id",
            {"user_id": str(user_id)}
        )
        return [row["cliente_id"] for row in rows]
    except Exception as e:
        print(f"⚠️ Errore caricamento clienti assegnati: {e}")
        return []


async def get_webapp_folder_id() -> Optional[str]:
    """Ottiene l'ID della cartella WebApp (la root per tutti gli utenti)"""
    if not drive_structure:
        return None
    
    # Prova a recuperare dalla cache o cercala
    webapp_id = drive_structure._webapp_folder_id
    if not webapp_id:
        webapp_id = drive_service.search_folder("WebApp") if drive_service and drive_service.is_ready() else None
        if webapp_id:
            drive_structure._webapp_folder_id = webapp_id
    
    return webapp_id


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler per startup e shutdown"""
    print("🚀 Avvio Clienti Service...")
    await init_database()
    print("✅ Clienti Service avviato")
    yield
    print("⏹️ Spegnimento Clienti Service...")
    await close_database()
    print("✅ Clienti Service fermato")


app = FastAPI(
    title="Clienti Service",
    description="Microservizio per gestione clienti e magic links",
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


@app.get("/api/drive/google/login")
async def google_drive_login(request: Request):
    """Avvia il flow OAuth specificamente per l'integrazione Drive"""
    try:
        # Determina redirect_uri dinamicamente in base all'host della richiesta
        # Questo risolve il problema localhost vs produzione automaticamente
        host = request.headers.get("host")
        if not host:
            # Estrai host da BASE_URL se header non presente
            from urllib.parse import urlparse
            parsed = urlparse(BASE_URL)
            # Estrai host da BASE_URL, senza fallback hardcoded
            if not parsed.netloc:
                raise ValueError("BASE_URL deve contenere un hostname valido (es. https://www.evoluzioneimprese.com)")
            host = parsed.netloc
        # Determina protocol basandosi solo su BASE_URL, non su dominio hardcoded
        protocol = "https" if BASE_URL.startswith("https://") else "http"
        
        redirect_uri = f"{protocol}://{host}/api/drive/google/callback"
        
        print(f"DEBUG OAuth: Requesting URL with redirect_uri={redirect_uri}")
             
        auth_url = drive_service.get_auth_url(redirect_uri)
        return {"url": auth_url}
    except Exception as e:
        print(f"Error generating auth url: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Errore generazione auth url: {str(e)}")

@app.get("/api/drive/google/callback")
async def google_drive_callback(request: Request, code: str, state: Optional[str] = None):
    """Callback specifica per OAuth Google Drive"""
    try:
        # Ricostruisce lo stesso redirect_uri usato nel login per la verifica
        host = request.headers.get("host")
        if not host:
            # Estrai host da BASE_URL se header non presente
            from urllib.parse import urlparse
            parsed = urlparse(BASE_URL)
            # Estrai host da BASE_URL, senza fallback hardcoded
            if not parsed.netloc:
                raise ValueError("BASE_URL deve contenere un hostname valido (es. https://www.evoluzioneimprese.com)")
            host = parsed.netloc
        # Determina protocol basandosi solo su BASE_URL, non su dominio hardcoded
        protocol = "https" if BASE_URL.startswith("https://") else "http"
        
        redirect_uri = f"{protocol}://{host}/api/drive/google/callback"

        drive_service.complete_auth(code, redirect_uri)
        
        return RedirectResponse(url=f"{FRONTEND_URL}/drive?connected=true")
    except Exception as e:
        return RedirectResponse(url=f"{FRONTEND_URL}/drive?error={str(e)}")

@app.get("/health")
async def health_check():
    drive_status = "connected" if drive_service.is_ready() else "disconnected"
    return {"status": "healthy", "service": "clienti-service", "drive": drive_status}


def serialize_cliente(row: Dict[str, Any]) -> Dict[str, Any]:
    """Serializza un cliente dal database al formato API"""
    cliente_dict = dict(row)
    
    # Parsifica campi JSON
    for field in ["contatti", "servizi_attivi", "integrazioni", "dettagli"]:
        if cliente_dict.get(field):
            if isinstance(cliente_dict[field], str):
                try:
                    cliente_dict[field] = json.loads(cliente_dict[field])
                except:
                    cliente_dict[field] = {} if field != "servizi_attivi" else []
            elif not cliente_dict[field]:
                 cliente_dict[field] = {} if field != "servizi_attivi" else []
        else:
             cliente_dict[field] = {} if field != "servizi_attivi" else []
    
    # Converti datetime in ISO string
    for field in ['created_at', 'updated_at']:
        if cliente_dict.get(field):
            if isinstance(cliente_dict[field], datetime):
                cliente_dict[field] = cliente_dict[field].isoformat()
    
    return cliente_dict


# =========================
# CLIENTI ENDPOINTS
# =========================

@app.get("/api/clienti", response_model=List[ClienteResponse])
async def get_clienti(
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    """Lista tutti i clienti - filtrati per assegnazione se non admin"""
    try:
        user_perms = await load_user_permissions(current_user)
        is_admin = user_perms.get("__all__") or current_user.get("role") in ["admin", "superadmin"]
        
        if is_admin:
            # Admin vede tutti i clienti
            query = clienti_table.select().order_by(clienti_table.c.created_at.desc())
            clienti = await database.fetch_all(query)
        else:
            # Utente normale vede solo i clienti assegnati a lui
            user_id = str(current_user["id"])
            query = """
                SELECT c.* FROM clienti c
                INNER JOIN cliente_assignees ca ON c.id = ca.cliente_id
                WHERE ca.user_id = :user_id
                ORDER BY c.created_at DESC
            """
            clienti = await database.fetch_all(query, {"user_id": user_id})
        
        result = [serialize_cliente(dict(cliente)) for cliente in clienti]
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


def _contratto_valore(compenso: Any) -> str:
    """Estrae valore contratto da compenso (sitoWeb.importoTotale o marketing.importoMensile)."""
    if not compenso:
        return ""
    if isinstance(compenso, str):
        try:
            compenso = json.loads(compenso)
        except Exception:
            return ""
    if not isinstance(compenso, dict):
        return ""
    sito = compenso.get("sitoWeb") or {}
    marketing = compenso.get("marketing") or {}
    if isinstance(sito, dict) and sito.get("importoTotale") is not None:
        return str(sito["importoTotale"])
    if isinstance(marketing, dict) and marketing.get("importoMensile") is not None:
        return str(marketing["importoMensile"])
    return ""


def _contratto_durata_testo(durata: Any) -> str:
    """Estrae durata come testo (es. '01/01/2024 - 31/12/2024')."""
    if not durata:
        return ""
    if isinstance(durata, str):
        try:
            durata = json.loads(durata)
        except Exception:
            return ""
    if not isinstance(durata, dict):
        return ""
    dec = durata.get("dataDecorrenza") or ""
    scad = durata.get("dataScadenza") or ""
    if dec and scad:
        return f"{dec} - {scad}"
    return dec or scad


@app.get("/api/clienti/export/csv")
async def export_clienti_csv(
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    """
    Export clienti in CSV: Nome, Cognome, Nome Azienda, P.IVA, Durata Contratto,
    Inizio Contratto, Path Drive, Valore Contratto.
    Il valore contratto viene risolto cercando il contratto per Ragione Sociale (nome azienda).
    """
    try:
        user_perms = await load_user_permissions(current_user)
        is_admin = user_perms.get("__all__") or current_user.get("role") in ["admin", "superadmin"]
        if is_admin:
            clienti = await database.fetch_all(
                clienti_table.select().order_by(clienti_table.c.created_at.desc())
            )
        else:
            user_id = str(current_user["id"])
            clienti = await database.fetch_all(
                "SELECT c.* FROM clienti c INNER JOIN cliente_assignees ca ON c.id = ca.cliente_id WHERE ca.user_id = :user_id ORDER BY c.created_at DESC",
                {"user_id": user_id}
            )

        # Fetch contratti (stesso DB): id, cliente_id, ragione_sociale, durata, compenso
        try:
            contratti_rows = await database.fetch_all(
                "SELECT id, cliente_id, ragione_sociale, durata, compenso FROM contratti ORDER BY created_at DESC"
            )
        except Exception:
            contratti_rows = []

        # Per ogni cliente_id o ragione_sociale trovo il contratto (preferenza cliente_id)
        def find_contratto(cliente_id: str, nome_azienda: str) -> Optional[Dict]:
            nome_norm = (nome_azienda or "").strip().lower()
            by_cliente = next((c for c in contratti_rows if (c.get("cliente_id") or "").strip() == cliente_id), None)
            if by_cliente:
                return dict(by_cliente)
            for c in contratti_rows:
                rs = (c.get("ragione_sociale") or "").strip().lower()
                if nome_norm and rs and (nome_norm in rs or rs in nome_norm):
                    return dict(c)
            return None

        headers = [
            "Nome", "Cognome", "Nome Azienda", "P.IVA", "Durata Contratto",
            "Inizio Contratto", "Path Drive", "Valore Contratto"
        ]

        buf = io.StringIO()
        writer = csv.writer(buf, delimiter=",", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(headers)

        for row in clienti:
            c = serialize_cliente(dict(row))
            dettagli = c.get("dettagli") or {}
            contatti = c.get("contatti") or {}
            referente = dettagli.get("referente") or {}
            if isinstance(referente, str):
                try:
                    referente = json.loads(referente) if referente else {}
                except Exception:
                    referente = {}
            nome = referente.get("nome") or ""
            cognome = referente.get("cognome") or ""
            nome_azienda = (c.get("nome_azienda") or "").strip()
            p_iva = contatti.get("cfPiva") or ""
            drive_folder_id = dettagli.get("drive_folder_id") or ""
            path_drive = f"https://drive.google.com/drive/folders/{drive_folder_id}" if drive_folder_id else ""

            contratto = find_contratto(str(c.get("id", "")), nome_azienda)
            durata_txt = ""
            inizio_txt = ""
            valore_txt = ""
            if contratto:
                durata_raw = contratto.get("durata")
                if isinstance(durata_raw, str):
                    try:
                        durata_raw = json.loads(durata_raw)
                    except Exception:
                        durata_raw = {}
                durata_txt = _contratto_durata_testo(durata_raw)
                inizio_txt = (durata_raw.get("dataDecorrenza") or "") if isinstance(durata_raw, dict) else ""
                valore_txt = _contratto_valore(contratto.get("compenso"))

            writer.writerow([
                nome, cognome, nome_azienda, p_iva, durata_txt, inizio_txt, path_drive, valore_txt
            ])

        buf.seek(0)
        from datetime import datetime
        filename = f"clienti-export-{datetime.utcnow().strftime('%Y-%m-%d')}.csv"
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/clienti", response_model=Dict[str, Any])
async def create_cliente(
    cliente_data: ClienteData,
    current_user: Dict[str, Any] = Depends(check_clienti_create)
):
    """Crea un nuovo cliente"""
    try:
        cliente_id = str(uuid.uuid4())
        now = datetime.now()
        
        # Serialize Pydantic models to dict, then JSON
        dettagli_json = None
        if cliente_data.dettagli:
             dettagli_json = cliente_data.dettagli.model_dump_json() # Pydantic v2
        
        await database.execute(
            clienti_table.insert().values(
                id=cliente_id,
                nome_azienda=cliente_data.nome_azienda,
                contatti=json.dumps(cliente_data.contatti) if cliente_data.contatti else None,
                servizi_attivi=json.dumps(cliente_data.servizi_attivi) if cliente_data.servizi_attivi else None,
                integrazioni=json.dumps(cliente_data.integrazioni) if cliente_data.integrazioni else None,
                note=cliente_data.note,
                source=cliente_data.source or "manual",
                source_id=cliente_data.source_id,
                dettagli=dettagli_json,
                created_at=now,
                updated_at=now
            )
        )
        return {"id": cliente_id, "status": "created"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


@app.get("/api/clienti/{cliente_id}", response_model=ClienteResponse)
async def get_cliente(
    cliente_id: str,
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    """Ottieni dettaglio cliente"""
    try:
        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        return serialize_cliente(dict(cliente))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


@app.put("/api/clienti/{cliente_id}", response_model=Dict[str, Any])
async def update_cliente(
    cliente_id: str,
    cliente_data: ClienteData,
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Aggiorna un cliente esistente"""
    try:
        # Verifica esistenza
        existing = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
            
        now = datetime.now()
        
        # Logica per preservare drive_folder_id se non inviato dal frontend
        existing_dict = serialize_cliente(dict(existing))
        existing_dettagli = existing_dict.get("dettagli") or {}
        existing_drive_id = existing_dettagli.get("drive_folder_id")
        
        dettagli_json = None
        if cliente_data.dettagli:
             # Se nel DB c'è un drive_folder_id ma nel dato in arrivo no, preservalo
             if existing_drive_id and not cliente_data.dettagli.drive_folder_id:
                 print(f"🛡️ Preserving drive_folder_id {existing_drive_id} for client {cliente_id} during update")
                 cliente_data.dettagli.drive_folder_id = existing_drive_id
                 
             dettagli_json = cliente_data.dettagli.model_dump_json()
        elif existing_drive_id:
             # Se cliente_data.dettagli è None ma abbiamo un drive_id, dobbiamo decidere.
             # Se la richiesta è una PUT completa, dovremmo resettare.
             # Ma per sicurezza in questo contesto ibrido, meglio non perdere il link drive.
             # Tuttavia, se il frontend manda solo i campi da aggiornare (PATCH-like logic su PUT endpoint?), 
             # questo endpoint sembra fare una replace dei campi specificati in values.
             # Se dettagli_json rimane None, la colonna 'dettagli' NON viene aggiornata (vedi sotto).
             pass

        values = {
            "nome_azienda": cliente_data.nome_azienda,
            "contatti": json.dumps(cliente_data.contatti) if cliente_data.contatti else None,
            "servizi_attivi": json.dumps(cliente_data.servizi_attivi) if cliente_data.servizi_attivi else None,
            "integrazioni": json.dumps(cliente_data.integrazioni) if cliente_data.integrazioni else None,
            "note": cliente_data.note,
            "updated_at": now
        }
        
        if dettagli_json:
            values["dettagli"] = dettagli_json
            
        if cliente_data.source:
             values["source"] = cliente_data.source
        if cliente_data.source_id:
             values["source_id"] = cliente_data.source_id

        await database.execute(
            clienti_table.update()
            .where(clienti_table.c.id == cliente_id)
            .values(**values)
        )
        return {"id": cliente_id, "status": "updated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


# =============================================================================
# ENDPOINT ASSEGNAZIONE CLIENTI
# =============================================================================

@app.get("/api/clienti/{cliente_id}/assignees")
async def get_cliente_assignees(
    cliente_id: str,
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    """Ottieni lista utenti assegnati a un cliente"""
    try:
        # Verifica esistenza cliente
        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        # Ottieni assegnazioni
        query = """
            SELECT ca.*, u.username, u.nome, u.cognome, u.role
            FROM cliente_assignees ca
            LEFT JOIN users u ON ca.user_id = CAST(u.id AS VARCHAR)
            WHERE ca.cliente_id = :cliente_id
            ORDER BY ca.assigned_at DESC
        """
        assignees = await database.fetch_all(query, {"cliente_id": cliente_id})
        
        return {
            "cliente_id": cliente_id,
            "assignees": [
                {
                    "id": a["id"],
                    "user_id": a["user_id"],
                    "username": a["username"],
                    "nome": a["nome"],
                    "cognome": a["cognome"],
                    "role": a["role"],
                    "assigned_at": a["assigned_at"].isoformat() if a["assigned_at"] else None,
                    "assigned_by": a["assigned_by"]
                }
                for a in assignees
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


@app.post("/api/clienti/{cliente_id}/assignees")
async def assign_user_to_cliente(
    cliente_id: str,
    user_ids: List[str],
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Assegna uno o più utenti a un cliente (solo admin)"""
    try:
        # Verifica permessi admin
        user_perms = await load_user_permissions(current_user)
        is_admin = user_perms.get("__all__") or current_user.get("role") in ["admin", "superadmin"]
        if not is_admin:
            raise HTTPException(status_code=403, detail="Solo gli admin possono assegnare clienti")
        
        # Verifica esistenza cliente
        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        assigned_by = str(current_user["id"])
        now = datetime.now()
        added = []
        
        for user_id in user_ids:
            # Verifica che l'utente esista
            user = await database.fetch_one(
                "SELECT id FROM users WHERE id = :uid",
                {"uid": int(user_id) if user_id.isdigit() else user_id}
            )
            if not user:
                continue
            
            # Verifica se già assegnato
            existing = await database.fetch_one(
                "SELECT id FROM cliente_assignees WHERE cliente_id = :cid AND user_id = :uid",
                {"cid": cliente_id, "uid": str(user_id)}
            )
            if existing:
                continue
            
            # Aggiungi assegnazione
            assignment_id = str(uuid.uuid4())
            await database.execute(
                cliente_assignees_table.insert().values(
                    id=assignment_id,
                    cliente_id=cliente_id,
                    user_id=str(user_id),
                    assigned_at=now,
                    assigned_by=assigned_by
                )
            )
            added.append(str(user_id))
        
        return {"status": "ok", "added": added, "cliente_id": cliente_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


@app.delete("/api/clienti/{cliente_id}/assignees/{user_id}")
async def remove_user_from_cliente(
    cliente_id: str,
    user_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Rimuovi un utente da un cliente (solo admin)"""
    try:
        # Verifica permessi admin
        user_perms = await load_user_permissions(current_user)
        is_admin = user_perms.get("__all__") or current_user.get("role") in ["admin", "superadmin"]
        if not is_admin:
            raise HTTPException(status_code=403, detail="Solo gli admin possono rimuovere assegnazioni")
        
        # Rimuovi assegnazione
        await database.execute(
            "DELETE FROM cliente_assignees WHERE cliente_id = :cid AND user_id = :uid",
            {"cid": cliente_id, "uid": str(user_id)}
        )
        
        return {"status": "ok", "removed": user_id, "cliente_id": cliente_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


@app.put("/api/clienti/{cliente_id}/assignees")
async def set_cliente_assignees(
    cliente_id: str,
    user_ids: List[str],
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Imposta la lista completa degli utenti assegnati a un cliente (solo admin)"""
    try:
        # Verifica permessi admin
        user_perms = await load_user_permissions(current_user)
        is_admin = user_perms.get("__all__") or current_user.get("role") in ["admin", "superadmin"]
        if not is_admin:
            raise HTTPException(status_code=403, detail="Solo gli admin possono gestire assegnazioni")
        
        # Verifica esistenza cliente
        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        # Rimuovi tutte le assegnazioni esistenti
        await database.execute(
            "DELETE FROM cliente_assignees WHERE cliente_id = :cid",
            {"cid": cliente_id}
        )
        
        # Aggiungi le nuove assegnazioni
        assigned_by = str(current_user["id"])
        now = datetime.now()
        
        for user_id in user_ids:
            # Verifica che l'utente esista
            user = await database.fetch_one(
                "SELECT id FROM users WHERE id = :uid",
                {"uid": int(user_id) if user_id.isdigit() else user_id}
            )
            if not user:
                continue
            
            assignment_id = str(uuid.uuid4())
            await database.execute(
                cliente_assignees_table.insert().values(
                    id=assignment_id,
                    cliente_id=cliente_id,
                    user_id=str(user_id),
                    assigned_at=now,
                    assigned_by=assigned_by
                )
            )
        
        return {"status": "ok", "assignees": user_ids, "cliente_id": cliente_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


@app.delete("/api/clienti/{cliente_id}")
async def delete_cliente(
    cliente_id: str,
    current_user: Dict[str, Any] = Depends(check_clienti_delete)
):
    """Elimina un cliente e tutte le sue risorse associate"""
    try:
        # Verifica che il cliente esista
        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        # Elimina i magic links associati
        await database.execute(
            magic_links_table.delete().where(magic_links_table.c.cliente_id == cliente_id)
        )
        
        # Elimina il cliente
        await database.execute(
            clienti_table.delete().where(clienti_table.c.id == cliente_id)
        )
        
        return {"message": "Cliente eliminato con successo"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


# =========================
# IMPORT ENDPOINTS
# =========================

@app.get("/api/clienti/import/sources", response_model=ImportSourcesResponse)
async def get_import_sources(
    request: Request,
    current_user: Dict[str, Any] = Depends(check_clienti_create)
):
    """Ottieni preventivi e contratti disponibili per import"""
    try:
        # Ottieni il token JWT dalla richiesta originale
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else None
        
        # Ottieni tutti i clienti esistenti per escludere quelli già importati
        clienti_esistenti = await database.fetch_all(clienti_table.select())
        source_ids_importati = set()
        for cliente in clienti_esistenti:
            cliente_dict = dict(cliente)
            if cliente_dict.get("source_id"):
                source_ids_importati.add(cliente_dict["source_id"])
        
        preventivi_disponibili = []
        contratti_disponibili = []
        
        # Ottieni preventivi tramite internal call (supporta UNIFIED_MODE)
        try:
            preventivi_list = await get_preventivi_internal(token)
            
            for prev in preventivi_list:
                prev_id = prev.get("id")
                if prev_id and prev_id not in source_ids_importati:
                    cliente_nome = prev.get("nome_cliente") or prev.get("cliente", "")
                    if not cliente_nome:
                        client_info = prev.get("client_info") or {}
                        if isinstance(client_info, str):
                            try: client_info = json.loads(client_info)
                            except: client_info = {}
                        cliente_nome = client_info.get("ragione_sociale") or client_info.get("name") or f"{client_info.get('nome', '')} {client_info.get('cognome', '')}".strip()
                    
                    numero_preventivo = prev.get("numero_preventivo") or prev.get("numero", "")
                    
                    if cliente_nome:
                        preventivi_disponibili.append(ImportSource(
                            id=prev_id,
                            numero=numero_preventivo,
                            cliente=cliente_nome,
                            data=prev.get("created_at").isoformat() if isinstance(prev.get("created_at"), datetime) else prev.get("created_at")
                        ))
        except Exception as e:
            print(f"❌ Errore recupero preventivi: {str(e)}")
        
        # Ottieni contratti tramite internal call
        try:
            contratti_list = await get_contratti_internal(token)
            
            for contr in contratti_list:
                contr_id = contr.get("id")
                if contr_id and contr_id not in source_ids_importati:
                    ragione_sociale = contr.get("nome_cliente")
                    
                    dati_committente = contr.get("dati_committente", {})
                    if isinstance(dati_committente, str):
                        try: dati_committente = json.loads(dati_committente)
                        except: dati_committente = {}

                    if not ragione_sociale:
                        ragione_sociale = dati_committente.get("ragioneSociale") or dati_committente.get("ragione_sociale") or ""
                    
                    if ragione_sociale:
                        indirizzo = ""
                        via = dati_committente.get("via") or ""
                        numero_civico = dati_committente.get("numero") or ""
                        if via:
                            indirizzo = f"{via} {numero_civico}".strip()
                        
                        contratti_disponibili.append(ImportSource(
                            id=contr_id,
                            numero=contr.get("numero_contratto") or contr.get("numero") or "N/A",
                            ragioneSociale=ragione_sociale,
                            email=dati_committente.get("email", ""),
                            telefono=indirizzo,
                            citta=dati_committente.get("citta", ""),
                            data=contr.get("created_at").isoformat() if isinstance(contr.get("created_at"), datetime) else contr.get("created_at")
                        ))
        except Exception as e:
            print(f"❌ Errore recupero contratti: {str(e)}")
        
        return ImportSourcesResponse(
            preventivi=preventivi_disponibili,
            contratti=contratti_disponibili
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


@app.post("/api/clienti/import", response_model=Dict[str, Any])
async def import_cliente(
    import_data: ImportClienteRequest,
    request: Request,
    current_user: Dict[str, Any] = Depends(check_clienti_create)
):
    """Importa un cliente da preventivo o contratto"""
    try:
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else None
        
        source_type = import_data.source_type
        source_id = import_data.source_id
        
        if source_type not in ("preventivo", "contratto"):
            raise HTTPException(status_code=400, detail="source_type deve essere 'preventivo' o 'contratto'")
        
        cliente_id = str(uuid.uuid4())
        now = datetime.now()
        
        if source_type == "preventivo":
            preventivi_list = await get_preventivi_internal(token)
            preventivo = next((p for p in preventivi_list if p.get("id") == source_id), None)
            
            if not preventivo:
                raise HTTPException(status_code=404, detail=f"Preventivo {source_id} non trovato")
            
            nome_azienda = preventivo.get("cliente", "")
            if not nome_azienda:
                client_info = preventivo.get("client_info") or {}
                if isinstance(client_info, str):
                    try: client_info = json.loads(client_info)
                    except: client_info = {}
                nome_azienda = client_info.get("ragione_sociale") or f"{client_info.get('nome', '')} {client_info.get('cognome', '')}".strip()

            numero_preventivo = preventivo.get("numero", "")
            
            if not nome_azienda:
                raise HTTPException(status_code=400, detail="Preventivo senza nome cliente")
            
            servizi_preventivo = preventivo.get("servizi", [])
            if isinstance(servizi_preventivo, str):
                try: servizi_preventivo = json.loads(servizi_preventivo)
                except: servizi_preventivo = []

            servizi_attivi = []
            if isinstance(servizi_preventivo, list):
                for s in servizi_preventivo:
                    if isinstance(s, dict) and s.get("descrizione"):
                        servizi_attivi.append(s.get("descrizione")[:20]) 
            
            await database.execute(
                clienti_table.insert().values(
                    id=cliente_id,
                    nome_azienda=nome_azienda,
                    contatti=json.dumps({"email": "", "telefono": ""}),
                    servizi_attivi=json.dumps(servizi_attivi),
                    integrazioni=json.dumps({}),
                    note=f"Importato da preventivo {numero_preventivo}",
                    source="preventivo",
                    source_id=source_id,
                    created_at=now,
                    updated_at=now
                )
            )
        
        elif source_type == "contratto":
            contratti_list = await get_contratti_internal(token)
            contratto = next((c for c in contratti_list if c.get("id") == source_id), None)
            
            if not contratto:
                raise HTTPException(status_code=404, detail=f"Contratto {source_id} non trovato")
            
            dati_committente = contratto.get("dati_committente", {})
            if isinstance(dati_committente, str):
                try: dati_committente = json.loads(dati_committente)
                except: dati_committente = {}
            
            # Estrai ragione sociale - prova più chiavi
            ragione_sociale = (
                dati_committente.get("ragioneSociale") or 
                dati_committente.get("ragione_sociale") or 
                dati_committente.get("nome_azienda") or
                contratto.get("nome_cliente") or
                ""
            )
            if not ragione_sociale:
                raise HTTPException(status_code=400, detail="Contratto senza ragione sociale")
            
            # Estrai email - prova più chiavi
            email = (
                dati_committente.get("email") or 
                dati_committente.get("e-mail") or
                dati_committente.get("mail") or
                ""
            )
            
            servizi_contratto = contratto.get("servizi", [])
            if isinstance(servizi_contratto, str):
                try: servizi_contratto = json.loads(servizi_contratto)
                except: servizi_contratto = []
            
            servizi_attivi = []
            if isinstance(servizi_contratto, list):
                for s in servizi_contratto:
                    if isinstance(s, dict) and s.get("attivato"):
                        servizi_attivi.append(s.get("nome", ""))

            await database.execute(
                clienti_table.insert().values(
                    id=cliente_id,
                    nome_azienda=ragione_sociale,
                    contatti=json.dumps({
                        "email": email,
                        "telefono": dati_committente.get("telefono", ""),
                        "pec": dati_committente.get("pec", ""),
                        "cfPiva": dati_committente.get("cfPiva", ""),
                        "indirizzo": f"{dati_committente.get('via', '')} {dati_committente.get('numero', '')}, {dati_committente.get('citta', '')} {dati_committente.get('cap', '')}".strip(', ')
                    }),
                    servizi_attivi=json.dumps(servizi_attivi),
                    integrazioni=json.dumps({}),
                    note=f"Importato da contratto {contratto.get('numero', '')}",
                    source="contratto",
                    source_id=source_id,
                    created_at=now,
                    updated_at=now
                )
            )
            
            # ⭐ IMPORTANTE: Collega il contratto al cliente appena creato
            try:
                CONTRATTI_URL = os.environ.get("CONTRATTI_SERVICE_URL") or os.environ.get("BASE_URL")
                if CONTRATTI_URL:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        headers = {"Authorization": f"Bearer {token}"} if token else {}
                        await client.put(
                            f"{CONTRATTI_URL}/api/contratti/{source_id}/link-cliente",
                            json={"cliente_id": cliente_id},
                            headers=headers
                        )
                        print(f"✅ Contratto {source_id} collegato automaticamente al cliente {cliente_id}")
            except Exception as link_err:
                print(f"⚠️ Errore nel collegamento automatico del contratto: {link_err}")
        
        return {"id": cliente_id, "status": "imported", "source_type": source_type}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


# =========================
# DOCUMENTS ENDPOINTS
# =========================

@app.get("/api/clienti/{cliente_id}/documents", response_model=Dict[str, List[Dict[str, Any]]])
async def get_cliente_documents(
    cliente_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    """Recupera preventivi e contratti associati al cliente"""
    try:
        # Recupera il cliente
        cliente_row = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente_row:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        cliente = serialize_cliente(dict(cliente_row))
        nome_azienda = cliente.get("nome_azienda", "").lower()
        email_contatto = cliente.get("contatti", {}).get("email", "").lower()
        
        # Token per chiamate interne
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.replace("Bearer ", "") if auth_header.startswith("Bearer ") else None
        
        # Fetch preventivi
        preventivi_match = []
        try:
            preventivi = await get_preventivi_internal(token)
            for p in preventivi:
                # Cerca match per nome o email
                p_cliente = (p.get("cliente") or "").lower()
                p_client_info = p.get("client_info") or {}
                if isinstance(p_client_info, str):
                    try: p_client_info = json.loads(p_client_info)
                    except: p_client_info = {}
                
                p_nome = (p_client_info.get("ragione_sociale") or p_client_info.get("name") or "").lower()
                p_email = (p_client_info.get("email") or "").lower()
                
                match = False
                if nome_azienda and (nome_azienda in p_cliente or nome_azienda in p_nome):
                    match = True
                if email_contatto and email_contatto == p_email:
                    match = True
                
                if match:
                    preventivi_match.append({
                        "id": p.get("id"),
                        "numero": p.get("numero"),
                        "data": p.get("data"),
                        "totale": p.get("totale") or p.get("importo_totale"),
                        "type": "preventivo"
                    })
        except Exception as e:
            print(f"Error fetching preventivi for cliente {cliente_id}: {e}")

        # Fetch contratti - SEPARATI in collegati e suggeriti
        contratti_collegati = []  # Contratti effettivamente collegati (cliente_id match)
        contratti_suggeriti = []  # Contratti suggeriti per nome/email (per collegamento)
        
        try:
            contratti = await get_contratti_internal(token)
            print(f"🔍 Trovati {len(contratti)} contratti totali")
            
            for c in contratti:
                # Calcolo valore contratto
                valore = 0
                compenso = c.get("compenso") or {}
                if isinstance(compenso, str):
                    try: compenso = json.loads(compenso)
                    except: compenso = {}
                
                if compenso:
                    sito = compenso.get("sitoWeb", {})
                    mkt = compenso.get("marketing", {})
                    valore += float(sito.get("importoTotale", 0) or 0)
                    valore += float(mkt.get("importoMensile", 0) or 0) * 12
                
                # Estrai durata/scadenza
                durata = c.get("durata") or {}
                if isinstance(durata, str):
                    try: durata = json.loads(durata)
                    except: durata = {}
                
                contratto_data = {
                    "id": c.get("id"),
                    "numero": c.get("numero"),
                    "data": c.get("created_at"),
                    "totale": valore,
                    "type": "contratto",
                    "dataScadenza": durata.get("dataScadenza"),
                    "dataDecorrenza": durata.get("dataDecorrenza")
                }
                
                # Controlla se il contratto è già collegato a questo cliente
                c_cliente_id = c.get("cliente_id")
                if c_cliente_id == cliente_id:
                    contratti_collegati.append(contratto_data)
                    print(f"✅ Contratto #{c.get('numero')} è COLLEGATO al cliente")
                else:
                    # Cerca match per nome o email per suggerimento
                    c_cliente = (c.get("nome_cliente") or "").lower()
                    c_dati = c.get("dati_committente") or {}
                    if isinstance(c_dati, str):
                        try: c_dati = json.loads(c_dati)
                        except: c_dati = {}
                    
                    c_nome = (c_dati.get("ragioneSociale") or c_dati.get("ragione_sociale") or "").lower()
                    c_email = (c_dati.get("email") or "").lower()
                    
                    match = False
                    if nome_azienda:
                        nome_azienda_lower = nome_azienda.lower()
                        if (nome_azienda_lower in c_cliente or c_cliente in nome_azienda_lower or
                            nome_azienda_lower in c_nome or c_nome in nome_azienda_lower):
                            match = True
                    if email_contatto and email_contatto == c_email:
                        match = True
                    
                    # Solo se non è già collegato a un ALTRO cliente
                    if match and not c_cliente_id:
                        contratto_data["suggested"] = True  # Flag per UI
                        contratti_suggeriti.append(contratto_data)
                        print(f"💡 Contratto #{c.get('numero')} SUGGERITO (match nome/email)")
            
            print(f"📊 Contratti collegati: {len(contratti_collegati)}, Suggeriti: {len(contratti_suggeriti)}")
        except Exception as e:
            print(f"❌ Error fetching contratti for cliente {cliente_id}: {e}")
            import traceback
            traceback.print_exc()

        return {
            "preventivi": preventivi_match,
            "contratti": contratti_collegati,  # Solo collegati
            "contratti_suggeriti": contratti_suggeriti  # Per il "Cerca nel DB"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore recupero documenti: {str(e)}")


@app.post("/api/documents/analyze")
async def analyze_document(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(check_clienti_create)
):
    """Analizza un documento (PDF) caricato per estrarre il valore economico"""
    try:
        if not file.filename.endswith(".pdf"):
            return {"error": "Solo file PDF supportati", "value": 0}

        content = await file.read()
        
        extracted_text = ""
        value = 0.0

        if PdfReader:
            try:
                pdf_file = io.BytesIO(content)
                reader = PdfReader(pdf_file)
                for page in reader.pages:
                    extracted_text += page.extract_text()
                
                # Cerca pattern di importo (es. € 1.000,00 o 1000.00 €)
                # Regex semplificata per trovare l'importo totale (spesso vicino a "Totale" o "Total")
                
                # Cerca l'ultimo numero vicino a "Totale" (case insensitive)
                matches = re.findall(r"(?i)totale.*?([\d\.,]+)", extracted_text)
                if matches:
                    # Prendi l'ultimo match che sembra un numero valido
                    possible_value = matches[-1]
                    # Pulisci il valore (rimuovi punti migliaia, sostituisci virgola con punto)
                    clean_val = possible_value.replace(".", "").replace(",", ".")
                    try:
                        value = float(clean_val)
                    except ValueError:
                        pass
                
                # Se non trova totale, prova a cercare numeri grandi > 100
                if value == 0:
                     pass # Fallback logic could go here

            except Exception as e:
                print(f"PDF parsing error: {e}")
                return {"error": "Errore lettura PDF", "value": 0}
        else:
             return {"error": "Libreria PDF non disponibile", "value": 0}

        return {
            "filename": file.filename,
            "extracted_text_preview": extracted_text[:100] + "...",
            "value": value,
            "message": "Analisi completata (beta)"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore analisi: {str(e)}")


# =========================
# GOOGLE DRIVE ENDPOINTS
# =========================

# =========================
# GOOGLE DRIVE GLOBAL ENDPOINTS (ADMIN VIEW)
# =========================

@app.get("/api/drive/status")
async def get_drive_status(current_user: Dict[str, Any] = Depends(get_current_user)):
    """Verifica lo stato della connessione Drive (Accessibile a tutti gli utenti loggati)"""
    is_connected = drive_service.is_ready() if drive_service else False
    auth_type = drive_service.auth_type if drive_service else None
    return {"connected": is_connected, "auth_type": auth_type}

@app.get("/api/drive/files")
async def list_global_drive_files(
    folder_id: Optional[str] = None,
    q: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    """
    Lista file Drive con accesso filtrato.
    - La root per tutti gli utenti è la cartella WebApp (non tutto il Drive)
    - Gli admin vedono tutto dentro WebApp
    - Gli utenti normali vedono:
      - Cartelle clienti solo se assegnati
      - Cartelle Procedure/Contratti/Preventivi solo se hanno permesso
    """
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Drive non connesso")
        
        user_id = str(current_user["id"])
        user_role = current_user.get("role", "user")
        is_admin = user_role in ["admin", "superadmin"]
        
        # Se non c'è folder_id, usa WebApp come root
        effective_folder_id = folder_id
        if not effective_folder_id:
            webapp_id = await get_webapp_folder_id()
            if webapp_id:
                effective_folder_id = webapp_id
            else:
                # Se WebApp non esiste ancora, restituisci lista vuota con messaggio
                return {
                    "files": [], 
                    "current_folder_id": None, 
                    "parents": [],
                    "message": "Struttura WebApp non inizializzata. Contatta l'amministratore."
                }
        
        # Ottieni i file dalla cartella
        files = drive_service.list_files(effective_folder_id, query_term=q)
        
        # Se l'utente è admin, restituisci tutto
        if is_admin:
            return {"files": files, "current_folder_id": effective_folder_id, "parents": []}
        
        # Altrimenti, filtra in base ai permessi
        # Ottieni ID delle cartelle speciali
        clienti_folder_id = drive_structure.get_clienti_folder_id() if drive_structure else None
        procedure_folder_id = drive_structure.get_procedure_folder_id() if drive_structure else None
        contratti_folder_id = drive_structure.get_contratti_folder_id() if drive_structure else None
        preventivi_folder_id = drive_structure.get_preventivi_folder_id() if drive_structure else None
        
        # Ottieni permessi cartelle speciali e clienti assegnati
        folder_perms = await get_user_drive_folder_permissions(user_id)
        assigned_cliente_ids = await get_user_assigned_cliente_ids(user_id)
        
        # Ottieni nomi dei clienti assegnati per matching
        assigned_cliente_names = []
        if assigned_cliente_ids:
            # Usa IN con parametri dinamici
            placeholders = ", ".join([f":id_{i}" for i in range(len(assigned_cliente_ids))])
            params = {f"id_{i}": cid for i, cid in enumerate(assigned_cliente_ids)}
            cliente_rows = await database.fetch_all(
                f"SELECT nome_azienda FROM clienti WHERE id IN ({placeholders})",
                params
            )
            assigned_cliente_names = [row["nome_azienda"] for row in cliente_rows]
        
        filtered_files = []
        for f in files:
            file_id = f["id"]
            file_name = f.get("name", "")
            is_folder = f.get("mimeType") == "application/vnd.google-apps.folder"
            
            # Se siamo nella root WebApp, filtra le cartelle speciali
            if effective_folder_id == await get_webapp_folder_id():
                if file_id == procedure_folder_id:
                    if folder_perms["procedure"]["can_read"]:
                        filtered_files.append(f)
                elif file_id == contratti_folder_id:
                    if folder_perms["contratti"]["can_read"]:
                        filtered_files.append(f)
                elif file_id == preventivi_folder_id:
                    if folder_perms["preventivi"]["can_read"]:
                        filtered_files.append(f)
                elif file_id == clienti_folder_id:
                    # La cartella Clienti è sempre visibile (ma filtrata dentro)
                    filtered_files.append(f)
                else:
                    # Altri file/cartelle nella root WebApp: permetti
                    filtered_files.append(f)
            
            # Se siamo nella cartella Clienti, filtra per clienti assegnati
            elif effective_folder_id == clienti_folder_id and is_folder:
                # Mostra solo cartelle dei clienti assegnati
                if file_name in assigned_cliente_names:
                    filtered_files.append(f)
            else:
                # In altre cartelle, permetti tutto (già dentro una cartella autorizzata)
                filtered_files.append(f)
        
        return {"files": filtered_files, "current_folder_id": effective_folder_id, "parents": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore listing Drive: {str(e)}")

@app.post("/api/drive/folder")
async def create_global_drive_folder(
    name: str = Form(...),
    parent_id: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Crea cartella globale"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Drive non connesso")
            
        folder_id = drive_service.create_folder(name, parent_id)
        if not folder_id:
            raise HTTPException(status_code=500, detail="Errore creazione cartella")
            
        return {"id": folder_id, "name": name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")

from fastapi.responses import RedirectResponse, StreamingResponse

# ... (imports esistenti)

@app.get("/api/drive/download/{file_id}")
async def download_drive_file(
    file_id: str,
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    """Scarica un file da Drive (proxy)"""
    try:
        if not drive_service or not drive_service.is_ready():
             raise HTTPException(status_code=503, detail="Drive non connesso")

        meta = drive_service.get_file_metadata(file_id)
        if not meta:
            raise HTTPException(status_code=404, detail="File non trovato")

        stream, content_type, filename = drive_service.download_file_stream(file_id)
        
        return StreamingResponse(
            stream, 
            media_type=content_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore download: {str(e)}")


@app.get("/api/drive/stream/{file_id}")
async def stream_drive_file(
    file_id: str,
    request: Request,
    token: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    """
    Streaming video da Drive con supporto HTTP Range Requests.
    Permette seeking nel video senza scaricare l'intero file.
    Supporta anche auth via query param ?token= per il tag <video>.
    """
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Drive non connesso")

        meta = drive_service.get_file_metadata(file_id)
        if not meta:
            raise HTTPException(status_code=404, detail="File non trovato")

        total_size = int(meta.get('size', 0))
        content_type = meta.get('mimeType', 'application/octet-stream')
        filename = meta.get('name', 'video')

        # Parse Range header
        range_header = request.headers.get('Range')

        if not range_header or total_size == 0:
            # Nessun range: scarica tutto (fallback per file piccoli o Google Docs)
            stream, ct, fn = drive_service.download_file_stream(file_id)
            return StreamingResponse(
                stream,
                media_type=content_type,
                headers={
                    "Content-Disposition": f'inline; filename="{filename}"',
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(total_size) if total_size else str(len(stream.getvalue())),
                }
            )

        # Parse "bytes=start-end"
        range_str = range_header.replace("bytes=", "")
        parts = range_str.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else min(start + 5 * 1024 * 1024 - 1, total_size - 1)  # 5MB chunks

        if start >= total_size:
            raise HTTPException(status_code=416, detail="Range Not Satisfiable")

        if end >= total_size:
            end = total_size - 1

        # Scarica il range richiesto
        chunk_data, real_total, ct, fn = drive_service.download_file_range(file_id, start, end)
        chunk_length = len(chunk_data)

        import io as _io
        return StreamingResponse(
            _io.BytesIO(chunk_data),
            status_code=206,
            media_type=content_type,
            headers={
                "Content-Range": f"bytes {start}-{start + chunk_length - 1}/{real_total}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(chunk_length),
                "Content-Disposition": f'inline; filename="{filename}"',
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Stream error: {e}")
        raise HTTPException(status_code=500, detail=f"Errore streaming: {str(e)}")

@app.post("/api/drive/upload")
async def upload_global_drive_file(
    file: UploadFile = File(...),
    folder_id: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Upload file globale"""
    try:
        print(f"📂 DRIVE UPLOAD REQUEST: folder_id='{folder_id}', filename='{file.filename}'")

        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Drive non connesso")
        
        if not folder_id:
             print("❌ ERRORE: Tentativo di upload senza folder_id (Root Service Account vietata)")
             raise HTTPException(status_code=400, detail="Devi selezionare una cartella condivisa per caricare file.")

        uploaded = drive_service.upload_file(
            file.file,
            file.filename,
            folder_id,
            file.content_type
        )
        if not uploaded:
             raise HTTPException(status_code=500, detail="Upload fallito")
        return uploaded
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Upload exception: {e}")
        raise HTTPException(status_code=500, detail=f"Errore upload: {str(e)}")


@app.post("/api/clienti/{cliente_id}/drive/init")
async def init_drive_folder(
    cliente_id: str,
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Inizializza la cartella Drive per il cliente dentro WebApp/Clienti"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")
        
        if not drive_structure:
            raise HTTPException(status_code=503, detail="Drive structure manager non disponibile")

        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        cliente_dict = serialize_cliente(dict(cliente))
        dettagli = cliente_dict.get("dettagli") or {}
        nome_cartella = cliente_dict["nome_azienda"]
        
        # Se ha già un folder_id, verifica se esiste ancora (opzionale, per ora ci fidiamo)
        folder_id = dettagli.get("drive_folder_id")
        
        if not folder_id:
            # Usa la struttura WebApp/Clienti
            folder_id = drive_structure.get_or_create_cliente_folder(nome_cartella, cliente_id)
            
            if folder_id:
                # Aggiorna cliente
                dettagli["drive_folder_id"] = folder_id
                
                # Serializza dettagli come JSON standard per preservare tutti i campi
                dettagli_json = json.dumps(dettagli)
                
                print(f"💾 Saving drive_folder_id for client {cliente_id}: {folder_id}")
                
                await database.execute(
                    clienti_table.update()
                    .where(clienti_table.c.id == cliente_id)
                    .values(dettagli=dettagli_json)
                )
                print("✅ DB Update completed")
            else:
                raise HTTPException(status_code=500, detail="Impossibile creare cartella Drive")
        
        return {"folder_id": folder_id, "folder_url": f"https://drive.google.com/drive/folders/{folder_id}"}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore Drive init: {str(e)}")

@app.get("/api/clienti/{cliente_id}/drive/files")
async def list_drive_files(
    cliente_id: str,
    folder_id: Optional[str] = None, # Per navigare sottocartelle
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")

        # Se folder_id non è specificato, usa la root del cliente
        current_folder_id = folder_id
        parents = []
        
        if not current_folder_id:
            cliente = await database.fetch_one(
                clienti_table.select().where(clienti_table.c.id == cliente_id)
            )
            if not cliente:
                raise HTTPException(status_code=404, detail="Cliente non trovato")
            
            cliente_dict = serialize_cliente(dict(cliente))
            dettagli = cliente_dict.get("dettagli") or {}
            current_folder_id = dettagli.get("drive_folder_id")
            
            if not current_folder_id:
                return {"files": [], "current_folder_id": None, "parents": [], "message": "Cartella non inizializzata"}
        else:
             # Se stiamo navigando una sottocartella, prova a recuperare info sul parent per breadcrumbs
             # Nota: L'API Drive v3 non dà facilmente tutto l'albero padre in una chiamata, 
             # qui semplifichiamo recuperando solo info della cartella corrente
             folder_meta = drive_service.get_file_metadata(current_folder_id)
             if folder_meta and 'parents' in folder_meta:
                  # TODO: In futuro implementare breadcrumbs completi risalendo l'albero
                  pass

        files = drive_service.list_files(current_folder_id)
        return {"files": files, "current_folder_id": current_folder_id, "parents": parents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore listing Drive: {str(e)}")

@app.post("/api/clienti/{cliente_id}/drive/folder")
async def create_drive_folder(
    cliente_id: str,
    name: str = Form(...),
    parent_id: str = Form(...),
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Crea una nuova sottocartella"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")
            
        folder_id = drive_service.create_folder(name, parent_id)
        if not folder_id:
            raise HTTPException(status_code=500, detail="Impossibile creare la cartella")
            
        return {"id": folder_id, "name": name, "mimeType": "application/vnd.google-apps.folder"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore creazione cartella: {str(e)}")


@app.post("/api/clienti/{cliente_id}/drive/upload")
async def upload_drive_file(
    cliente_id: str,
    file: UploadFile = File(...),
    folder_id: Optional[str] = Form(None),
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")

        target_folder_id = folder_id
        if not target_folder_id:
             # Recupera root cliente
            cliente = await database.fetch_one(
                clienti_table.select().where(clienti_table.c.id == cliente_id)
            )
            if not cliente:
                raise HTTPException(status_code=404, detail="Cliente non trovato")
            dettagli = serialize_cliente(dict(cliente)).get("dettagli") or {}
            target_folder_id = dettagli.get("drive_folder_id")
            
            if not target_folder_id:
                raise HTTPException(status_code=400, detail="Cartella Drive non inizializzata")

        # Per evitare problemi con SpooledTemporaryFile e google-api-client in contesto async,
        # leggiamo il contenuto in memoria.
        file_content = await file.read()
        
        uploaded_file = drive_service.upload_file(
            file_content, 
            file.filename, 
            target_folder_id, 
            file.content_type
        )
        
        if not uploaded_file:
             raise HTTPException(status_code=500, detail="Upload fallito")
             
        return uploaded_file
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Errore upload Drive: {str(e)}")


# =========================
# MAGIC LINKS ENDPOINTS
# =========================

@app.post("/api/clienti/{cliente_id}/magic-link", response_model=CreateMagicLinkResponse)
async def create_magic_link(
    cliente_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Genera un magic link per installazione Shopify (valido 24h)"""
    try:
        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        token = secrets.token_urlsafe(32)
        link_id = str(uuid.uuid4())
        now = datetime.now()
        expires_at = now + timedelta(hours=24)
        
        await database.execute(
            magic_links_table.insert().values(
                id=link_id,
                cliente_id=cliente_id,
                token=token,
                is_active=True,
                is_used=False,
                expires_at=expires_at,
                created_at=now
            )
        )
        
        request_host = request.headers.get("host", "")
        magic_link_url = f"{FRONTEND_URL}/shopify-install/{token}"
        
        return CreateMagicLinkResponse(
            id=link_id,
            url=magic_link_url,
            token=token,
            expires_at=expires_at.isoformat(),
            is_active=True
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


@app.get("/api/clienti/{cliente_id}/magic-links", response_model=List[MagicLinkResponse])
async def get_magic_links(
    cliente_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    try:
        links = await database.fetch_all(
            magic_links_table.select()
            .where(magic_links_table.c.cliente_id == cliente_id)
            .order_by(magic_links_table.c.created_at.desc())
        )
        
        result = []
        base_url = FRONTEND_URL
        
        for link in links:
            link_dict = dict(link)
            for field in ['expires_at', 'created_at', 'used_at', 'revoked_at']:
                if link_dict.get(field):
                    if isinstance(link_dict[field], datetime):
                        link_dict[field] = link_dict[field].isoformat()
            
            link_dict['url'] = f"{base_url}/shopify-install/{link_dict['token']}"
            result.append(MagicLinkResponse(**link_dict))
        
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


@app.delete("/api/magic-links/{link_id}")
async def revoke_magic_link(
    link_id: str,
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    try:
        link = await database.fetch_one(
            magic_links_table.select().where(magic_links_table.c.id == link_id)
        )
        if not link:
            raise HTTPException(status_code=404, detail="Magic link non trovato")
        
        await database.execute(
            magic_links_table.update()
            .where(magic_links_table.c.id == link_id)
            .values(
                is_active=False,
                revoked_at=datetime.now()
            )
        )
        
        return {"message": "Magic link revocato con successo"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


@app.get("/api/shopify-install/{token}/verify", response_model=VerifyMagicLinkResponse)
async def verify_magic_link(
    token: str
):
    try:
        link = await database.fetch_one(
            magic_links_table.select().where(magic_links_table.c.token == token)
        )
        
        if not link:
            raise HTTPException(status_code=404, detail="Magic link non trovato")
        
        link_dict = dict(link)
        cliente_id = link_dict.get("cliente_id")
        
        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        cliente_dict = dict(cliente)
        
        expires_at = link_dict.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
        
        is_valid = (
            link_dict.get("is_active") and
            not link_dict.get("is_used") and
            expires_at and expires_at > datetime.now()
        )
        
        return VerifyMagicLinkResponse(
            valid=is_valid,
            cliente_id=cliente_id,
            cliente_nome=cliente_dict.get("nome_azienda", ""),
            expires_at=link_dict.get("expires_at").isoformat() if link_dict.get("expires_at") and isinstance(link_dict.get("expires_at"), datetime) else None,
            is_used=link_dict.get("is_used", False),
            is_active=link_dict.get("is_active", False)
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


# --- Drive Structure Management ---

@app.post("/api/drive/structure/init")
async def init_drive_structure(
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Inizializza la struttura WebApp su Drive (WebApp/Clienti, WebApp/Procedure, WebApp/Preventivi, WebApp/Contratti)"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")
        
        if not drive_structure:
            raise HTTPException(status_code=503, detail="Drive structure manager non disponibile")
        
        structure = drive_structure.initialize_structure()
        
        return {
            "status": "success",
            "message": "Struttura WebApp inizializzata con successo",
            "folders": {
                "webapp": {
                    "id": structure["webapp"],
                    "url": f"https://drive.google.com/drive/folders/{structure['webapp']}" if structure["webapp"] else None
                },
                "clienti": {
                    "id": structure["clienti"],
                    "url": f"https://drive.google.com/drive/folders/{structure['clienti']}" if structure["clienti"] else None
                },
                "procedure": {
                    "id": structure["procedure"],
                    "url": f"https://drive.google.com/drive/folders/{structure['procedure']}" if structure["procedure"] else None
                },
                "preventivi": {
                    "id": structure["preventivi"],
                    "url": f"https://drive.google.com/drive/folders/{structure['preventivi']}" if structure["preventivi"] else None
                },
                "contratti": {
                    "id": structure["contratti"],
                    "url": f"https://drive.google.com/drive/folders/{structure['contratti']}" if structure["contratti"] else None
                }
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore inizializzazione struttura: {str(e)}")


@app.get("/api/drive/structure")
async def get_drive_structure(
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    """Restituisce la struttura WebApp esistente"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")
        
        if not drive_structure:
            raise HTTPException(status_code=503, detail="Drive structure manager non disponibile")
        
        structure = drive_structure.initialize_structure()
        
        return {
            "folders": {
                "webapp": {
                    "id": structure["webapp"],
                    "url": f"https://drive.google.com/drive/folders/{structure['webapp']}" if structure["webapp"] else None
                },
                "clienti": {
                    "id": structure["clienti"],
                    "url": f"https://drive.google.com/drive/folders/{structure['clienti']}" if structure["clienti"] else None
                },
                "procedure": {
                    "id": structure["procedure"],
                    "url": f"https://drive.google.com/drive/folders/{structure['procedure']}" if structure["procedure"] else None
                },
                "preventivi": {
                    "id": structure["preventivi"],
                    "url": f"https://drive.google.com/drive/folders/{structure['preventivi']}" if structure["preventivi"] else None
                },
                "contratti": {
                    "id": structure["contratti"],
                    "url": f"https://drive.google.com/drive/folders/{structure['contratti']}" if structure["contratti"] else None
                }
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore recupero struttura: {str(e)}")


@app.post("/api/drive/export/preventivo")
async def export_preventivo_to_drive(
    preventivo_id: str = Form(...),
    preventivo_data: str = Form(...),  # JSON string del preventivo
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Esporta un preventivo su Drive nella cartella WebApp/Preventivi"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")
        
        if not drive_structure:
            raise HTTPException(status_code=503, detail="Drive structure manager non disponibile")
        
        # Ottieni la cartella Preventivi
        preventivi_folder_id = drive_structure.get_preventivi_folder_id()
        if not preventivi_folder_id:
            raise HTTPException(status_code=500, detail="Impossibile ottenere cartella Preventivi. Inizializza prima la struttura.")
        
        # Parse preventivo data
        try:
            preventivo = json.loads(preventivo_data)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Formato JSON preventivo non valido")
        
        # Genera nome file
        numero_preventivo = preventivo.get("numero", preventivo_id)
        cliente_nome = preventivo.get("cliente", "Cliente")
        # Sanitizza nome file
        safe_cliente = "".join(c for c in cliente_nome if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_cliente = safe_cliente.replace(' ', '_')
        file_name = f"Preventivo_{numero_preventivo}_{safe_cliente}.json"
        
        # Converti preventivo in JSON string
        file_content = json.dumps(preventivo, indent=2, ensure_ascii=False).encode('utf-8')
        
        # Carica su Drive
        result = drive_service.upload_file(
            file_content=file_content,
            file_name=file_name,
            folder_id=preventivi_folder_id,
            mime_type="application/json"
        )
        
        if not result:
            raise HTTPException(status_code=500, detail="Impossibile caricare preventivo su Drive")
        
        return {
            "status": "success",
            "message": f"Preventivo {numero_preventivo} esportato su Drive",
            "file": {
                "id": result.get("id"),
                "name": result.get("name"),
                "url": result.get("webViewLink")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore esportazione preventivo: {str(e)}")


@app.post("/api/drive/export/contratto")
async def export_contratto_to_drive(
    contratto_id: str = Form(...),
    contratto_data: str = Form(...),  # JSON string del contratto
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Esporta un contratto su Drive nella cartella WebApp/Contratti"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")
        
        if not drive_structure:
            raise HTTPException(status_code=503, detail="Drive structure manager non disponibile")
        
        # Ottieni la cartella Contratti
        contratti_folder_id = drive_structure.get_contratti_folder_id()
        if not contratti_folder_id:
            raise HTTPException(status_code=500, detail="Impossibile ottenere cartella Contratti. Inizializza prima la struttura.")
        
        # Parse contratto data
        try:
            contratto = json.loads(contratto_data)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Formato JSON contratto non valido")
        
        # Genera nome file
        numero_contratto = contratto.get("numero", contratto_id)
        cliente_nome = contratto.get("datiCommittente", {}).get("ragioneSociale", "Cliente") if isinstance(contratto.get("datiCommittente"), dict) else "Cliente"
        # Sanitizza nome file
        safe_cliente = "".join(c for c in cliente_nome if c.isalnum() or c in (' ', '-', '_')).strip()
        safe_cliente = safe_cliente.replace(' ', '_')
        file_name = f"Contratto_{numero_contratto}_{safe_cliente}.json"
        
        # Converti contratto in JSON string
        file_content = json.dumps(contratto, indent=2, ensure_ascii=False).encode('utf-8')
        
        # Carica su Drive
        result = drive_service.upload_file(
            file_content=file_content,
            file_name=file_name,
            folder_id=contratti_folder_id,
            mime_type="application/json"
        )
        
        if not result:
            raise HTTPException(status_code=500, detail="Impossibile caricare contratto su Drive")
        
        return {
            "status": "success",
            "message": f"Contratto {numero_contratto} esportato su Drive",
            "file": {
                "id": result.get("id"),
                "name": result.get("name"),
                "url": result.get("webViewLink")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore esportazione contratto: {str(e)}")


# --- Procedure Management ---

@app.get("/api/drive/procedure")
async def list_procedure(
    current_user: Dict[str, Any] = Depends(check_clienti_read)
):
    """Lista tutte le procedure nella cartella WebApp/Procedure"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")
        
        if not drive_structure:
            raise HTTPException(status_code=503, detail="Drive structure manager non disponibile")
        
        procedure_folder_id = drive_structure.get_procedure_folder_id()
        if not procedure_folder_id:
            raise HTTPException(status_code=500, detail="Cartella Procedure non inizializzata. Inizializza prima la struttura.")
        
        files = drive_service.list_files(folder_id=procedure_folder_id)
        return {"files": files, "folder_id": procedure_folder_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore listing procedure: {str(e)}")


@app.post("/api/drive/procedure/upload")
async def upload_procedure(
    file: UploadFile = File(...),
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Carica una procedura nella cartella WebApp/Procedure"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")
        
        if not drive_structure:
            raise HTTPException(status_code=503, detail="Drive structure manager non disponibile")
        
        procedure_folder_id = drive_structure.get_procedure_folder_id()
        if not procedure_folder_id:
            raise HTTPException(status_code=500, detail="Cartella Procedure non inizializzata. Inizializza prima la struttura.")
        
        # Leggi file content
        file_content = await file.read()
        
        # Carica su Drive
        result = drive_service.upload_file(
            file_content=file_content,
            file_name=file.filename,
            folder_id=procedure_folder_id,
            mime_type=file.content_type
        )
        
        if not result:
            raise HTTPException(status_code=500, detail="Impossibile caricare procedura su Drive")
        
        return {
            "status": "success",
            "message": f"Procedura {file.filename} caricata con successo",
            "file": {
                "id": result.get("id"),
                "name": result.get("name"),
                "url": result.get("webViewLink")
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore upload procedura: {str(e)}")


@app.post("/api/drive/procedure/share")
async def share_procedure(
    file_id: str = Form(...),
    user_email: str = Form(...),
    role: str = Form("reader"),  # reader, writer, commenter
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Condivide una procedura con un utente specifico"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")
        
        # Verifica che il file esista e sia nella cartella Procedure
        file_meta = drive_service.get_file_metadata(file_id)
        if not file_meta:
            raise HTTPException(status_code=404, detail="File non trovato")
        
        # Condividi il file usando il metodo helper
        result = drive_service.share_file(file_id, user_email, role)
        
        if not result:
            raise HTTPException(status_code=500, detail="Impossibile condividere procedura")
        
        return {
            "status": "success",
            "message": f"Procedura condivisa con {user_email}",
            "permission_id": result.get("id")
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore condivisione procedura: {str(e)}")


# ============================================
# DRIVE FOLDER PERMISSIONS MANAGEMENT (Admin)
# ============================================

@app.get("/api/drive/permissions")
async def get_all_drive_permissions(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Ottiene tutti i permessi Drive di tutti gli utenti (Admin only).
    Per utenti normali, restituisce solo i propri permessi.
    """
    user_role = current_user.get("role", "user")
    is_admin = user_role in ["admin", "superadmin"]
    
    if is_admin:
        # Admin: ottieni tutti i permessi
        rows = await database.fetch_all(
            "SELECT * FROM drive_folder_permissions ORDER BY user_id, folder_type"
        )
    else:
        # Utente normale: solo i propri permessi
        rows = await database.fetch_all(
            "SELECT * FROM drive_folder_permissions WHERE user_id = :user_id",
            {"user_id": str(current_user["id"])}
        )
    
    permissions = {}
    for row in rows:
        user_id = row["user_id"]
        if user_id not in permissions:
            permissions[user_id] = {}
        permissions[user_id][row["folder_type"]] = {
            "can_read": row["can_read"],
            "can_write": row["can_write"],
            "granted_at": row["granted_at"].isoformat() if row["granted_at"] else None,
            "granted_by": row["granted_by"]
        }
    
    return {"permissions": permissions}


@app.get("/api/drive/permissions/{user_id}")
async def get_user_drive_permissions(
    user_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Ottiene i permessi Drive di un utente specifico"""
    user_role = current_user.get("role", "user")
    is_admin = user_role in ["admin", "superadmin"]
    
    # Solo admin può vedere permessi di altri utenti
    if not is_admin and str(current_user["id"]) != user_id:
        raise HTTPException(status_code=403, detail="Non autorizzato")
    
    permissions = await get_user_drive_folder_permissions(user_id)
    return {"user_id": user_id, "permissions": permissions}


@app.post("/api/drive/permissions/{user_id}")
async def set_user_drive_permissions(
    user_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Imposta i permessi Drive per un utente (Admin only).
    Body: {"folder_type": "procedure|contratti|preventivi", "can_read": bool, "can_write": bool}
    """
    user_role = current_user.get("role", "user")
    if user_role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Solo gli admin possono modificare i permessi")
    
    try:
        body = await request.json()
        folder_type = body.get("folder_type")
        can_read = body.get("can_read", False)
        can_write = body.get("can_write", False)
        
        if folder_type not in ["procedure", "contratti", "preventivi"]:
            raise HTTPException(status_code=400, detail="folder_type deve essere: procedure, contratti, preventivi")
        
        # Upsert: inserisci o aggiorna
        existing = await database.fetch_one(
            "SELECT id FROM drive_folder_permissions WHERE user_id = :user_id AND folder_type = :folder_type",
            {"user_id": user_id, "folder_type": folder_type}
        )
        
        if existing:
            await database.execute(
                """
                UPDATE drive_folder_permissions 
                SET can_read = :can_read, can_write = :can_write, 
                    granted_at = :granted_at, granted_by = :granted_by
                WHERE user_id = :user_id AND folder_type = :folder_type
                """,
                {
                    "user_id": user_id,
                    "folder_type": folder_type,
                    "can_read": can_read,
                    "can_write": can_write,
                    "granted_at": datetime.utcnow(),
                    "granted_by": str(current_user["id"])
                }
            )
        else:
            await database.execute(
                """
                INSERT INTO drive_folder_permissions (id, user_id, folder_type, can_read, can_write, granted_at, granted_by)
                VALUES (:id, :user_id, :folder_type, :can_read, :can_write, :granted_at, :granted_by)
                """,
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "folder_type": folder_type,
                    "can_read": can_read,
                    "can_write": can_write,
                    "granted_at": datetime.utcnow(),
                    "granted_by": str(current_user["id"])
                }
            )
        
        return {
            "status": "success",
            "message": f"Permessi {folder_type} aggiornati per utente {user_id}",
            "permissions": {
                "folder_type": folder_type,
                "can_read": can_read,
                "can_write": can_write
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore aggiornamento permessi: {str(e)}")


@app.delete("/api/drive/permissions/{user_id}/{folder_type}")
async def delete_user_drive_permission(
    user_id: str,
    folder_type: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Rimuove un permesso Drive specifico (Admin only)"""
    user_role = current_user.get("role", "user")
    if user_role not in ["admin", "superadmin"]:
        raise HTTPException(status_code=403, detail="Solo gli admin possono modificare i permessi")
    
    if folder_type not in ["procedure", "contratti", "preventivi"]:
        raise HTTPException(status_code=400, detail="folder_type deve essere: procedure, contratti, preventivi")
    
    await database.execute(
        "DELETE FROM drive_folder_permissions WHERE user_id = :user_id AND folder_type = :folder_type",
        {"user_id": user_id, "folder_type": folder_type}
    )
    
    return {"status": "success", "message": f"Permesso {folder_type} rimosso per utente {user_id}"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
