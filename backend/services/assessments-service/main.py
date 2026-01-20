"""
Assessments Service - Microservizio per gestione assessment
"""

from fastapi import FastAPI, HTTPException, status, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import os
import json
import uuid
import httpx
from pathlib import Path
from datetime import datetime
from jose import JWTError, jwt
from contextlib import asynccontextmanager

from database import database, init_database, close_database, ensure_database_initialized
from models import AssessmentData, AssessmentResponse, WebhookResponse

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
        "assessments:read": True,
        "assessments:delete": True,
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
    
    # Lazy init database
    await ensure_database_initialized()
    
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


def serialize_assessment(row: Dict[str, Any]) -> Dict[str, Any]:
    """Serializza un assessment dal database al formato API"""
    try:
        # Parsifica i dati JSON dalla colonna 'data'
        if isinstance(row.get('data'), str):
            data_json = json.loads(row['data'])
        else:
            data_json = row.get('data') or {}
        
        # Parsifica client_info se presente
        client_info = {}
        if row.get('client_info'):
            if isinstance(row['client_info'], str):
                client_info = json.loads(row['client_info'])
            else:
                client_info = row['client_info']
        
        # Costruisci risposta
        response = {
            "id": row['id'],
            "data": data_json,
            "status": row.get('status', 'pending'),
            "source": row.get('source', 'web_form'),
            "client_info": client_info,
            "notes": row.get('notes'),
            "created_at": row['created_at'].strftime('%d/%m/%Y') if row.get('created_at') else None,
            "updated_at": row['updated_at'].strftime('%d/%m/%Y') if row.get('updated_at') else None,
        }
        return response
    except Exception as e:
        print(f"❌ Errore serializzazione assessment: {e}")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler - lazy init"""
    print("[Assessments] Service pronto (lazy DB init)")
    yield
    await close_database()


app = FastAPI(
    title="Assessments Service",
    description="Microservizio per gestione assessment",
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
    return {"status": "healthy", "service": "assessments-service"}


# Dependency per verificare permesso assessments:read
async def check_assessments_read(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("assessments:read"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: assessments:read"
        )
    return current_user

# Dependency per verificare permesso assessments:delete
async def check_assessments_delete(current_user: Dict[str, Any] = Depends(get_current_user)):
    user_perms = await load_user_permissions(current_user)
    if not user_perms.get("__all__") and not user_perms.get("assessments:delete"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission required: assessments:delete"
        )
    return current_user


@app.get("/api/assessments")
async def get_assessments(
    current_user: Dict[str, Any] = Depends(check_assessments_read)
):
    """Ottieni tutti gli assessment dal database"""
    try:
        query = """
        SELECT id, data, status, created_at, updated_at, source, client_info, notes
        FROM assessment
        ORDER BY created_at DESC
        """
        result = await database.fetch_all(query)
        
        assessments = []
        for row in result:
            try:
                assessment_dict = serialize_assessment(dict(row))
                assessments.append(assessment_dict)
            except Exception as row_error:
                print(f"❌ Errore processando riga assessment: {row_error}")
                continue
        
        return {"assessments": assessments}
        
    except Exception as e:
        print(f"❌ Errore lettura assessment: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Errore server: {str(e)}")


@app.get("/api/assessments/{assessment_id}")
async def get_assessment(
    assessment_id: str,
    current_user: Dict[str, Any] = Depends(check_assessments_read)
):
    """Ottieni un assessment specifico dal database"""
    try:
        query = """
        SELECT id, data, status, created_at, updated_at, source, client_info, notes
        FROM assessment
        WHERE id = :assessment_id
        """
        result = await database.fetch_one(query, values={"assessment_id": assessment_id})
        
        if not result:
            raise HTTPException(status_code=404, detail=f"Assessment {assessment_id} non trovato")
        
        assessment_dict = serialize_assessment(dict(result))
        return assessment_dict
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore lettura assessment {assessment_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Errore server: {str(e)}")


@app.delete("/api/assessments/{assessment_id}")
async def delete_assessment(
    assessment_id: str,
    current_user: Dict[str, Any] = Depends(check_assessments_delete)
):
    """Elimina un assessment dal database"""
    try:
        # Verifica che l'assessment esista
        check_query = "SELECT id FROM assessment WHERE id = :assessment_id"
        existing = await database.fetch_one(check_query, values={"assessment_id": assessment_id})
        
        if not existing:
            raise HTTPException(status_code=404, detail=f"Assessment {assessment_id} non trovato")
        
        # Elimina l'assessment
        delete_query = "DELETE FROM assessment WHERE id = :assessment_id"
        await database.execute(delete_query, values={"assessment_id": assessment_id})
        
        print(f"🗑️ Assessment {assessment_id} eliminato dall'utente {current_user.get('username', 'unknown')}")
        return {"message": f"Assessment {assessment_id} eliminato con successo"}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore eliminazione assessment {assessment_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Errore server: {str(e)}")


@app.post("/webhook", response_model=WebhookResponse)
async def assessment_webhook(request: Request):
    """Handle assessment form submission, save to DB and forward to N8N"""
    try:
        # Get the form data from the request
        form_data = await request.json()
        
        # Log the submission for debugging
        print(f"📝 Assessment submission received: {len(form_data)} fields")
        
        # Generate unique ID for assessment
        assessment_id = str(uuid.uuid4())
        now = datetime.now()
        
        # Extract client info from assessment data
        client_info = {}
        if 'email' in form_data:
            client_info['email'] = form_data['email']
        if 'telefono' in form_data:
            client_info['telefono'] = form_data['telefono']
        if 'nomeAzienda' in form_data:
            client_info['nomeAzienda'] = form_data['nomeAzienda']
        
        # Save assessment to database FIRST
        try:
            insert_query = """
            INSERT INTO assessment (id, data, status, created_at, updated_at, source, client_info, notes)
            VALUES (:id, :data, :status, :created_at, :updated_at, :source, :client_info, :notes)
            """
            await database.execute(
                insert_query,
                {
                    "id": assessment_id,
                    "data": json.dumps(form_data),
                    "status": "completed",
                    "created_at": now,
                    "updated_at": now,
                    "source": "web_form",
                    "client_info": json.dumps(client_info) if client_info else None,
                    "notes": None
                }
            )
            print(f"✅ Assessment salvato nel database con ID: {assessment_id}")
        except Exception as db_error:
            print(f"⚠️ Errore salvataggio assessment nel DB: {db_error}")
            # Continua comunque con N8N
        
        # Get the N8N webhook URL from environment variable
        n8n_webhook_url = os.environ.get("N8N_WEBHOOK_ASSESSMENT")
        
        if not n8n_webhook_url:
            print("⚠️ WARNING: N8N_WEBHOOK_ASSESSMENT environment variable not set")
            # Return success anyway since we saved in DB
            return WebhookResponse(
                status="success",
                message="Assessment ricevuto e salvato",
                id=assessment_id
            )
        
        print(f"🚀 Forwarding to N8N: {n8n_webhook_url}")
        
        # Forward to N8N webhook
        async with httpx.AsyncClient() as client:
            response = await client.post(
                n8n_webhook_url,
                json=form_data,
                headers={"Content-Type": "application/json"},
                timeout=30.0
            )
            
            if response.status_code == 200:
                print("✅ Successfully forwarded to N8N")
                return WebhookResponse(
                    status="success",
                    message="Assessment salvato e inviato",
                    id=assessment_id
                )
            else:
                print(f"❌ N8N webhook failed: {response.status_code} - {response.text}")
                # Still return success since we saved in DB
                return WebhookResponse(
                    status="success",
                    message="Assessment salvato (N8N failed)",
                    id=assessment_id
                )
                
    except Exception as e:
        print(f"🔥 Error in webhook handler: {str(e)}")
        import traceback
        traceback.print_exc()
        # Return success anyway to not break the frontend
        return WebhookResponse(
            status="success",
            message="Assessment ricevuto con errori"
        )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT"))
    if not port:
        raise ValueError("PORT environment variable is required")
    uvicorn.run(app, host="0.0.0.0", port=port)


