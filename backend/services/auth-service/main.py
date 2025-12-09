"""
Auth Service - Microservizio per autenticazione e autorizzazione
Gestisce login, OAuth Google, validazione token JWT
"""

from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional
import os
import httpx
import json
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import databases
from pathlib import Path

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

# Import moduli locali
from database import database, init_database, close_database
from auth import verify_password, get_password_hash, create_access_token
from models import UserLogin, UserResponse, Token, PublicUserRegistration

# Configurazione FastAPI
app = FastAPI(
    title="Auth Service",
    description="Microservizio per autenticazione e autorizzazione",
    version="1.0.0"
)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security configuration
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
if not GOOGLE_CLIENT_ID:
    raise ValueError("GOOGLE_CLIENT_ID environment variable is required")

GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
if not GOOGLE_CLIENT_SECRET:
    raise ValueError("GOOGLE_CLIENT_SECRET environment variable is required")

GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI")
if not GOOGLE_REDIRECT_URI:
    raise ValueError("GOOGLE_REDIRECT_URI environment variable is required")

BASE_URL = os.environ.get("BASE_URL")
if not BASE_URL:
    raise ValueError("BASE_URL environment variable is required")

# Port gestita da Render tramite PORT env var

FRONTEND_URL = os.environ.get("FRONTEND_URL")
if not FRONTEND_URL:
    raise ValueError("FRONTEND_URL environment variable is required")

# Email Service URL (opzionale, usato solo se non in modalità unificata)
EMAIL_SERVICE_URL = os.environ.get("EMAIL_SERVICE_URL")
SERVICE_TOKEN = os.environ.get("SERVICE_TOKEN")

# Password hashing
try:
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except Exception as e:
    print(f"⚠️  Errore inizializzazione bcrypt: {e}")
    import passlib.hash
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__ident="2b")

# Default permissions per ruolo
DEFAULT_PERMISSIONS_BY_ROLE = {
    "user": {
        "gradimento:write": True,
        "dashboard:read": False,
        "preventivi:read": False,
        "preventivi:write": False,
        "preventivi:delete": False,
        "contratti:read": False,
        "contratti:write": False,
        "contratti:delete": False,
        "pagamenti:read": False,
        "pagamenti:write": False,
        "clienti:read": False,
        "clienti:create": False,
        "clienti:update": False,
        "clienti:delete": False,
    }
}

# Eventi startup/shutdown
@app.on_event("startup")
async def startup_event():
    """Evento di startup"""
    print("🚀 Avvio Auth Service...")
    await init_database()
    print("✅ Auth Service avviato")

@app.on_event("shutdown")
async def shutdown_event():
    """Evento di shutdown"""
    print("⏹️ Spegnimento Auth Service...")
    await close_database()
    print("✅ Auth Service fermato")

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "auth-service"}


async def send_pending_approval_email_via_service(user_email: str, user_name: str, is_google_user: bool = False):
    """Invia email di attesa approvazione tramite email-service (usa internal_calls)"""
    try:
        import sys
        from pathlib import Path
        shared_path = Path(__file__).parent.parent.parent / "shared"
        sys.path.insert(0, str(shared_path))
        from internal_calls import send_pending_approval_email_internal
        
        success = await send_pending_approval_email_internal(user_email, user_name, is_google_user)
        if success:
            print(f"✅ Email di pending approval inviata a {user_email}")
        else:
            print(f"⚠️ Errore invio email di pending approval")
    except Exception as e:
        # Non bloccare la registrazione se l'email fallisce
        print(f"⚠️ Errore invio email: {e}")

