"""
Gradimento Service - Microservizio per gestione gradimento settimanale
"""

from fastapi import FastAPI, HTTPException, status, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import os
import json
import uuid
from pathlib import Path
from datetime import datetime
from jose import JWTError, jwt
from contextlib import asynccontextmanager

from database import database, init_database, close_database
from models import GradimentoRisposte, GradimentoSettimanale

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
        "gradimento:read": True,
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler per startup e shutdown"""
    print("🚀 Avvio Gradimento Service...")
    await init_database()
    print("✅ Gradimento Service avviato")
    yield
    print("⏹️ Spegnimento Gradimento Service...")
    await close_database()
    print("✅ Gradimento Service fermato")


app = FastAPI(
    title="Gradimento Service",
    description="Microservizio per gestione gradimento settimanale",
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
    return {"status": "healthy", "service": "gradimento-service"}


@app.post("/api/gradimento", response_model=GradimentoSettimanale)
async def salva_gradimento(
    gradimento: GradimentoRisposte,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Salva le risposte del form di gradimento settimanale
    Richiede solo autenticazione (login)
    L'anagrafica viene precompilata dal profilo utente
    """
    try:
        user_id = current_user.get("id")
        if not user_id:
            raise HTTPException(status_code=401, detail="Utente non autenticato")
        
        # Genera ID univoco
        gradimento_id = str(uuid.uuid4())
        now = datetime.now()
        
        # Salva nel database con user_id
        query = """
        INSERT INTO gradimento_settimanale (id, data_compilazione, risposte, user_id, created_at, updated_at)
        VALUES (:id, :data_compilazione, :risposte, :user_id, :created_at, :updated_at)
        """
        
        await database.execute(query, {
            "id": gradimento_id,
            "data_compilazione": now,
            "risposte": json.dumps(gradimento.model_dump()),
            "user_id": user_id,
            "created_at": now,
            "updated_at": now
        })
        
        print(f"✅ Gradimento salvato con ID: {gradimento_id} da utente {user_id}")
        
        return GradimentoSettimanale(
            id=gradimento_id,
            data_compilazione=now.isoformat(),
            risposte=gradimento,
            created_at=now.isoformat(),
            updated_at=now.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore salvataggio gradimento: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Errore server: {str(e)}")


@app.get("/api/gradimento", response_model=List[GradimentoSettimanale])
async def get_gradimenti(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Recupera i gradimenti settimanali
    - Se l'utente ha permesso 'gradimento:read', recupera tutti i gradimenti (admin)
    - Altrimenti, recupera solo i gradimenti dell'utente corrente
    """
    try:
        user_id = current_user.get("id")
        user_role = current_user.get("role")
        
        # Verifica se l'utente ha il permesso gradimento:read
        has_read_permission = False
        try:
            perms = await load_user_permissions(current_user)
            has_read_permission = perms.get("gradimento:read", False) or user_role in ("admin", "superadmin")
        except Exception:
            # Se fallisce il caricamento permessi, controlla solo il ruolo
            has_read_permission = user_role in ("admin", "superadmin")
        
        # Se ha il permesso di lettura, mostra tutti i gradimenti
        if has_read_permission:
            query = "SELECT * FROM gradimento_settimanale ORDER BY created_at DESC"
            results = await database.fetch_all(query)
        else:
            # Altrimenti, mostra solo i gradimenti dell'utente corrente
            query = "SELECT * FROM gradimento_settimanale WHERE user_id = :user_id ORDER BY created_at DESC"
            results = await database.fetch_all(query, {"user_id": user_id})
        
        gradimenti = []
        for row in results:
            risposte_dict = json.loads(row["risposte"])
            gradimenti.append(GradimentoSettimanale(
                id=row["id"],
                data_compilazione=row["data_compilazione"].isoformat(),
                risposte=GradimentoRisposte(**risposte_dict),
                created_at=row["created_at"].isoformat(),
                updated_at=row["updated_at"].isoformat()
            ))
        
        return gradimenti
        
    except Exception as e:
        print(f"❌ Errore recupero gradimenti: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Errore server: {str(e)}")


@app.get("/api/gradimento/{gradimento_id}", response_model=GradimentoSettimanale)
async def get_gradimento(
    gradimento_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Recupera un gradimento specifico
    - Se l'utente ha permesso 'gradimento:read', può vedere qualsiasi gradimento (admin)
    - Altrimenti, può vedere solo i propri gradimenti
    """
    try:
        user_id = current_user.get("id")
        user_role = current_user.get("role")
        
        query = "SELECT * FROM gradimento_settimanale WHERE id = :id"
        result = await database.fetch_one(query, {"id": gradimento_id})
        
        if not result:
            raise HTTPException(status_code=404, detail="Gradimento non trovato")
        
        # Verifica se l'utente ha il permesso gradimento:read
        has_read_permission = False
        try:
            perms = await load_user_permissions(current_user)
            has_read_permission = perms.get("gradimento:read", False) or user_role in ("admin", "superadmin")
        except Exception:
            has_read_permission = user_role in ("admin", "superadmin")
        
        # Se non ha il permesso di lettura, verifica che il gradimento appartenga all'utente
        if not has_read_permission:
            if result["user_id"] != user_id:
                raise HTTPException(status_code=403, detail="Non hai il permesso per vedere questo gradimento")
        
        risposte_dict = json.loads(result["risposte"])
        return GradimentoSettimanale(
            id=result["id"],
            data_compilazione=result["data_compilazione"].isoformat(),
            risposte=GradimentoRisposte(**risposte_dict),
            created_at=result["created_at"].isoformat(),
            updated_at=result["updated_at"].isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore recupero gradimento {gradimento_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Errore server: {str(e)}")


# Avvio del server
if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT"))
    if not port:
        raise ValueError("PORT environment variable is required")
    uvicorn.run(app, host="0.0.0.0", port=GRADIMENTO_SERVICE_PORT)

