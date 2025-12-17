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

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None

try:
    from drive_utils import drive_service
except ImportError:
    print("⚠️ Modulo drive_utils non trovato")
    drive_service = None

from database import database, init_database, close_database, clienti_table, magic_links_table
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
    async def get_contratti_internal(token=None): return []

# JWT Configuration
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
ALGORITHM = "HS256"

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
if not FRONTEND_URL:
    # Non bloccare se manca, usa default
    pass

BASE_URL = os.environ.get("BASE_URL", "http://localhost:10000")

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
        host = request.headers.get("host", "localhost:10000")
        protocol = "https" if "evoluzioneimprese.com" in host else "http"
        
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
        host = request.headers.get("host", "localhost:10000")
        protocol = "https" if "evoluzioneimprese.com" in host else "http"
        
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
    """Lista tutti i clienti"""
    try:
        query = clienti_table.select().order_by(clienti_table.c.created_at.desc())
        clienti = await database.fetch_all(query)
        result = [serialize_cliente(dict(cliente)) for cliente in clienti]
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore: {str(e)}")


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
        
        dettagli_json = None
        if cliente_data.dettagli:
             dettagli_json = cliente_data.dettagli.model_dump_json()

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
            
            ragione_sociale = dati_committente.get("ragioneSociale") or dati_committente.get("ragione_sociale") or ""
            if not ragione_sociale:
                raise HTTPException(status_code=400, detail="Contratto senza ragione sociale")
            
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
                        "email": dati_committente.get("email", ""),
                        "telefono": dati_committente.get("telefono", ""),
                        "pec": dati_committente.get("pec", ""),
                        "cfPiva": dati_committente.get("cfPiva", "")
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

        # Fetch contratti
        contratti_match = []
        try:
            contratti = await get_contratti_internal(token)
            for c in contratti:
                c_cliente = (c.get("nome_cliente") or "").lower()
                c_dati = c.get("dati_committente") or {}
                if isinstance(c_dati, str):
                    try: c_dati = json.loads(c_dati)
                    except: c_dati = {}
                
                c_nome = (c_dati.get("ragioneSociale") or c_dati.get("ragione_sociale") or "").lower()
                c_email = (c_dati.get("email") or "").lower()
                
                match = False
                if nome_azienda and (nome_azienda in c_cliente or nome_azienda in c_nome):
                    match = True
                if email_contatto and email_contatto == c_email:
                    match = True
                
                if match:
                    # Calcolo valore contratto se possibile
                    valore = 0
                    compenso = c.get("compenso") or {}
                    if isinstance(compenso, str):
                         try: compenso = json.loads(compenso)
                         except: compenso = {}
                    
                    if compenso:
                        sito = compenso.get("sitoWeb", {})
                        mkt = compenso.get("marketing", {})
                        valore += float(sito.get("importoTotale", 0) or 0)
                        # Stima annuale marketing
                        valore += float(mkt.get("importoMensile", 0) or 0) * 12

                    contratti_match.append({
                        "id": c.get("id"),
                        "numero": c.get("numero"),
                        "data": c.get("created_at"),
                        "totale": valore,
                        "type": "contratto"
                    })
        except Exception as e:
            print(f"Error fetching contratti for cliente {cliente_id}: {e}")

        return {
            "preventivi": preventivi_match,
            "contratti": contratti_match
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
    current_user: Dict[str, Any] = Depends(check_clienti_read) # Fallback al check classico, ma con permessi DB fixati
):
    """Lista file Drive globali (admin view)"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Drive non connesso")
        
        files = drive_service.list_files(folder_id, query_term=q)
        return {"files": files, "current_folder_id": folder_id, "parents": []}
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

        # Ottieni metadata per nome e size
        meta = drive_service.get_file_metadata(file_id)
        if not meta:
            raise HTTPException(status_code=404, detail="File non trovato")

        # Scarica stream
        # Nota: serve implementare un metodo download_stream in drive_utils
        # Per ora usiamo webContentLink se disponibile, o redirect
        # Ma l'utente vuole scaricare "dalla webapp", quindi meglio proxy se vogliamo evitare auth cookie issues su drive.google.com
        
        # Implementiamo download_file_stream in drive_utils
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
    """Inizializza la cartella Drive per il cliente"""
    try:
        if not drive_service or not drive_service.is_ready():
            raise HTTPException(status_code=503, detail="Google Drive Service non configurato")

        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        cliente_dict = serialize_cliente(dict(cliente))
        dettagli = cliente_dict.get("dettagli") or {}
        
        # Se ha già un folder_id, verifica se esiste ancora (opzionale, per ora ci fidiamo)
        folder_id = dettagli.get("drive_folder_id")
        
        if not folder_id:
            nome_cartella = cliente_dict["nome_azienda"]
            # Cerca se esiste già
            folder_id = drive_service.search_folder(nome_cartella)
            
            if not folder_id:
                # Crea nuova
                folder_id = drive_service.create_folder(nome_cartella)
            
            if folder_id:
                # Aggiorna cliente
                dettagli["drive_folder_id"] = folder_id
                
                # Serializza dettagli usando il modello per validazione, poi dump json
                # Attenzione: qui stiamo usando il modello Pydantic per serializzare
                # Assicuriamoci che i campi esistano nel modello
                try:
                    dettagli_obj = DettagliCliente(**dettagli)
                    dettagli_json = dettagli_obj.model_dump_json()
                except Exception as model_err:
                    print(f"Errore validazione modello dettagli: {model_err}")
                    # Fallback a json.dumps se il modello non matcha perfettamente
                    dettagli_json = json.dumps(dettagli)
                
                await database.execute(
                    clienti_table.update()
                    .where(clienti_table.c.id == cliente_id)
                    .values(dettagli=dettagli_json)
                )
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

        # Per evitare di caricare tutto in memoria con await file.read(),
        # passiamo lo spool file (temp file su disco) direttamente a drive_utils.
        # FastAPI usa SpooledTemporaryFile per UploadFile.
        
        # Nota: file.file è un oggetto Python file-like standard
        uploaded_file = drive_service.upload_file(
            file.file, 
            file.filename, 
            target_folder_id, 
            file.content_type
        )
        
        if not uploaded_file:
             raise HTTPException(status_code=500, detail="Upload fallito")
             
        return uploaded_file
    except Exception as e:
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


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
