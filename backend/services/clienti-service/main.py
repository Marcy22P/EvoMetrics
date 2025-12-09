"""
Clienti Service - Microservizio per gestione clienti e magic links
"""

from fastapi import FastAPI, HTTPException, status, Depends, Request
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

from database import database, init_database, close_database, clienti_table, magic_links_table
from models import (
    ClienteData,
    ClienteResponse,
    MagicLinkResponse,
    CreateMagicLinkResponse,
    VerifyMagicLinkResponse,
    ImportSourcesResponse,
    ImportClienteRequest,
    ImportSource
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
    "user": {},
}


async def get_current_user(request: Request) -> Dict[str, Any]:
    """Ottieni l'utente corrente dal token JWT"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise credentials_exception
    
    token = auth_header.split(" ")[1]
    if not token:
        raise credentials_exception
    
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


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "clienti-service"}


def serialize_cliente(row: Dict[str, Any]) -> Dict[str, Any]:
    """Serializza un cliente dal database al formato API"""
    cliente_dict = dict(row)
    
    # Parsifica campi JSON
    if cliente_dict.get("contatti"):
        if isinstance(cliente_dict["contatti"], str):
            try:
                cliente_dict["contatti"] = json.loads(cliente_dict["contatti"])
            except:
                cliente_dict["contatti"] = {}
        elif not cliente_dict["contatti"]:
            cliente_dict["contatti"] = {}
    
    if cliente_dict.get("servizi_attivi"):
        if isinstance(cliente_dict["servizi_attivi"], str):
            try:
                cliente_dict["servizi_attivi"] = json.loads(cliente_dict["servizi_attivi"])
            except:
                cliente_dict["servizi_attivi"] = []
        elif not cliente_dict["servizi_attivi"]:
            cliente_dict["servizi_attivi"] = []
    
    if cliente_dict.get("integrazioni"):
        if isinstance(cliente_dict["integrazioni"], str):
            try:
                cliente_dict["integrazioni"] = json.loads(cliente_dict["integrazioni"])
            except:
                cliente_dict["integrazioni"] = {}
        elif not cliente_dict["integrazioni"]:
            cliente_dict["integrazioni"] = {}
    
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
                # Verifica se già importato e se ha stato valido (es. ACCETTATO)
                # Per ora prendiamo tutti, filtro stato lato preventivi se necessario
                if prev_id and prev_id not in source_ids_importati:
                    # Usa colonne dedicate se disponibili (migrazione DB)
                    cliente_nome = prev.get("nome_cliente") or prev.get("cliente", "")
                    
                    # Fallback: cerca in client_info
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
                    # Usa colonne dedicate se disponibili (migrazione DB)
                    ragione_sociale = contr.get("nome_cliente")
                    
                    # Recupero e parsifico dati_committente per fallback e altri campi
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
            
            # Logica estrazione servizi (da migliorare con parsing strutturato se possibile)
            servizi_preventivo = preventivo.get("servizi", [])
            if isinstance(servizi_preventivo, str):
                try:
                    servizi_preventivo = json.loads(servizi_preventivo)
                except:
                    servizi_preventivo = []

            servizi_attivi = []
            # Semplificazione logica estrazione servizi
            if isinstance(servizi_preventivo, list):
                for s in servizi_preventivo:
                    if isinstance(s, dict) and s.get("descrizione"):
                        servizi_attivi.append(s.get("descrizione")[:20]) # Prendi i primi char come tag
            
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
                try:
                    dati_committente = json.loads(dati_committente)
                except:
                    dati_committente = {}
            
            ragione_sociale = dati_committente.get("ragioneSociale") or dati_committente.get("ragione_sociale") or ""
            if not ragione_sociale:
                raise HTTPException(status_code=400, detail="Contratto senza ragione sociale")
            
            # Estrazione servizi
            servizi_contratto = contratto.get("servizi", [])
            if isinstance(servizi_contratto, str):
                try:
                    servizi_contratto = json.loads(servizi_contratto)
                except:
                    servizi_contratto = []
            
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


# ... magic links endpoints rimangono uguali ...
@app.post("/api/clienti/{cliente_id}/magic-link", response_model=CreateMagicLinkResponse)
async def create_magic_link(
    cliente_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(check_clienti_update)
):
    """Genera un magic link per installazione Shopify (valido 24h)"""
    try:
        # Verifica che il cliente esista
        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        # Genera token univoco
        token = secrets.token_urlsafe(32)
        link_id = str(uuid.uuid4())
        now = datetime.now()
        expires_at = now + timedelta(hours=24)
        
        # Salva nel database
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
        
        # Determina URL frontend
        request_host = request.headers.get("host", "")
        is_local = (
            "localhost" in BASE_URL or 
            "127.0.0.1" in BASE_URL or
            "localhost" in request_host or 
            "127.0.0.1" in request_host
        )
        
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
    """Ottieni tutti i magic links di un cliente"""
    try:
        links = await database.fetch_all(
            magic_links_table.select()
            .where(magic_links_table.c.cliente_id == cliente_id)
            .order_by(magic_links_table.c.created_at.desc())
        )
        
        result = []
        request_host = request.headers.get("host", "")
        is_local = (
            "localhost" in BASE_URL or 
            "127.0.0.1" in BASE_URL or
            "localhost" in request_host or 
            "127.0.0.1" in request_host
        )
        base_url = FRONTEND_URL
        
        for link in links:
            link_dict = dict(link)
            # Converti datetime in ISO string
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
    """Revoca un magic link"""
    try:
        # Verifica che il link esista
        link = await database.fetch_one(
            magic_links_table.select().where(magic_links_table.c.id == link_id)
        )
        if not link:
            raise HTTPException(status_code=404, detail="Magic link non trovato")
        
        # Revoca il link
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
    """Verifica un magic link e restituisce i dati del cliente (pubblico, senza autenticazione)"""
    try:
        link = await database.fetch_one(
            magic_links_table.select().where(magic_links_table.c.token == token)
        )
        
        if not link:
            raise HTTPException(status_code=404, detail="Magic link non trovato")
        
        link_dict = dict(link)
        cliente_id = link_dict.get("cliente_id")
        
        # Ottieni dati cliente
        cliente = await database.fetch_one(
            clienti_table.select().where(clienti_table.c.id == cliente_id)
        )
        if not cliente:
            raise HTTPException(status_code=404, detail="Cliente non trovato")
        
        cliente_dict = dict(cliente)
        
        # Verifica validità
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
    port = int(os.environ.get("PORT", 8000)) # Default port added
    uvicorn.run(app, host="0.0.0.0", port=port)