# Authentication endpoints
@app.post("/api/auth/login", response_model=Token)
async def login(user_data: UserLogin):
    """Login utente con username/password"""
    
    query = """
        SELECT id, username, password_hash, role, is_active, nome, cognome, email, 
               google_email, profile_completed, created_at 
        FROM users 
        WHERE username = :username AND is_active = true
    """
    user = await database.fetch_one(query, values={"username": user_data.username})
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user_dict = dict(user)
    
    if not user_dict.get("password_hash"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Questo account può accedere solo tramite Google. Usa il pulsante 'Accedi con Google'.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not verify_password(user_data.password, user_dict["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token = create_access_token(data={"sub": user_dict["username"]})
    now = datetime.now()
    
    profile_completed_value = user_dict.get("profile_completed")
    if profile_completed_value is None:
        profile_completed_value = False
    else:
        profile_completed_value = bool(profile_completed_value)
    
    user_response = UserResponse(
        id=user_dict["id"],
        username=user_dict["username"],
        role=user_dict["role"],
        is_active=user_dict["is_active"],
        created_at=user_dict["created_at"].isoformat() if isinstance(user_dict["created_at"], datetime) else user_dict["created_at"],
        nome=user_dict.get("nome"),
        cognome=user_dict.get("cognome"),
        email=user_dict.get("email") or user_dict.get("google_email"),
        profile_completed=profile_completed_value
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        user=user_response,
        createdAt=now.isoformat(),
        updatedAt=now.isoformat(),
        source="database_login"
    )


@app.post("/api/auth/register-public")
async def register_public_user(user_data: PublicUserRegistration):
    """
    Endpoint pubblico per registrazione utenti (senza autenticazione)
    Crea un utente in attesa di approvazione admin (pending_approval=True, is_active=False)
    """
    # Validazione base
    if not user_data.username or not user_data.password or not user_data.email:
        raise HTTPException(status_code=400, detail="Username, password ed email sono obbligatori")
    
    if not user_data.nome or not user_data.cognome:
        raise HTTPException(status_code=400, detail="Nome e cognome sono obbligatori")
    
    # Verifica se username esiste già
    existing_username = await database.fetch_one(
        "SELECT id FROM users WHERE username = :username",
        {"username": user_data.username}
    )
    if existing_username:
        raise HTTPException(status_code=400, detail="Username già registrato")
    
    # Verifica se email esiste già
    existing_email = await database.fetch_one(
        "SELECT id FROM users WHERE email = :email OR google_email = :email",
        {"email": user_data.email}
    )
    if existing_email:
        raise HTTPException(status_code=400, detail="Email già registrata")
    
    # Hash password
    password_hash = get_password_hash(user_data.password)
    
    # Crea nuovo utente con pending_approval=True, is_active=False
    # Se nome, cognome ed email sono già presenti, impostiamo profile_completed=True
    # perché l'utente ha già fornito tutti i dati necessari durante la registrazione
    now = datetime.now()
    new_user = await database.fetch_one(
        """INSERT INTO users (username, password_hash, email, nome, cognome, role, is_active, 
           pending_approval, profile_completed, created_at, updated_at)
           VALUES (:username, :password_hash, :email, :nome, :cognome, 'user', false, true, true, :now, :now)
           RETURNING id, username, email, nome, cognome, role, is_active, pending_approval, profile_completed, created_at""",
        {
            "username": user_data.username,
            "password_hash": password_hash,
            "email": user_data.email,
            "nome": user_data.nome,
            "cognome": user_data.cognome,
            "now": now
        }
    )
    
    # Crea permessi di default
    default_perms = DEFAULT_PERMISSIONS_BY_ROLE.get("user", {})
    perms_json = json.dumps(default_perms)
    await database.execute(
        "INSERT INTO user_permissions (user_id, permissions, created_at, updated_at) VALUES (:uid, :perms, :now, :now)",
        {"uid": new_user["id"], "perms": perms_json, "now": now}
    )
    
    # Invia email di attesa approvazione (opzionale, non blocca se fallisce)
    try:
        user_email = user_data.email
        user_name = f"{user_data.nome} {user_data.cognome}".strip() if user_data.nome or user_data.cognome else user_data.username
        await send_pending_approval_email_via_service(user_email, user_name, is_google_user=False)
    except Exception as e:
        # Non bloccare la registrazione se l'email fallisce
        print(f"⚠️ Errore invio email: {e}")
    
    return {
        "status": "ok",
        "message": "Registrazione completata. La tua richiesta è in attesa di approvazione.",
        "user_id": new_user["id"],
        "pending_approval": True
    }


@app.get("/api/auth/google")
async def google_oauth_start(request: Request):
    """Inizia il flusso OAuth Google"""
    from urllib.parse import urlencode
    
    redirect_uri = GOOGLE_REDIRECT_URI
    
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "consent"
    }
    
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url=auth_url)

@app.get("/api/auth/google/callback")
async def google_oauth_callback(request: Request, code: Optional[str] = None, error: Optional[str] = None):
    """Callback OAuth Google"""
    frontend_base_url = FRONTEND_URL
    redirect_uri = GOOGLE_REDIRECT_URI
    
    if error:
        frontend_url = f"{frontend_base_url}/login?error=oauth_cancelled"
        return RedirectResponse(url=frontend_url)
    
    if not code:
        raise HTTPException(status_code=400, detail="Authorization code missing")
    
    try:
        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"
        }
        
        timeout = httpx.Timeout(30.0, connect=10.0)
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                token_response = await client.post(token_url, data=token_data)
                token_response.raise_for_status()
                tokens = token_response.json()
            except httpx.TimeoutException:
                raise HTTPException(status_code=504, detail="Timeout nella richiesta a Google OAuth")
            except httpx.RequestError as e:
                raise HTTPException(status_code=502, detail=f"Errore di connessione con Google OAuth: {str(e)}")
            
            access_token = tokens.get("access_token")
            if not access_token:
                raise HTTPException(status_code=400, detail="Failed to obtain access token")
            
            userinfo_url = "https://www.googleapis.com/oauth2/v2/userinfo"
            try:
                user_response = await client.get(
                    userinfo_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                    timeout=timeout
                )
                user_response.raise_for_status()
                google_user = user_response.json()
            except httpx.TimeoutException:
                raise HTTPException(status_code=504, detail="Timeout nel recupero dei dati utente da Google")
            except httpx.RequestError as e:
                raise HTTPException(status_code=502, detail=f"Errore di connessione nel recupero dati utente: {str(e)}")
            
            google_id = google_user.get("id")
            google_email = google_user.get("email")
            google_name = google_user.get("name", google_email.split("@")[0])
            
            if not google_id or not google_email:
                raise HTTPException(status_code=400, detail="Invalid user data from Google")
            
            existing_user = await database.fetch_one(
                "SELECT * FROM users WHERE google_id = :gid",
                {"gid": google_id}
            )
            
            if existing_user:
                user_dict = dict(existing_user)
                
                if not user_dict.get("is_active"):
                    if user_dict.get("pending_approval"):
                        frontend_url = f"{frontend_base_url}/login?error=pending_approval"
                    else:
                        frontend_url = f"{frontend_base_url}/login?error=account_disabled"
                    return RedirectResponse(url=frontend_url)
                
                now = datetime.now()
                if not user_dict.get("google_id") or user_dict.get("google_id") != google_id:
                    await database.execute(
                        "UPDATE users SET google_id = :gid, google_email = :email, updated_at = :now WHERE id = :id",
                        {"gid": google_id, "email": google_email, "now": now, "id": user_dict["id"]}
                    )
                    updated_user = await database.fetch_one(
                        "SELECT * FROM users WHERE id = :id",
                        {"id": user_dict["id"]}
                    )
                    if updated_user:
                        user_dict = dict(updated_user)
                
                username_for_token = user_dict.get("username")
                if not username_for_token:
                    raise HTTPException(status_code=500, detail="Username mancante per utente")
                
                jwt_token = create_access_token(data={"sub": username_for_token})
                frontend_url = f"{frontend_base_url}/login?token={jwt_token}"
                return RedirectResponse(url=frontend_url)
            
            else:
                base_username = google_email.split("@")[0]
                username = base_username
                counter = 1
                
                while True:
                    existing = await database.fetch_one(
                        "SELECT id FROM users WHERE username = :uname",
                        {"uname": username}
                    )
                    if not existing:
                        break
                    username = f"{base_username}{counter}"
                    counter += 1
                
                now = datetime.now()
                new_user = await database.fetch_one(
                    """INSERT INTO users (username, password_hash, role, is_active, google_id, google_email, 
                       nome, pending_approval, created_at, updated_at)
                       VALUES (:uname, NULL, 'user', false, :gid, :email, :nome, true, :now, :now)
                       RETURNING id, username, role, is_active, google_id, google_email, pending_approval, created_at""",
                    {
                        "uname": username,
                        "gid": google_id,
                        "email": google_email,
                        "nome": google_name,
                        "now": now
                    }
                )
                
                default_perms = DEFAULT_PERMISSIONS_BY_ROLE.get("user", {})
                perms_json = json.dumps(default_perms)
                await database.execute(
                    """INSERT INTO user_permissions (user_id, permissions, created_at, updated_at)
                       VALUES (:uid, :perms, :now, :now)""",
                    {"uid": new_user["id"], "perms": perms_json, "now": now}
                )
                
                frontend_url = f"{frontend_base_url}/login?error=pending_approval"
                return RedirectResponse(url=frontend_url)
                
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Errore OAuth callback: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Errore interno: {str(e)}")

