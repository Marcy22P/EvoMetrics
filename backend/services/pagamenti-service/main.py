"""
Pagamenti Service - Microservizio per gestione pagamenti
"""

from fastapi import FastAPI, HTTPException, status, Depends, Request, Body
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import os
import json
import uuid
from pathlib import Path
from datetime import datetime, timedelta
from jose import JWTError, jwt
from contextlib import asynccontextmanager

from database import database, init_database, close_database
from models import (
    PagamentoData, PagamentoResponse, MarcaPagatoRequest, AnnullaPagamentoRequest,
    SpesaData, SpesaResponse, FinanceAnalyticsResponse, DailyTrend
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

# JWT Configuration
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
ALGORITHM = "HS256"

# Default permissions per ruolo
DEFAULT_PERMISSIONS_BY_ROLE: Dict[str, Any] = {
    "superadmin": {"__all__": True},
    "admin": {
        "pagamenti:read": True,
        "pagamenti:write": True,
        "pagamenti:delete": True,
    },
    "user": {},
}


# Funzioni helper per verificare servizi attivi
def hasSitoWeb(tipologiaServizio: str) -> bool:
    """Determina se il contratto include il servizio Sito Web"""
    return tipologiaServizio in ['sito_marketing_linkbuilding', 'sito_marketing']


def hasMarketing(tipologiaServizio: str) -> bool:
    """Determina se il contratto include il servizio Marketing"""
    return tipologiaServizio in ['sito_marketing_linkbuilding', 'sito_marketing', 'marketing_content_adv', 'marketing_adv']


def hasLinkbuilding(tipologiaServizio: str) -> bool:
    """Determina se il contratto include il servizio Linkbuilding"""
    return tipologiaServizio == 'sito_marketing_linkbuilding'


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
    
    # Ripristino query sicurezza
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


def serialize_pagamento(row: Dict[str, Any]) -> PagamentoResponse:
    """Serializza un pagamento dal database al formato API"""
    try:
        return PagamentoResponse(
            id=row['id'],
            contratto_id=row['contratto_id'],
            contratto_numero=row['contratto_numero'],
            cliente=row['cliente'],
            tipo=row['tipo'],
            descrizione=row.get('descrizione'),
            importo=float(row['importo']),
            data_scadenza=row['data_scadenza'].isoformat() if row.get('data_scadenza') else "",
            data_pagamento=row['data_pagamento'].isoformat() if row.get('data_pagamento') else None,
            status=row.get('status', 'da_pagare'),
            metodo_pagamento=row.get('metodo_pagamento'),
            note=row.get('note'),
            created_at=row['created_at'].isoformat() if row.get('created_at') else "",
            updated_at=row['updated_at'].isoformat() if row.get('updated_at') else "",
            contratto_status=row.get('contratto_status')
        )
    except Exception as e:
        print(f"❌ Errore serializzazione pagamento: {e}")
        raise


async def create_tables():
    """Crea le tabelle necessarie se non esistono"""
    query_spese = """
    CREATE TABLE IF NOT EXISTS spese (
        id TEXT PRIMARY KEY,
        descrizione TEXT NOT NULL,
        importo DECIMAL(10, 2) NOT NULL,
        data_spesa TIMESTAMP NOT NULL,
        categoria TEXT NOT NULL,
        metodo_pagamento TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """
    await database.execute(query_spese)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler per startup e shutdown"""
    print("🚀 Avvio Pagamenti Service...")
    await init_database()
    await create_tables()
    print("✅ Pagamenti Service avviato")
    yield
    print("⏹️ Spegnimento Pagamenti Service...")
    await close_database()
    print("✅ Pagamenti Service fermato")


app = FastAPI(
    title="Pagamenti Service",
    description="Microservizio per gestione pagamenti",
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
    return {"status": "healthy", "service": "pagamenti-service"}


# Dependency per verificare permesso pagamenti:read
async def check_pagamenti_read(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("pagamenti:read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: pagamenti:read"
        )
    return current_user


# Dependency per verificare permesso pagamenti:write
async def check_pagamenti_write(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("pagamenti:write"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: pagamenti:write"
        )
    return current_user


# Dependency per verificare permesso pagamenti:delete
async def check_pagamenti_delete(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("pagamenti:delete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: pagamenti:delete"
        )
    return current_user


# Funzione helper per generare ID pagamento
def genera_id_pagamento(contratto_id: str, tipo: str, indice: Optional[int] = None) -> str:
    """Genera un ID univoco per un pagamento"""
    timestamp = int(datetime.utcnow().timestamp())
    suffix = f"_{indice}" if indice else ""
    return f"pag_{contratto_id[:8]}_{tipo}_{timestamp}{suffix}"


# Funzione per generare pagamenti da contratto
async def genera_pagamenti_da_contratto_internal(contratto_id: str) -> Dict[str, Any]:
    """Genera automaticamente i pagamenti da un contratto"""
    # Recupera il contratto
    contratto_row = await database.fetch_one(
        "SELECT * FROM contratti WHERE id = :id",
        {"id": contratto_id}
    )
    
    if not contratto_row:
        raise HTTPException(status_code=404, detail="Contratto non trovato")
    
    contratto = dict(contratto_row)
    
    # Verifica se ci sono già pagamenti per questo contratto
    existing = await database.fetch_all(
        "SELECT id FROM pagamenti WHERE contratto_id = :id",
        {"id": contratto_id}
    )
    
    if existing:
        return {
            "status": "info",
            "message": f"Pagamenti già esistenti per il contratto {contratto['numero']}",
            "pagamenti_esistenti": len(existing),
            "pagamenti_creati": []
        }
    
    # Parse dei dati JSON
    dati_committente = json.loads(contratto['dati_committente']) if isinstance(contratto.get('dati_committente'), str) else (contratto.get('dati_committente') or {})
    compenso = json.loads(contratto['compenso']) if isinstance(contratto.get('compenso'), str) else (contratto.get('compenso') or {})
    durata = json.loads(contratto['durata']) if isinstance(contratto.get('durata'), str) else (contratto.get('durata') or {})
    
    cliente = dati_committente.get('ragioneSociale', 'Cliente sconosciuto')
    pagamenti_creati = []
    now = datetime.utcnow()
    
    # 1. Genera pagamenti Sito Web (se presente e se il servizio è attivo)
    if 'sitoWeb' in compenso and compenso['sitoWeb'] and hasSitoWeb(contratto['tipologia_servizio']):
        sito = compenso['sitoWeb']
        modalita = sito['modalitaPagamento']
        
        acconto = float(sito['acconto'])
        saldo = float(sito['saldo'])
        seconda_rata = float(sito.get('secondaRata', 0)) if sito.get('secondaRata') else None
        
        data_scadenza_base = datetime.fromisoformat(durata['dataDecorrenza']) if durata.get('dataDecorrenza') else now
        
        if modalita == '50_50':
            # Acconto
            pag1_id = genera_id_pagamento(contratto_id, "sito_acconto")
            await database.execute(
                "INSERT INTO pagamenti (id, contratto_id, contratto_numero, cliente, tipo, descrizione, importo, data_scadenza, status, created_at, updated_at) VALUES (:id, :contratto_id, :contratto_numero, :cliente, :tipo, :descrizione, :importo, :data_scadenza, :status, :created_at, :updated_at)",
                {
                    "id": pag1_id,
                    "contratto_id": contratto_id,
                    "contratto_numero": contratto['numero'],
                    "cliente": cliente,
                    "tipo": "sito_acconto",
                    "descrizione": "Sito Web - Acconto",
                    "importo": acconto,
                    "data_scadenza": data_scadenza_base,
                    "status": "da_pagare",
                    "created_at": now,
                    "updated_at": now
                }
            )
            pagamenti_creati.append(pag1_id)
            
            # Saldo
            pag2_id = genera_id_pagamento(contratto_id, "sito_saldo", 2)
            await database.execute(
                "INSERT INTO pagamenti (id, contratto_id, contratto_numero, cliente, tipo, descrizione, importo, data_scadenza, status, created_at, updated_at) VALUES (:id, :contratto_id, :contratto_numero, :cliente, :tipo, :descrizione, :importo, :data_scadenza, :status, :created_at, :updated_at)",
                {
                    "id": pag2_id,
                    "contratto_id": contratto_id,
                    "contratto_numero": contratto['numero'],
                    "cliente": cliente,
                    "tipo": "sito_saldo",
                    "descrizione": "Sito Web - Saldo",
                    "importo": saldo,
                    "data_scadenza": data_scadenza_base + timedelta(days=30),
                    "status": "da_pagare",
                    "created_at": now,
                    "updated_at": now
                }
            )
            pagamenti_creati.append(pag2_id)
            
        elif modalita == '40_30_30':
            # Acconto
            pag1_id = genera_id_pagamento(contratto_id, "sito_acconto")
            await database.execute(
                "INSERT INTO pagamenti (id, contratto_id, contratto_numero, cliente, tipo, descrizione, importo, data_scadenza, status, created_at, updated_at) VALUES (:id, :contratto_id, :contratto_numero, :cliente, :tipo, :descrizione, :importo, :data_scadenza, :status, :created_at, :updated_at)",
                {
                    "id": pag1_id,
                    "contratto_id": contratto_id,
                    "contratto_numero": contratto['numero'],
                    "cliente": cliente,
                    "tipo": "sito_acconto",
                    "descrizione": "Sito Web - Acconto",
                    "importo": acconto,
                    "data_scadenza": data_scadenza_base,
                    "status": "da_pagare",
                    "created_at": now,
                    "updated_at": now
                }
            )
            pagamenti_creati.append(pag1_id)
            
            # Rata 2
            if seconda_rata:
                pag2_id = genera_id_pagamento(contratto_id, "sito_rata2", 2)
                await database.execute(
                    "INSERT INTO pagamenti (id, contratto_id, contratto_numero, cliente, tipo, descrizione, importo, data_scadenza, status, created_at, updated_at) VALUES (:id, :contratto_id, :contratto_numero, :cliente, :tipo, :descrizione, :importo, :data_scadenza, :status, :created_at, :updated_at)",
                    {
                        "id": pag2_id,
                        "contratto_id": contratto_id,
                        "contratto_numero": contratto['numero'],
                        "cliente": cliente,
                        "tipo": "sito_rata2",
                        "descrizione": "Sito Web - Rata 2",
                        "importo": seconda_rata,
                        "data_scadenza": data_scadenza_base + timedelta(days=30),
                        "status": "da_pagare",
                        "created_at": now,
                        "updated_at": now
                    }
                )
                pagamenti_creati.append(pag2_id)
            
            # Saldo
            pag3_id = genera_id_pagamento(contratto_id, "sito_saldo", 3)
            await database.execute(
                "INSERT INTO pagamenti (id, contratto_id, contratto_numero, cliente, tipo, descrizione, importo, data_scadenza, status, created_at, updated_at) VALUES (:id, :contratto_id, :contratto_numero, :cliente, :tipo, :descrizione, :importo, :data_scadenza, :status, :created_at, :updated_at)",
                {
                    "id": pag3_id,
                    "contratto_id": contratto_id,
                    "contratto_numero": contratto['numero'],
                    "cliente": cliente,
                    "tipo": "sito_saldo",
                    "descrizione": "Sito Web - Saldo",
                    "importo": saldo,
                    "data_scadenza": data_scadenza_base + timedelta(days=60),
                    "status": "da_pagare",
                    "created_at": now,
                    "updated_at": now
                }
            )
            pagamenti_creati.append(pag3_id)
    
    # 2. Genera pagamenti Marketing mensili (se presente e se il servizio è attivo)
    if 'marketing' in compenso and compenso['marketing'] and hasMarketing(contratto['tipologia_servizio']):
        marketing = compenso['marketing']
        importo_mensile = float(marketing['importoMensile'])
        giorno_pagamento = int(marketing.get('giornoPagamento', 1))
        
        # Calcola numero di mesi
        tipo_durata = durata.get('tipo', '12_mesi_senza_rinnovo')
        if '12' in tipo_durata:
            num_mesi = 12
        elif '6' in tipo_durata:
            num_mesi = 6
        elif '3' in tipo_durata:
            num_mesi = 3
        else:
            num_mesi = 12
        
        data_inizio = datetime.fromisoformat(durata['dataDecorrenza']) if durata.get('dataDecorrenza') else now
        
        for i in range(num_mesi):
            # Calcola data scadenza per questo mese
            mese_corrente = data_inizio.month + i
            anno_corrente = data_inizio.year + (mese_corrente - 1) // 12
            mese_corrente = ((mese_corrente - 1) % 12) + 1
            
            data_scadenza_mese = datetime(anno_corrente, mese_corrente, min(giorno_pagamento, 28))
            
            pag_id = genera_id_pagamento(contratto_id, f"marketing_m{i+1}")
            await database.execute(
                "INSERT INTO pagamenti (id, contratto_id, contratto_numero, cliente, tipo, descrizione, importo, data_scadenza, status, created_at, updated_at) VALUES (:id, :contratto_id, :contratto_numero, :cliente, :tipo, :descrizione, :importo, :data_scadenza, :status, :created_at, :updated_at)",
                {
                    "id": pag_id,
                    "contratto_id": contratto_id,
                    "contratto_numero": contratto['numero'],
                    "cliente": cliente,
                    "tipo": "marketing_mensile",
                    "descrizione": f"Marketing - Mese {i+1}",
                    "importo": importo_mensile,
                    "data_scadenza": data_scadenza_mese,
                    "status": "da_pagare",
                    "created_at": now,
                    "updated_at": now
                }
            )
            pagamenti_creati.append(pag_id)
    
    return {
        "status": "success",
        "message": f"Generati {len(pagamenti_creati)} pagamenti",
        "pagamenti_creati": pagamenti_creati
    }


# Endpoint GET /api/pagamenti/clienti
@app.get("/api/pagamenti/clienti", response_model=List[str])
async def get_clienti_pagamenti(
    current_user: Dict[str, Any] = Depends(check_pagamenti_read)
):
    """Recupera la lista unica dei clienti che hanno pagamenti"""
    try:
        query = "SELECT DISTINCT cliente FROM pagamenti ORDER BY cliente"
        rows = await database.fetch_all(query)
        return [row['cliente'] for row in rows if row['cliente']]
    except Exception as e:
        print(f"❌ Errore recupero clienti: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Endpoint GET /api/pagamenti
@app.get("/api/pagamenti", response_model=List[PagamentoResponse])
async def get_all_pagamenti(
    status: Optional[str] = None,
    search: Optional[str] = None,
    cliente: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: Dict[str, Any] = Depends(check_pagamenti_read)
):
    """Recupera tutti i pagamenti con i contratti associati e filtri opzionali"""
    try:
        query = """
        SELECT p.*, c.status as contratto_status
        FROM pagamenti p
        LEFT JOIN contratti c ON p.contratto_id = c.id
        WHERE 1=1
        """
        params = {}

        if status:
            if status == 'scaduti':
                query += " AND p.status = 'da_pagare' AND p.data_scadenza < :now"
                params["now"] = datetime.utcnow()
            elif status != 'tutti' and status is not None:
                query += " AND p.status = :status"
                params["status"] = status

        if search:
            query += """ AND (
                p.cliente ILIKE :search OR 
                p.contratto_numero ILIKE :search OR 
                p.descrizione ILIKE :search OR 
                CAST(p.importo AS TEXT) ILIKE :search
            )"""
            params["search"] = f"%{search}%"

        if cliente:
            query += " AND p.cliente ILIKE :cliente"
            params["cliente"] = f"%{cliente}%"

        if date_from:
            try:
                d_from = datetime.fromisoformat(date_from.replace('Z', '+00:00')).replace(tzinfo=None)
                query += " AND p.data_scadenza >= :date_from"
                params["date_from"] = d_from
            except ValueError:
                pass # Ignora data non valida

        if date_to:
            try:
                d_to = datetime.fromisoformat(date_to.replace('Z', '+00:00')).replace(tzinfo=None)
                query += " AND p.data_scadenza <= :date_to"
                params["date_to"] = d_to
            except ValueError:
                pass

        query += " ORDER BY p.data_scadenza ASC LIMIT :limit OFFSET :offset"
        params["limit"] = limit
        params["offset"] = offset

        rows = await database.fetch_all(query, params)
        
        pagamenti = []
        for row in rows:
            try:
                pagamenti.append(serialize_pagamento(dict(row)))
            except Exception as row_error:
                print(f"❌ Errore processando riga pagamento: {row_error}")
                continue
        
        return pagamenti
        
    except Exception as e:
        print(f"❌ Errore nel recupero dei pagamenti: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nel recupero dei pagamenti: {str(e)}")


# Endpoint GET /api/pagamenti/contratto/{contratto_id}
@app.get("/api/pagamenti/contratto/{contratto_id}", response_model=List[PagamentoResponse])
async def get_pagamenti_by_contratto(
    contratto_id: str,
    current_user: Dict[str, Any] = Depends(check_pagamenti_read)
):
    """Recupera tutti i pagamenti di un contratto specifico"""
    try:
        query = """
        SELECT p.*, c.status as contratto_status
        FROM pagamenti p
        LEFT JOIN contratti c ON p.contratto_id = c.id
        WHERE p.contratto_id = :contratto_id
        ORDER BY p.data_scadenza ASC
        """
        rows = await database.fetch_all(query, {"contratto_id": contratto_id})
        
        pagamenti = []
        for row in rows:
            try:
                pagamenti.append(serialize_pagamento(dict(row)))
            except Exception as row_error:
                print(f"❌ Errore processando riga pagamento: {row_error}")
                continue
        
        return pagamenti
        
    except Exception as e:
        print(f"❌ Errore nel recupero dei pagamenti: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nel recupero dei pagamenti: {str(e)}")


# Endpoint POST /api/pagamenti/genera/{contratto_id}
@app.post("/api/pagamenti/genera/{contratto_id}")
@app.get("/api/pagamenti/genera/{contratto_id}")
async def genera_pagamenti_da_contratto(
    contratto_id: str,
    current_user: Dict[str, Any] = Depends(check_pagamenti_write)
):
    """Genera automaticamente i pagamenti da un contratto"""
    try:
        return await genera_pagamenti_da_contratto_internal(contratto_id)
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nella generazione pagamenti: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nella generazione pagamenti: {str(e)}")


# Endpoint PUT /api/pagamenti/{pagamento_id}/marca-pagato
@app.put("/api/pagamenti/{pagamento_id}/marca-pagato")
async def marca_pagamento_come_pagato(
    pagamento_id: str,
    request: MarcaPagatoRequest,
    current_user: Dict[str, Any] = Depends(check_pagamenti_write)
):
    """Marca un pagamento come pagato"""
    try:
        # Verifica che il pagamento esista
        pagamento = await database.fetch_one(
            "SELECT * FROM pagamenti WHERE id = :id",
            {"id": pagamento_id}
        )
        
        if not pagamento:
            raise HTTPException(status_code=404, detail="Pagamento non trovato")
        
        # Data pagamento: usa quella fornita o la data corrente
        data_pagamento = request.data_pagamento if request.data_pagamento else datetime.utcnow().isoformat()
        
        # Gestione formato ISO con 'Z' (UTC)
        if data_pagamento.endswith('Z'):
            data_pagamento = data_pagamento[:-1]
        
        # Aggiorna il pagamento
        update_data = {
            "status": "pagato",
            "data_pagamento": datetime.fromisoformat(data_pagamento),
            "updated_at": datetime.utcnow()
        }
        
        if request.metodo_pagamento:
            update_data["metodo_pagamento"] = request.metodo_pagamento
        if request.note:
            update_data["note"] = request.note
        
        await database.execute(
            "UPDATE pagamenti SET status = :status, data_pagamento = :data_pagamento, metodo_pagamento = :metodo_pagamento, note = :note, updated_at = :updated_at WHERE id = :id",
            {
                "id": pagamento_id,
                "status": update_data["status"],
                "data_pagamento": update_data["data_pagamento"],
                "metodo_pagamento": update_data.get("metodo_pagamento"),
                "note": update_data.get("note"),
                "updated_at": update_data["updated_at"]
            }
        )
        
        return {
            "status": "success",
            "message": "Pagamento marcato come pagato",
            "pagamento_id": pagamento_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nel marcare pagamento come pagato: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nel marcare pagamento come pagato: {str(e)}")


# Endpoint DELETE /api/pagamenti/{pagamento_id}/annulla-pagamento
@app.delete("/api/pagamenti/{pagamento_id}/annulla-pagamento")
async def annulla_pagamento(
    pagamento_id: str,
    request: Optional[AnnullaPagamentoRequest] = None,
    current_user: Dict[str, Any] = Depends(check_pagamenti_write)
):
    """Annulla un pagamento (solo se già pagato)"""
    try:
        # Verifica che il pagamento esista
        pagamento = await database.fetch_one(
            "SELECT * FROM pagamenti WHERE id = :id",
            {"id": pagamento_id}
        )
        
        if not pagamento:
            raise HTTPException(status_code=404, detail="Pagamento non trovato")
        
        if pagamento['status'] != 'pagato':
            raise HTTPException(status_code=400, detail="Solo i pagamenti già marcati come pagati possono essere annullati")
        
        # Aggiorna il pagamento
        await database.execute(
            "UPDATE pagamenti SET status = :status, data_pagamento = NULL, metodo_pagamento = NULL, note = :note, updated_at = :updated_at WHERE id = :id",
            {
                "id": pagamento_id,
                "status": "da_pagare",
                "note": request.note if request and request.note else None,
                "updated_at": datetime.utcnow()
            }
        )
        
        return {
            "status": "success",
            "message": "Pagamento annullato con successo",
            "pagamento_id": pagamento_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nell'annullamento del pagamento: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nell'annullamento del pagamento: {str(e)}")


# Endpoint PUT /api/pagamenti/contratto/{contratto_id}/rescisso
@app.put("/api/pagamenti/contratto/{contratto_id}/rescisso")
async def gestisci_pagamenti_contratto_rescisso(
    contratto_id: str,
    current_user: Dict[str, Any] = Depends(check_pagamenti_write)
):
    """Gestisce i pagamenti quando un contratto viene rescisso"""
    try:
        # Verifica che il contratto esista
        contratto = await database.fetch_one(
            "SELECT * FROM contratti WHERE id = :id",
            {"id": contratto_id}
        )
        
        if not contratto:
            raise HTTPException(status_code=404, detail="Contratto non trovato")
        
        # Recupera tutti i pagamenti del contratto
        pagamenti = await database.fetch_all(
            "SELECT * FROM pagamenti WHERE contratto_id = :id",
            {"id": contratto_id}
        )
        
        if not pagamenti:
            return {
                "status": "info",
                "message": "Nessun pagamento trovato per questo contratto",
                "deleted_count": 0,
                "preserved_count": 0
            }
        
        # Separa pagamenti pagati da quelli non pagati
        pagamenti_pagati = [p for p in pagamenti if p['status'] == 'pagato']
        pagamenti_non_pagati = [p for p in pagamenti if p['status'] != 'pagato']
        
        # Elimina solo i pagamenti NON pagati
        deleted_count = 0
        if pagamenti_non_pagati:
            await database.execute(
                "DELETE FROM pagamenti WHERE contratto_id = :contratto_id AND status != 'pagato'",
                {"contratto_id": contratto_id}
            )
            deleted_count = len(pagamenti_non_pagati)
        
        return {
            "status": "success",
            "message": f"Contratto rescisso: eliminati {deleted_count} pagamenti non pagati, preservati {len(pagamenti_pagati)} pagamenti pagati",
            "deleted_count": deleted_count,
            "preserved_count": len(pagamenti_pagati),
            "contratto_numero": contratto['numero']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nella gestione pagamenti contratto rescisso: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nella gestione pagamenti contratto rescisso: {str(e)}")


# Webhook per generazione automatica quando contratto diventa firmato
@app.post("/api/pagamenti/webhook/contratto-firmato")
async def webhook_contratto_firmato(
    body: Dict[str, Any] = Body(...),
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user)
):
    """Webhook chiamato quando un contratto diventa firmato"""
    try:
        contratto_id = body.get("contratto_id")
        if not contratto_id:
            raise HTTPException(status_code=400, detail="contratto_id richiesto")
        
        # Genera i pagamenti
        result = await genera_pagamenti_da_contratto_internal(contratto_id)
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nel webhook contratto firmato: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nel webhook: {str(e)}")


# Endpoint Spese
@app.post("/api/spese", response_model=SpesaResponse)
async def crea_spesa(
    spesa: SpesaData,
    current_user: Dict[str, Any] = Depends(check_pagamenti_write)
):
    """Registra una nuova spesa"""
    try:
        spesa_id = str(uuid.uuid4())
        now = datetime.utcnow()
        
        query = """
        INSERT INTO spese (id, descrizione, importo, data_spesa, categoria, metodo_pagamento, note, created_at)
        VALUES (:id, :descrizione, :importo, :data_spesa, :categoria, :metodo_pagamento, :note, :created_at)
        """
        # Assicurati che data_spesa sia datetime
        try:
            d_spesa = datetime.fromisoformat(spesa.data_spesa.replace('Z', '+00:00'))
        except:
            d_spesa = now

        values = {
            "id": spesa_id,
            "descrizione": spesa.descrizione,
            "importo": spesa.importo,
            "data_spesa": d_spesa,
            "categoria": spesa.categoria,
            "metodo_pagamento": spesa.metodo_pagamento,
            "note": spesa.note,
            "created_at": now
        }
        await database.execute(query, values)
        
        return {**values, "data_spesa": d_spesa.isoformat(), "created_at": now.isoformat()}
    except Exception as e:
        print(f"❌ Errore creazione spesa: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/bilancio/analytics", response_model=FinanceAnalyticsResponse)
async def get_finance_analytics(
    start_date: str,
    end_date: str,
    current_user: Dict[str, Any] = Depends(check_pagamenti_read)
):
    """Analytics finanziarie complete"""
    try:
        # Gestione date basic
        start = datetime.fromisoformat(start_date.replace('Z', '+00:00')).replace(tzinfo=None)
        end = datetime.fromisoformat(end_date.replace('Z', '+00:00')).replace(tzinfo=None)
        
        # Entrate (Pagamenti pagati)
        query_entrate = """
        SELECT DATE(data_pagamento) as giorno, SUM(importo) as totale 
        FROM pagamenti 
        WHERE status = 'pagato' AND data_pagamento >= :start AND data_pagamento <= :end
        GROUP BY DATE(data_pagamento)
        ORDER BY giorno
        """
        entrate_rows = await database.fetch_all(query_entrate, {"start": start, "end": end})
        
        # Uscite (Spese)
        query_uscite = """
        SELECT DATE(data_spesa) as giorno, SUM(importo) as totale
        FROM spese
        WHERE data_spesa >= :start AND data_spesa <= :end
        GROUP BY DATE(data_spesa)
        ORDER BY giorno
        """
        uscite_rows = await database.fetch_all(query_uscite, {"start": start, "end": end})
        
        # Aggregazione dati daily
        daily_map = {}
        current = start
        while current <= end:
            d_str = current.date().isoformat()
            daily_map[d_str] = {"date": d_str, "entrate": 0.0, "uscite": 0.0}
            current += timedelta(days=1)
            
        entrate_tot = 0.0
        for row in entrate_rows:
            d_str = row['giorno'].isoformat()
            if d_str in daily_map:
                daily_map[d_str]["entrate"] = float(row['totale'])
                entrate_tot += float(row['totale'])
                
        uscite_tot = 0.0
        for row in uscite_rows:
            d_str = row['giorno'].isoformat()
            if d_str in daily_map:
                daily_map[d_str]["uscite"] = float(row['totale'])
                uscite_tot += float(row['totale'])
                
        trend = []
        for d_str in sorted(daily_map.keys()):
            val = daily_map[d_str]
            trend.append({
                "date": d_str,
                "entrate": val["entrate"],
                "uscite": val["uscite"],
                "netto": val["entrate"] - val["uscite"]
            })
            
        # Tasse (es. 22% su entrate imponibili, semplificato)
        tasse_stimate = entrate_tot * 0.22 
        utile_netto = entrate_tot - uscite_tot - tasse_stimate
        
        return {
            "periodo_start": start_date,
            "periodo_end": end_date,
            "entrate_totali": entrate_tot,
            "uscite_totali": uscite_tot,
            "tasse_stimate": tasse_stimate,
            "utile_netto": utile_netto,
            "trend_daily": trend
        }
    except Exception as e:
        print(f"❌ Errore analytics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Avvio del server
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT"))
    if not port:
        raise ValueError("PORT environment variable is required")
    uvicorn.run(app, host="0.0.0.0", port=PAGAMENTI_SERVICE_PORT)

