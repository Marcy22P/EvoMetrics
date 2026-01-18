"""
Contratti Service - Microservizio per gestione contratti
"""

from fastapi import FastAPI, HTTPException, status, Depends, Request
from starlette.requests import Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import os
import json
import uuid
from pathlib import Path
from datetime import datetime
from jose import JWTError, jwt
from contextlib import asynccontextmanager
import httpx

from database import database, init_database, close_database
from models import ContrattoData, ContrattoResponse, UpdateStatusRequest

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
        "contratti:read": True,
        "contratti:write": True,
        "contratti:delete": True,
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


def serialize_contratto(row: Dict[str, Any]) -> ContrattoResponse:
    """Serializza un contratto dal database al formato API"""
    try:
        # Parsifica i campi JSON
        dati_committente = json.loads(row['dati_committente']) if isinstance(row.get('dati_committente'), str) else (row.get('dati_committente') or {})
        servizi = json.loads(row['servizi']) if isinstance(row.get('servizi'), str) else (row.get('servizi') or [])
        durata = json.loads(row['durata']) if isinstance(row.get('durata'), str) else (row.get('durata') or {})
        compenso = json.loads(row['compenso']) if isinstance(row.get('compenso'), str) else (row.get('compenso') or {})
        articoli = json.loads(row['articoli']) if isinstance(row.get('articoli'), str) else (row.get('articoli') or {})
        
        # Costruisci risposta
        response_data = {
            "id": row['id'],
            "numero": row['numero'],
            "datiCommittente": dati_committente,
            "tipologiaServizio": row['tipologia_servizio'],
            "servizi": servizi,
            "durata": durata,
            "compenso": compenso,
            "note": row.get('note'),
            "status": row.get('status', 'bozza'),
            "created_at": row['created_at'].isoformat() if row.get('created_at') else None,
            "updated_at": row['updated_at'].isoformat() if row.get('updated_at') else None,
        }
        
        # Aggiungi articoli modificabili
        if articoli:
            response_data.update({
                "articolo2Oggetto": articoli.get("articolo2Oggetto"),
                "articolo2SitoWeb": articoli.get("articolo2SitoWeb"),
                "articolo2Marketing": articoli.get("articolo2Marketing"),
                "articolo2Linkbuilding": articoli.get("articolo2Linkbuilding"),
                "articolo3Modalita": articoli.get("articolo3Modalita"),
                "articolo4Durata": articoli.get("articolo4Durata"),
                "articolo5Compenso": articoli.get("articolo5Compenso"),
                "articolo6Proprieta": articoli.get("articolo6Proprieta"),
                "articolo7Responsabilita": articoli.get("articolo7Responsabilita"),
                "articolo8NormeRinvio": articoli.get("articolo8NormeRinvio"),
                "articolo9ForoCompetente": articoli.get("articolo9ForoCompetente"),
            })
        
        return ContrattoResponse(**response_data)
    except Exception as e:
        print(f"❌ Errore serializzazione contratto: {e}")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler per startup e shutdown"""
    print("🚀 Avvio Contratti Service...")
    await init_database()
    print("✅ Contratti Service avviato")
    yield
    print("⏹️ Spegnimento Contratti Service...")
    await close_database()
    print("✅ Contratti Service fermato")


app = FastAPI(
    title="Contratti Service",
    description="Microservizio per gestione contratti",
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
    return {"status": "healthy", "service": "contratti-service"}


# Dependency per verificare permesso contratti:read
async def check_contratti_read(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("contratti:read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: contratti:read"
        )
    return current_user


# Dependency per verificare permesso contratti:write
async def check_contratti_write(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("contratti:write"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: contratti:write"
        )
    return current_user


# Dependency per verificare permesso contratti:delete
async def check_contratti_delete(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("contratti:delete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: contratti:delete"
        )
    return current_user


@app.get("/api/contratti", response_model=Dict[str, List[ContrattoResponse]])
async def get_contratti(
    current_user: Dict[str, Any] = Depends(check_contratti_read)
):
    """Ottieni tutti i contratti"""
    try:
        query = "SELECT * FROM contratti ORDER BY created_at DESC"
        rows = await database.fetch_all(query)
        
        if not rows:
            return {"contratti": []}
        
        contratti = []
        for row in rows:
            try:
                contratti.append(serialize_contratto(dict(row)))
            except Exception as row_error:
                print(f"❌ Errore processando riga contratto: {row_error}")
                continue
        
        return {"contratti": contratti}
        
    except Exception as e:
        print(f"❌ Errore nel caricamento contratti: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento contratti: {str(e)}")


@app.post("/api/contratti", response_model=ContrattoResponse)
async def create_contratto(
    contratto: ContrattoData,
    current_user: Dict[str, Any] = Depends(check_contratti_write)
):
    """Crea un nuovo contratto"""
    try:
        contratto_id = str(uuid.uuid4())
        now = datetime.now()
        
        # Prepara i dati per il salvataggio
        dati_committente_json = json.dumps(contratto.datiCommittente.model_dump())
        servizi_json = json.dumps([s.model_dump() for s in contratto.servizi])
        durata_json = json.dumps(contratto.durata.model_dump())
        compenso_json = json.dumps(contratto.compenso.model_dump())
        
        # Articoli modificabili - salva sempre tutti i campi, anche se vuoti
        articoli_data = {
            "articolo2Oggetto": contratto.articolo2Oggetto or "",
            "articolo2SitoWeb": contratto.articolo2SitoWeb or "",
            "articolo2Marketing": contratto.articolo2Marketing or "",
            "articolo2Linkbuilding": contratto.articolo2Linkbuilding or "",
            "articolo3Modalita": contratto.articolo3Modalita or "",
            "articolo4Durata": contratto.articolo4Durata or "",
            "articolo5Compenso": contratto.articolo5Compenso or "",
            "articolo6Proprieta": contratto.articolo6Proprieta or "",
            "articolo7Responsabilita": contratto.articolo7Responsabilita or "",
            "articolo8NormeRinvio": contratto.articolo8NormeRinvio or "",
            "articolo9ForoCompetente": contratto.articolo9ForoCompetente or ""
        }
        
        articoli_json = json.dumps(articoli_data)
        
        # Inserisci il contratto nel database
        insert_query = """
        INSERT INTO contratti (
            id, numero, dati_committente, tipologia_servizio, servizi, durata, compenso, 
            note, status, created_at, updated_at, source, articoli, 
            ragione_sociale, email_contatto, telefono_contatto
        )
        VALUES (
            :id, :numero, :dati_committente, :tipologia_servizio, :servizi, :durata, :compenso,
            :note, :status, :created_at, :updated_at, :source, :articoli, 
            :ragione_sociale, :email_contatto, :telefono_contatto
        )
        """
        
        await database.execute(insert_query, {
            "id": contratto_id,
            "numero": contratto.numero,
            "dati_committente": dati_committente_json,
            "tipologia_servizio": contratto.tipologiaServizio,
            "servizi": servizi_json,
            "durata": durata_json,
            "compenso": compenso_json,
            "note": contratto.note,
            "status": contratto.status,
            "created_at": now,
            "updated_at": now,
            "source": "manual",
            "articoli": articoli_json,
            "ragione_sociale": contratto.datiCommittente.ragioneSociale,
            "email_contatto": contratto.datiCommittente.email,
            "telefono_contatto": contratto.datiCommittente.telefono
        })
        
        # Recupera il contratto appena creato per la risposta
        created_row = await database.fetch_one("SELECT * FROM contratti WHERE id = :id", {"id": contratto_id})
        return serialize_contratto(dict(created_row))
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Errore nella creazione del contratto: {str(e)}")


@app.put("/api/contratti/{contratto_id}", response_model=ContrattoResponse)
async def update_contratto(
    contratto_id: str,
    contratto: ContrattoData,
    current_user: Dict[str, Any] = Depends(check_contratti_write)
):
    """Aggiorna un contratto esistente"""
    try:
        now = datetime.now()
        
        # Verifica che il contratto esista
        existing = await database.fetch_one(
            "SELECT id, status FROM contratti WHERE id = :id",
            {"id": contratto_id}
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Contratto non trovato")
        
        # Prepara i dati per l'aggiornamento
        dati_committente_json = json.dumps(contratto.datiCommittente.model_dump())
        servizi_json = json.dumps([s.model_dump() for s in contratto.servizi])
        durata_json = json.dumps(contratto.durata.model_dump())
        compenso_json = json.dumps(contratto.compenso.model_dump())
        
        # Articoli modificabili - salva sempre tutti i campi, anche se vuoti
        articoli_data = {
            "articolo2Oggetto": contratto.articolo2Oggetto or "",
            "articolo2SitoWeb": contratto.articolo2SitoWeb or "",
            "articolo2Marketing": contratto.articolo2Marketing or "",
            "articolo2Linkbuilding": contratto.articolo2Linkbuilding or "",
            "articolo3Modalita": contratto.articolo3Modalita or "",
            "articolo4Durata": contratto.articolo4Durata or "",
            "articolo5Compenso": contratto.articolo5Compenso or "",
            "articolo6Proprieta": contratto.articolo6Proprieta or "",
            "articolo7Responsabilita": contratto.articolo7Responsabilita or "",
            "articolo8NormeRinvio": contratto.articolo8NormeRinvio or "",
            "articolo9ForoCompetente": contratto.articolo9ForoCompetente or ""
        }
        
        articoli_json = json.dumps(articoli_data)
        
        # Aggiorna il contratto nel database
        update_query = """
        UPDATE contratti 
        SET numero = :numero,
            dati_committente = :dati_committente,
            tipologia_servizio = :tipologia_servizio,
            servizi = :servizi,
            durata = :durata,
            compenso = :compenso,
            note = :note,
            status = :status,
            updated_at = :updated_at,
            articoli = :articoli,
            ragione_sociale = :ragione_sociale,
            email_contatto = :email_contatto,
            telefono_contatto = :telefono_contatto
        WHERE id = :id
        """
        
        print(f"DEBUG: Eseguo update contratto {contratto_id}")
        # print(f"DEBUG: Params: {dati_committente_json}") # Evita log enormi

        try:
            result = await database.execute(update_query, {
                "id": contratto_id,
                "numero": contratto.numero,
                "dati_committente": dati_committente_json,
                "tipologia_servizio": contratto.tipologiaServizio,
                "servizi": servizi_json,
                "durata": durata_json,
                "compenso": compenso_json,
                "note": contratto.note,
                "status": contratto.status,
                "updated_at": now,
                "articoli": articoli_json,
                "ragione_sociale": contratto.datiCommittente.ragioneSociale,
                "email_contatto": contratto.datiCommittente.email,
                "telefono_contatto": contratto.datiCommittente.telefono
            })
            print(f"DEBUG: Update result: {result}")
        except Exception as db_err:
            print(f"DEBUG: Errore execute: {db_err}")
            import traceback
            traceback.print_exc()
            raise db_err
        
        if result == 0:
            raise HTTPException(status_code=404, detail="Contratto non trovato")
        
        print("DEBUG: Checking status change")
        # Se lo status è diventato "firmato", chiama il webhook del Pagamenti Service
        # existing è un Record, convertiamo in dict per sicurezza
        existing_dict = dict(existing)
        old_status = existing_dict.get('status', 'bozza')
        new_status = contratto.status
        
        print(f"DEBUG: Status check: {old_status} -> {new_status}")
        
        if old_status != 'firmato' and new_status == 'firmato':
            print("DEBUG: Calling webhook")
            try:
                PAGAMENTI_SERVICE_URL = os.environ.get("PAGAMENTI_SERVICE_URL")
                if PAGAMENTI_SERVICE_URL:
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            f"{PAGAMENTI_SERVICE_URL}/api/pagamenti/webhook/contratto-firmato",
                            json={"contratto_id": contratto_id},
                            timeout=10.0
                        )
                    print(f"✅ Webhook Pagamenti Service chiamato per contratto {contratto_id}")
                else:
                    print("⚠️ PAGAMENTI_SERVICE_URL non configurato, webhook saltato")
            except Exception as webhook_error:
                print(f"⚠️ Errore nel webhook Pagamenti Service: {webhook_error}")
                # Non bloccare l'aggiornamento del contratto se il webhook fallisce
        
        # Recupera il contratto aggiornato per la risposta
        print("DEBUG: Fetching updated row")
        updated_row = await database.fetch_one("SELECT * FROM contratti WHERE id = :id", {"id": contratto_id})
        if not updated_row:
             print("DEBUG: updated_row is None!")
        
        print("DEBUG: Serializing")
        return serialize_contratto(dict(updated_row))
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nell'aggiornamento contratto: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nell'aggiornamento del contratto: {str(e)}")


@app.patch("/api/contratti/{contratto_id}/status", response_model=Dict[str, Any])
async def update_contratto_status(
    contratto_id: str,
    status_data: UpdateStatusRequest,
    current_user: Dict[str, Any] = Depends(check_contratti_write)
):
    """Aggiorna solo lo status di un contratto"""
    try:
        # Verifica che il contratto esista
        existing = await database.fetch_one(
            "SELECT id, status FROM contratti WHERE id = :id",
            {"id": contratto_id}
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Contratto non trovato")
        
        old_status = existing["status"]
        new_status = status_data.status
        
        if not new_status:
            raise HTTPException(status_code=400, detail="Status richiesto")
        
        # Aggiorna solo lo status
        update_query = """
        UPDATE contratti 
        SET status = :status,
            updated_at = :updated_at
        WHERE id = :id
        """
        
        await database.execute(update_query, {
            "id": contratto_id,
            "status": new_status,
            "updated_at": datetime.now()
        })
        
        # Se lo status è diventato "firmato", chiama il webhook del Pagamenti Service
        if old_status != 'firmato' and new_status == 'firmato':
            try:
                PAGAMENTI_SERVICE_URL = os.environ.get("PAGAMENTI_SERVICE_URL")
                if PAGAMENTI_SERVICE_URL:
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            f"{PAGAMENTI_SERVICE_URL}/api/pagamenti/webhook/contratto-firmato",
                            json={"contratto_id": contratto_id},
                            timeout=10.0
                        )
                    print(f"✅ Webhook Pagamenti Service chiamato per contratto {contratto_id}")
                else:
                    print("⚠️ PAGAMENTI_SERVICE_URL non configurato, webhook saltato")
            except Exception as webhook_error:
                print(f"⚠️ Errore nel webhook Pagamenti Service: {webhook_error}")
                # Non bloccare l'aggiornamento del contratto se il webhook fallisce
        
        return {
            "message": f"Status contratto aggiornato da '{old_status}' a '{new_status}'",
            "contratto_id": contratto_id,
            "old_status": old_status,
            "new_status": new_status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nell'aggiornamento status contratto: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nell'aggiornamento dello status: {str(e)}")


@app.put("/api/contratti/{contratto_id}/link-cliente")
async def link_contratto_to_cliente(
    contratto_id: str,
    request: Request,
    current_user: Dict[str, Any] = Depends(check_contratti_write)
):
    """Collega un contratto a un cliente"""
    try:
        body = await request.json()
        cliente_id = body.get("cliente_id")
        
        if not cliente_id:
            raise HTTPException(status_code=400, detail="cliente_id richiesto")
        
        # Verifica che il contratto esista
        contratto = await database.fetch_one("SELECT id FROM contratti WHERE id = :id", {"id": contratto_id})
        if not contratto:
            raise HTTPException(status_code=404, detail="Contratto non trovato")
        
        # Aggiorna il cliente_id
        await database.execute(
            "UPDATE contratti SET cliente_id = :cliente_id, updated_at = :updated_at WHERE id = :id",
            {
                "cliente_id": cliente_id,
                "id": contratto_id,
                "updated_at": datetime.now()
            }
        )
        
        return {"status": "linked", "contratto_id": contratto_id, "cliente_id": cliente_id}
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nel collegamento contratto: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nel collegamento del contratto: {str(e)}")

@app.delete("/api/contratti/{contratto_id}", response_model=Dict[str, Any])
async def delete_contratto(
    contratto_id: str,
    current_user: Dict[str, Any] = Depends(check_contratti_delete)
):
    """Elimina un contratto"""
    try:
        # Verifica che il contratto esista
        existing = await database.fetch_one(
            "SELECT id, numero FROM contratti WHERE id = :id",
            {"id": contratto_id}
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Contratto non trovato")
        
        # NOTA: La logica di eliminazione dei pagamenti associati sarà gestita dal Pagamenti Service
        # Per ora eliminiamo solo il contratto
        
        # Elimina il contratto
        delete_query = "DELETE FROM contratti WHERE id = :id"
        await database.execute(delete_query, {"id": contratto_id})
        
        return {
            "status": "success",
            "message": "Contratto eliminato con successo",
            "deleted_id": contratto_id,
            "numero": existing["numero"]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nell'eliminazione contratto: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nell'eliminazione del contratto: {str(e)}")


# Avvio del server
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT"))
    if not port:
        raise ValueError("PORT environment variable is required")
    uvicorn.run(app, host="0.0.0.0", port=CONTRATTI_SERVICE_PORT)