@app.get("/api/auth/validate-token")
async def validate_token(request: Request):
    """Valida un token JWT e restituisce info utente"""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ")[1]
    else:
        token = request.query_params.get("token")
        if not token:
            raise HTTPException(status_code=401, detail="Missing token")
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    query = """
        SELECT id, username, role, is_active, nome, cognome, email, google_email, 
               profile_completed, created_at, updated_at 
        FROM users 
        WHERE username = :username AND is_active = true
    """
    user = await database.fetch_one(query, values={"username": username})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    
    user_dict = dict(user)
    return {
        "user_id": user_dict["id"],
        "username": user_dict["username"],
        "role": user_dict["role"],
        "is_active": user_dict["is_active"],
        "auth_type": "database"
    }

@app.get("/api/auth/me", response_model=UserResponse)
async def get_current_user_info(request: Request):
    """Ottieni informazioni utente corrente dal token"""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    
    token = auth_header.split(" ")[1]
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user_data = await database.fetch_one(
        """SELECT id, username, role, is_active, nome, cognome, email, google_email, 
           profile_completed, created_at 
           FROM users 
           WHERE username = :username AND is_active = true""",
        {"username": username}
    )
    if not user_data:
        raise HTTPException(status_code=404, detail="User not found")
    
    user_dict = dict(user_data)
    profile_completed_value = user_dict.get("profile_completed")
    if profile_completed_value is None:
        profile_completed_value = False
    else:
        profile_completed_value = bool(profile_completed_value)
    
    return UserResponse(
        id=user_dict["id"],
        username=user_dict["username"],
        role=user_dict["role"],
        is_active=user_dict["is_active"],
        created_at=user_dict["created_at"].isoformat() if isinstance(user_dict["created_at"], datetime) else user_dict["created_at"],
        nome=user_dict.get("nome"),
        cognome=user_dict.get("cognome"),
        email=user_dict.get("email") or user_dict.get("google_email"),
        profile_completed=profile_completed_value
    )

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT"))
    if not port:
        raise ValueError("PORT environment variable is required")
    uvicorn.run(app, host="0.0.0.0", port=port)
