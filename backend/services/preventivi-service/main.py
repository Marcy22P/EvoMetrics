"""
Preventivi Service - Microservizio per gestione preventivi
"""

from fastapi import FastAPI, HTTPException, status, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import os
import json
from pathlib import Path
from datetime import datetime
from jose import JWTError, jwt
from contextlib import asynccontextmanager

from database import database, init_database, close_database
from models import PreventivoData, PreventivoResponse
from serializers import serialize_preventivo

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

# Default permissions per ruolo (stesso schema di User Service)
DEFAULT_PERMISSIONS_BY_ROLE: Dict[str, Any] = {
    "superadmin": {"__all__": True},
    "admin": {
        "preventivi:read": True,
        "preventivi:write": True,
        "preventivi:delete": True,
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


def calculate_totals(servizi: List[Dict[str, Any]]) -> Dict[str, float]:
    """Calcola subtotale, IVA e totale dai servizi"""
    subtotale = sum(s.get("prezzo", 0) * s.get("quantita", 1) for s in servizi)
    iva = round(subtotale * 0.22, 2)
    totale = round(subtotale + iva, 2)
    return {"subtotale": subtotale, "iva": iva, "totale": totale}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler per startup e shutdown"""
    print("🚀 Avvio Preventivi Service...")
    await init_database()
    print("✅ Preventivi Service avviato")
    yield
    print("⏹️ Spegnimento Preventivi Service...")
    await close_database()
    print("✅ Preventivi Service fermato")


app = FastAPI(
    title="Preventivi Service",
    description="Microservizio per gestione preventivi",
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
    return {"status": "healthy", "service": "preventivi-service"}


# Dependency per verificare permesso preventivi:read
async def check_preventivi_read(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("preventivi:read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: preventivi:read"
        )
    return current_user

# Dependency per verificare permesso preventivi:write
async def check_preventivi_write(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("preventivi:write"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: preventivi:write"
        )
    return current_user

# Dependency per verificare permesso preventivi:delete
async def check_preventivi_delete(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("preventivi:delete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: preventivi:delete"
        )
    return current_user


@app.get("/api/preventivi")
async def get_preventivi(
    current_user: Dict[str, Any] = Depends(check_preventivi_read)
):
    """Ottieni tutti i preventivi dal database"""
    try:
        query = "SELECT * FROM preventivi ORDER BY created_at DESC"
        rows = await database.fetch_all(query)
        
        preventivi = []
        for row in rows:
            try:
                preventivo_dict = serialize_preventivo(dict(row))
                preventivi.append(preventivo_dict)
            except Exception as row_error:
                print(f"❌ Errore processando riga preventivo: {row_error}")
                continue
        
        return {"preventivi": preventivi, "status": "success"}
    except Exception as e:
        print(f"❌ Errore nel caricamento preventivi: {e}")
        raise HTTPException(status_code=500, detail=f"Errore nel caricamento dei preventivi: {str(e)}")


@app.post("/api/preventivi")
async def create_preventivo(
    preventivo_data: PreventivoData,
    current_user: Dict[str, Any] = Depends(check_preventivi_write)
):
    """Crea un nuovo preventivo nel database"""
    try:
        # Genera ID univoco
        new_id = f"prev_{int(datetime.now().timestamp() * 1000)}"
        now = datetime.now()
        
        # Calcola totali se non forniti
        servizi_dict = [s.model_dump() for s in preventivo_data.servizi]
        totals = calculate_totals(servizi_dict)
        
        subtotale = preventivo_data.subtotale or totals["subtotale"]
        iva = preventivo_data.iva or totals["iva"]
        totale = preventivo_data.totale or totals["totale"]
        
        # Prepara tutti i dati del preventivo in un unico oggetto JSON
        preventivo_json_data = {
            "cliente": preventivo_data.cliente,
            "oggetto": preventivo_data.oggetto,
            "servizi": servizi_dict,
            "totale": totale,
            "subtotale": subtotale,
            "iva": iva,
            "note": preventivo_data.note,
            "numero": preventivo_data.numero or f"PREV-{int(now.timestamp())}",
            "data": preventivo_data.data or now.strftime('%Y-%m-%d'),
            "validita": preventivo_data.validita,
            "tipologiaIntervento": preventivo_data.tipologiaIntervento,
            "tipologiaInterventoEcommerce": preventivo_data.tipologiaInterventoEcommerce,
            "tipologiaInterventoMarketing": preventivo_data.tipologiaInterventoMarketing,
            "tipologiaInterventoVideoPost": preventivo_data.tipologiaInterventoVideoPost,
            "tipologiaInterventoMetaAds": preventivo_data.tipologiaInterventoMetaAds,
            "tipologiaInterventoGoogleAds": preventivo_data.tipologiaInterventoGoogleAds,
            "tipologiaInterventoSeo": preventivo_data.tipologiaInterventoSeo,
            "tipologiaInterventoEmailMarketing": preventivo_data.tipologiaInterventoEmailMarketing,
            "terminiPagamento": preventivo_data.terminiPagamento,
            "terminiCondizioni": preventivo_data.terminiCondizioni,
            "created_by": current_user.get("username", "system")
        }
        
        # Prepara il client_info JSON
        client_info_data = {
            "name": preventivo_data.cliente,
            "contact_method": "manual_entry",
            "creation_source": "admin_interface"
        }
        
        # Inserisci nel database con colonne strutturate
        query = """
        INSERT INTO preventivi (
            id, data, status, created_at, updated_at, source, client_info, 
            numero_preventivo, cliente_nome, totale, imponibile, iva_amount
        )
        VALUES (
            :id, :data, :status, :created_at, :updated_at, :source, :client_info, 
            :numero_preventivo, :cliente_nome, :totale, :imponibile, :iva_amount
        )
        """
        
        await database.execute(query, {
            "id": new_id,
            "data": json.dumps(preventivo_json_data),
            "status": "created",
            "created_at": now,
            "updated_at": now,
            "source": "manual_admin",
            "client_info": json.dumps(client_info_data),
            "numero_preventivo": str(preventivo_json_data.get('numero', '')),
            "cliente_nome": str(preventivo_data.cliente),
            "totale": float(totale),
            "imponibile": float(subtotale) if subtotale else 0.0,
            "iva_amount": float(iva) if iva else 0.0
        })
        
        # Recupera il preventivo creato
        created_row = await database.fetch_one(
            "SELECT * FROM preventivi WHERE id = :id",
            {"id": new_id}
        )
        
        nuovo_preventivo = serialize_preventivo(dict(created_row))
        
        return {
            "preventivo": nuovo_preventivo,
            "status": "success",
            "message": f"Preventivo {new_id} salvato con successo"
        }
        
    except Exception as e:
        print(f"❌ Errore nella creazione preventivo: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Errore nella creazione del preventivo: {str(e)}")


@app.put("/api/preventivi/{preventivo_id}")
async def update_preventivo(
    preventivo_id: str,
    preventivo_data: dict,
    current_user: Dict[str, Any] = Depends(check_preventivi_write)
):
    """Aggiorna un preventivo esistente nel database"""
    try:
        # Verifica che il preventivo esista
        existing = await database.fetch_one(
            "SELECT id, data FROM preventivi WHERE id = :id",
            {"id": preventivo_id}
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Preventivo non trovato")
        
        now = datetime.now()
        
        # Estrazione valori per colonne dedicate
        numero_prev = preventivo_data.get('numero')
        nome_cli = preventivo_data.get('cliente')
        
        # Helper per conversione float sicura
        def parse_float(val):
            if val is None: return 0.0
            if isinstance(val, (int, float)): return float(val)
            if isinstance(val, str):
                try:
                    return float(val.replace('€', '').replace('.', '').replace(',', '.').strip())
                except:
                    return 0.0
            return 0.0

        valore_totale = parse_float(preventivo_data.get('totale'))
        valore_imponibile = parse_float(preventivo_data.get('subtotale'))
        valore_iva = parse_float(preventivo_data.get('iva'))

        # Aggiorna sia il campo JSON data che le nuove colonne strutturate
        update_query = """
        UPDATE preventivi 
        SET data = :data,
            updated_at = :updated_at,
            status = 'active',
            numero_preventivo = :numero_preventivo,
            cliente_nome = :cliente_nome,
            totale = :totale,
            imponibile = :imponibile,
            iva_amount = :iva_amount
        WHERE id = :id
        """
        
        await database.execute(update_query, {
            "id": preventivo_id,
            "data": json.dumps(preventivo_data),
            "updated_at": now,
            "numero_preventivo": numero_prev,
            "cliente_nome": nome_cli,
            "totale": valore_totale,
            "imponibile": valore_imponibile,
            "iva_amount": valore_iva
        })
        
        # Recupera il preventivo aggiornato
        updated_row = await database.fetch_one(
            "SELECT * FROM preventivi WHERE id = :id",
            {"id": preventivo_id}
        )
        
        preventivo_aggiornato = serialize_preventivo(dict(updated_row))
        
        return {
            "preventivo": preventivo_aggiornato,
            "status": "success",
            "message": f"Preventivo {preventivo_aggiornato.get('numero', preventivo_id)} aggiornato con successo"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nell'aggiornamento preventivo: {e}")
        raise HTTPException(status_code=500, detail="Errore nell'aggiornamento del preventivo")


@app.delete("/api/preventivi/{preventivo_id}")
async def delete_preventivo(
    preventivo_id: str,
    current_user: Dict[str, Any] = Depends(check_preventivi_delete)
):
    """Elimina un preventivo dal database"""
    try:
        # Verifica che il preventivo esista
        existing = await database.fetch_one(
            "SELECT id, data FROM preventivi WHERE id = :id",
            {"id": preventivo_id}
        )
        
        if not existing:
            raise HTTPException(status_code=404, detail="Preventivo non trovato")
        
        # Estrai il nome cliente dal campo data JSON per il messaggio
        cliente_nome = "Sconosciuto"
        try:
            if existing['data']:
                data_json = json.loads(existing['data']) if isinstance(existing['data'], str) else existing['data']
                cliente_nome = data_json.get('cliente', 'Sconosciuto')
        except:
            pass
        
        # Elimina il preventivo
        await database.execute(
            "DELETE FROM preventivi WHERE id = :id",
            {"id": preventivo_id}
        )
        
        return {
            "status": "success",
            "message": f"Preventivo {preventivo_id} eliminato con successo",
            "deleted_id": preventivo_id,
            "cliente": cliente_nome
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore nell'eliminazione preventivo: {e}")
        raise HTTPException(status_code=500, detail="Errore nell'eliminazione del preventivo")


# Avvio del server
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT"))
    if not port:
        raise ValueError("PORT environment variable is required")
    uvicorn.run(app, host="0.0.0.0", port=PREVENTIVI_SERVICE_PORT)

