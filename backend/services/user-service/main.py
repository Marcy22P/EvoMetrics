"""
User Service - Microservizio per gestione utenti e permessi
"""

from fastapi import FastAPI, HTTPException, status, Query, Body, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import os
import json
import re
from pathlib import Path
from datetime import datetime
from jose import JWTError, jwt
from passlib.context import CryptContext
import bcrypt

from database import database, init_database, close_database
from models import (
    UserResponse,
    UpdateUserRequest,
    UserPermissions,
    UpdatePermissionsRequest,
    CreateUserRequest,
)
import httpx
from google_auth_oauthlib.flow import Flow
import requests
import google_utils as gcal
import asyncio
from pydantic import BaseModel

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

DEFAULT_PERMISSIONS_BY_ROLE: Dict[str, Any] = {
    "superadmin": {"__all__": True},
    "admin": {
        "dashboard:read": True,
        "preventivi:read": True,
        "preventivi:write": True,
        "preventivi:delete": True,
        "contratti:read": True,
        "contratti:write": True,
        "contratti:delete": True,
        "pagamenti:read": True,
        "pagamenti:write": True,
        "clienti:read": True,
        "clienti:create": True,
        "clienti:update": True,
        "clienti:delete": True,
        "assessments:read": True,
        "assessments:delete": True,
        "gradimento:read": True,
        "gradimento:write": True,
        "users:create": True,
        "users:read": True,
        "users:update": True,
        "users:delete": True,
        "scheduler:status": True,
        "scheduler:write": True,
        "slack:read": True,
        "debug:read": True,
    },
    "user": {
        "gradimento:write": True,
    },
}

ALLOWED_ROLES = {"user", "admin", "superadmin"}

# JWT Configuration
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    raise ValueError("SECRET_KEY environment variable is required")
ALGORITHM = "HS256"

# Email Service Configuration (opzionale, usato solo se non in modalità unificata)
EMAIL_SERVICE_URL = os.environ.get("EMAIL_SERVICE_URL")
SERVICE_TOKEN = os.environ.get("SERVICE_TOKEN")

FRONTEND_URL = os.environ.get("FRONTEND_URL")
if not FRONTEND_URL:
    raise ValueError("FRONTEND_URL environment variable is required")

# Password hashing
try:
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
except Exception as e:
    print(f"⚠️  Errore inizializzazione bcrypt: {e}")
    import passlib.hash
    pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__ident="2b")


def get_password_hash(password: str) -> str:
    """Hash della password"""
    try:
        return pwd_context.hash(password)
    except Exception as e:
        print(f"❌ Errore hash password: {e}")
        return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


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


async def get_admin_user(current_user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Verifica che l'utente sia admin"""
    if current_user["role"] not in ("admin", "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions"
        )
    return current_user


app = FastAPI(
    title="User Service",
    description="Microservizio per gestione utenti e permessi",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_event():
    print("🚀 Avvio User Service...")
    await init_database()
    await ensure_schema()
    print("✅ User Service avviato")


async def ensure_schema():
    """Ensures database schema is up to date"""
    try:
        # Check if job_title column exists
        check_query = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='job_title'
        """
        row = await database.fetch_one(check_query)
        if not row:
            print("🔄 Adding job_title column to users table...")
            await database.execute("ALTER TABLE users ADD COLUMN job_title TEXT")
            print("✅ job_title column added")

        # Check if google_refresh_token column exists
        check_query_token = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='google_refresh_token'
        """
        row_token = await database.fetch_one(check_query_token)
        if not row_token:
            print("🔄 Adding google_refresh_token column to users table...")
            await database.execute("ALTER TABLE users ADD COLUMN google_refresh_token TEXT")
            print("✅ google_refresh_token column added")

        # Check if is_google_calendar_connected column exists
        check_query_conn = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='is_google_calendar_connected'
        """
        row_conn = await database.fetch_one(check_query_conn)
        if not row_conn:
            print("🔄 Adding is_google_calendar_connected column to users table...")
            await database.execute("ALTER TABLE users ADD COLUMN is_google_calendar_connected BOOLEAN DEFAULT FALSE")
            print("✅ is_google_calendar_connected column added")

        # Check if google_calendar_email column exists
        check_query_email = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='google_calendar_email'
        """
        row_email = await database.fetch_one(check_query_email)
        if not row_email:
            print("🔄 Adding google_calendar_email column to users table...")
            await database.execute("ALTER TABLE users ADD COLUMN google_calendar_email TEXT")
            print("✅ google_calendar_email column added")

    except Exception as e:
        print(f"⚠️ Schema check failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    print("⏹️ Spegnimento User Service...")
    await close_database()
    print("✅ User Service fermato")


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "user-service"}


async def fetch_user_or_404(user_id: int) -> Dict[str, Any]:
    query = """
        SELECT id, username, role, is_active, pending_approval, rejection_reason,
               nome, cognome, email, google_email, google_id, profile_completed,
               job_title, google_refresh_token, is_google_calendar_connected,
               created_at, updated_at
        FROM users
        WHERE id = :user_id
    """
    row = await database.fetch_one(query, {"user_id": user_id})
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return dict(row)


def serialize_user(row: Dict[str, Any]) -> UserResponse:
    def _bool(value, default=False):
        if value is None:
            return default
        return bool(value)

    return UserResponse(
        id=row["id"],
        username=row["username"],
        role=row["role"],
        is_active=_bool(row.get("is_active"), True),
        pending_approval=_bool(row.get("pending_approval"), False),
        rejection_reason=row.get("rejection_reason"),
        nome=row.get("nome"),
        cognome=row.get("cognome"),
        email=row.get("email"),
        google_email=row.get("google_email"),
        google_id=row.get("google_id"),
        profile_completed=_bool(row.get("profile_completed"), False),
        job_title=row.get("job_title"),
        google_refresh_token=row.get("google_refresh_token"),
        is_google_calendar_connected=_bool(row.get("is_google_calendar_connected"), False),
        created_at=row["created_at"].isoformat() if row.get("created_at") else "",
        updated_at=row["updated_at"].isoformat() if row.get("updated_at") else "",
    )


def get_default_permissions(role: str) -> Dict[str, bool]:
    defaults = DEFAULT_PERMISSIONS_BY_ROLE.get(role, {})
    if defaults.get("__all__"):
        return {"__all__": True}
    return defaults.copy()


async def load_user_permissions(user: Dict[str, Any]) -> Dict[str, Any]:
    if user["role"] == "superadmin":
        return {"permissions": {"__all__": True}, "has_all_access": True}

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

    has_all_access = bool(perms.get("__all__"))
    return {"permissions": perms, "has_all_access": has_all_access}


@app.post("/api/users", response_model=UserResponse)
async def create_user(
    user_data: CreateUserRequest,
    admin_user: Dict[str, Any] = Depends(get_admin_user),
):
    """Crea un nuovo utente (solo admin/superadmin)"""
    # Security checks
    requested_role = (user_data.role or "user").lower()
    if requested_role not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Ruolo non valido")

    creator_role = str(admin_user.get("role", "")).lower()
    if creator_role == "admin" and requested_role != "user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permesso negato per creare ruoli elevati")

    # Validazione username
    username = (user_data.username or "").strip()
    if not (3 <= len(username) <= 50):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username deve avere 3-50 caratteri")
    if not re.match(r"^[A-Za-z0-9_\.\-]+$", username):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username contiene caratteri non validi")

    # Password opzionale: se non fornita, l'utente potrà accedere solo con Google OAuth
    password = user_data.password or ""
    password_hash = None
    
    if password:
        # Se password fornita, valida e hasha
        if len(password) < 8:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password troppo corta (min 8)")
        if not re.search(r"[A-Za-z]", password) or not re.search(r"[0-9]", password):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password deve contenere lettere e numeri")
        password_hash = get_password_hash(password)

    # Verifica se l'utente esiste già
    existing_user = await database.fetch_one(
        "SELECT id FROM users WHERE username = :username",
        {"username": username}
    )
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Crea nuovo utente
    now = datetime.utcnow()
    new_user = await database.fetch_one(
        """
        INSERT INTO users (username, password_hash, role, is_active, created_at, updated_at)
        VALUES (:username, :password_hash, :role, :is_active, :created_at, :updated_at)
        RETURNING id, username, role, is_active, created_at, updated_at
        """,
        {
            "username": username,
            "password_hash": password_hash,
            "role": requested_role,
            "is_active": True,
            "created_at": now,
            "updated_at": now
        }
    )

    # Crea automaticamente i permessi di default per il nuovo utente
    default_perms = get_default_permissions(requested_role)
    perms_json = json.dumps(default_perms, ensure_ascii=False)
    
    try:
        await database.execute(
            """
            INSERT INTO user_permissions (user_id, permissions, created_at, updated_at)
            VALUES (:uid, :perms, :created_at, :updated_at)
            """,
            {
                "uid": new_user["id"],
                "perms": perms_json,
                "created_at": now,
                "updated_at": now
            }
        )
    except Exception as e:
        # Se fallisce, non blocchiamo la creazione dell'utente
        print(f"⚠️ Warning: Could not create user_permissions for user {new_user['id']}: {e}")

    return serialize_user(dict(new_user))


@app.get("/api/users", response_model=List[UserResponse])
async def list_users(
    include_pending: bool = Query(True, description="Includi utenti pending"),
    only_active: bool = Query(False, description="Mostra solo utenti attivi"),
    _: Dict[str, Any] = Depends(get_admin_user),
):
    filters = []
    if not include_pending:
        filters.append("pending_approval = false")
    if only_active:
        filters.append("is_active = true")

    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""
    query = f"""
        SELECT id, username, role, is_active, pending_approval, rejection_reason,
               nome, cognome, email, google_email, google_id, profile_completed,
               job_title, google_refresh_token, is_google_calendar_connected,
               created_at, updated_at
        FROM users
        {where_clause}
        ORDER BY created_at DESC
    """

    rows = await database.fetch_all(query)
    return [serialize_user(dict(row)) for row in rows]


@app.patch("/api/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    payload: UpdateUserRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    # Solo admin può modificare altri utenti, o l'utente può modificare se stesso
    if current_user["role"] not in ("admin", "superadmin") and current_user["id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    update_data = payload.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    if (role := update_data.get("role")) and role not in ALLOWED_ROLES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role")

    await fetch_user_or_404(user_id)

    set_clauses = []
    params: Dict[str, Any] = {"user_id": user_id}
    for field, value in update_data.items():
        set_clauses.append(f"{field} = :{field}")
        params[field] = value

    params["updated_at"] = datetime.utcnow()
    set_clauses.append("updated_at = :updated_at")

    query = f"""
        UPDATE users
        SET {', '.join(set_clauses)}
        WHERE id = :user_id
    """
    await database.execute(query, params)

    user = await fetch_user_or_404(user_id)
    return serialize_user(user)


@app.get("/api/users/{user_id}/permissions", response_model=UserPermissions)
async def get_user_permissions(
    user_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    # Solo admin può vedere permessi di altri utenti, o l'utente può vedere i propri
    if current_user["role"] not in ("admin", "superadmin") and current_user["id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    user = await fetch_user_or_404(user_id)
    perms_info = await load_user_permissions(user)
    return UserPermissions(
        user_id=user_id,
        role=user["role"],
        permissions=perms_info["permissions"],
        has_all_access=perms_info["has_all_access"],
    )


@app.put("/api/users/{user_id}/permissions", response_model=UserPermissions)
async def update_user_permissions(
    user_id: int,
    payload: UpdatePermissionsRequest,
    _: Dict[str, Any] = Depends(get_admin_user),
):
    user = await fetch_user_or_404(user_id)

    if user["role"] == "superadmin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Superadmin ha accesso completo")

    now = datetime.utcnow()
    permissions_json = json.dumps(payload.permissions or {}, ensure_ascii=False)

    existing = await database.fetch_one(
        "SELECT user_id FROM user_permissions WHERE user_id = :uid",
        {"uid": user_id},
    )

    if existing:
        await database.execute(
            """
            UPDATE user_permissions
            SET permissions = :perms, updated_at = :updated_at
            WHERE user_id = :uid
            """,
            {"perms": permissions_json, "updated_at": now, "uid": user_id},
        )
    else:
        await database.execute(
            """
            INSERT INTO user_permissions (user_id, permissions, created_at, updated_at)
            VALUES (:uid, :perms, :created_at, :updated_at)
            """,
            {"uid": user_id, "perms": permissions_json, "created_at": now, "updated_at": now},
        )

    perms_info = await load_user_permissions({**user, "id": user_id})
    return UserPermissions(
        user_id=user_id,
        role=user["role"],
        permissions=perms_info["permissions"],
        has_all_access=perms_info["has_all_access"],
    )


@app.get("/api/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    # Solo admin può vedere altri utenti, o l'utente può vedere se stesso
    if current_user["role"] not in ("admin", "superadmin") and current_user["id"] != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
    user = await fetch_user_or_404(user_id)
    return serialize_user(user)


@app.delete("/api/users/{user_id}")
async def delete_user(
    user_id: int,
    _: Dict[str, Any] = Depends(get_admin_user),
):
    user = await fetch_user_or_404(user_id)
    
    if user["role"] == "superadmin":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Non è possibile eliminare un superadmin")
    
    await database.execute("DELETE FROM user_permissions WHERE user_id = :uid", {"uid": user_id})
    await database.execute("DELETE FROM users WHERE id = :uid", {"uid": user_id})
    
    return {"status": "success", "message": "Utente eliminato con successo", "user_id": user_id}


@app.post("/api/users/{user_id}/approve")
async def approve_user(
    user_id: int,
    _: Dict[str, Any] = Depends(get_admin_user),
):
    user = await fetch_user_or_404(user_id)
    
    if not user.get("pending_approval"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Utente non in attesa di approvazione")
    
    now = datetime.utcnow()
    await database.execute(
        """
        UPDATE users
        SET pending_approval = false, is_active = true, updated_at = :updated_at
        WHERE id = :uid
        """,
        {"uid": user_id, "updated_at": now},
    )
    
    # Invia email di approvazione (opzionale, non blocca se fallisce)
    try:
        user_email = user.get("email") or user.get("google_email")
        user_name = f"{user.get('nome', '')} {user.get('cognome', '')}".strip() or user.get("username", "Utente")
        login_url = f"{FRONTEND_URL}/login"
        
        if user_email:
            # Prova prima con chiamate dirette (più veloce e sicuro)
            import sys
            from pathlib import Path
            shared_path = Path(__file__).parent.parent.parent / "shared"
            sys.path.insert(0, str(shared_path))
            from internal_calls import send_approval_email_internal
            
            success = await send_approval_email_internal(user_email, user_name, login_url)
            if success:
                print(f"✅ Email di approvazione inviata a {user_email}")
            else:
                print(f"⚠️ Errore invio email di approvazione")
    except Exception as e:
        # Non bloccare l'approvazione se l'email fallisce
        print(f"⚠️ Errore invio email approvazione: {e}")
    
    return {"status": "success", "message": "Utente approvato con successo", "user_id": user_id}


@app.post("/api/users/{user_id}/reject")
async def reject_user(
    user_id: int,
    payload: Dict[str, Any] = Body(None),
    _: Dict[str, Any] = Depends(get_admin_user),
):
    user = await fetch_user_or_404(user_id)
    
    if not user.get("pending_approval"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Utente non in attesa di approvazione")
    
    reason = (payload or {}).get("reason") if payload else None
    now = datetime.utcnow()
    
    await database.execute(
        """
        UPDATE users
        SET pending_approval = false, is_active = false, rejection_reason = :reason, updated_at = :updated_at
        WHERE id = :uid
        """,
        {"uid": user_id, "reason": reason, "updated_at": now},
    )
    
    return {"status": "success", "message": "Utente rifiutato", "user_id": user_id}


@app.patch("/api/users/{user_id}/password")
async def update_user_password(
    user_id: int,
    payload: Dict[str, Any] = Body(...),
    admin_user: Dict[str, Any] = Depends(get_admin_user),
):
    """
    Permette ad admin/superadmin di impostare/modificare la password di un utente.
    Se password_hash viene impostato, l'utente potrà accedere sia con username/password che con Google OAuth.
    Se password_hash è NULL, l'utente può accedere solo con Google OAuth.
    """
    target = await database.fetch_one("SELECT id, role FROM users WHERE id = :id", {"id": user_id})
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    
    target_dict = dict(target)
    
    # Verifica permessi: admin può modificare solo user, superadmin può modificare tutti
    caller_role = admin_user.get("role")
    target_role = target_dict.get("role")
    
    if caller_role == "admin" and target_role in ("admin", "superadmin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Non puoi modificare password di utenti con ruolo elevato. Solo superadmin può modificare password di admin e superadmin."
        )
    
    password = payload.get("password")
    if not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password richiesta")
    
    if len(password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="La password deve essere di almeno 8 caratteri")
    
    # Hash della password
    password_hash = get_password_hash(password)
    
    # Aggiorna password
    now = datetime.utcnow()
    await database.execute(
        "UPDATE users SET password_hash = :ph, updated_at = :u WHERE id = :id",
        {"ph": password_hash, "u": now, "id": user_id}
    )
    
    return {
        "status": "ok",
        "user_id": user_id,
        "message": "Password aggiornata con successo. L'utente ora può accedere sia con username/password che con Google OAuth."
    }


# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")

# Google OAuth URIs configurabili (con fallback ai valori standard)
GOOGLE_AUTH_URI = os.environ.get("GOOGLE_AUTH_URI", "https://accounts.google.com/o/oauth2/auth")
GOOGLE_TOKEN_URI = os.environ.get("GOOGLE_TOKEN_URI", "https://oauth2.googleapis.com/token")
GOOGLE_USERINFO_URI = os.environ.get("GOOGLE_USERINFO_URI", "https://www.googleapis.com/oauth2/v2/userinfo")

# Google Calendar Scopes configurabili (CSV, con fallback ai valori standard)
GOOGLE_CALENDAR_SCOPES_STR = os.environ.get("GOOGLE_CALENDAR_SCOPES")
if GOOGLE_CALENDAR_SCOPES_STR:
    GOOGLE_CALENDAR_SCOPES = [scope.strip() for scope in GOOGLE_CALENDAR_SCOPES_STR.split(",") if scope.strip()]
else:
    # Fallback ai valori standard
    GOOGLE_CALENDAR_SCOPES = [
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/userinfo.email'
    ]

@app.get("/api/auth/google/calendar/url")
async def get_google_calendar_auth_url(redirect_uri: str):
    """Genera l'URL per l'autorizzazione di Google Calendar"""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Google Credentials not configured")

    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": GOOGLE_AUTH_URI,
                "token_uri": GOOGLE_TOKEN_URI,
            }
        },
        scopes=GOOGLE_CALENDAR_SCOPES,
        redirect_uri=redirect_uri
    )
    
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent' # Importante per ottenere refresh token ogni volta
    )
    
    return {"authorization_url": authorization_url}

@app.post("/api/auth/google/calendar/connect")
async def connect_google_calendar(
    payload: Dict[str, str],
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Scambia l'auth code per token e salva nel profilo utente"""
    code = payload.get("code")
    redirect_uri = payload.get("redirect_uri")
    
    if not code or not redirect_uri:
        raise HTTPException(status_code=400, detail="Missing code or redirect_uri")

    try:
        # Usa run_in_executor per operazioni sincrone bloccanti
        import asyncio
        loop = asyncio.get_event_loop()
        
        def exchange_token():
            flow = Flow.from_client_config(
                {
                    "web": {
                        "client_id": GOOGLE_CLIENT_ID,
                        "client_secret": GOOGLE_CLIENT_SECRET,
                        "auth_uri": GOOGLE_AUTH_URI,
                        "token_uri": GOOGLE_TOKEN_URI,
                    }
                },
                scopes=GOOGLE_CALENDAR_SCOPES,
                redirect_uri=redirect_uri
            )
            flow.fetch_token(code=code)
            return flow.credentials

        credentials = await loop.run_in_executor(None, exchange_token)
        
        # Ottieni email dell'account collegato per verifica
        def get_user_info():
            resp = requests.get(
                GOOGLE_USERINFO_URI,
                headers={'Authorization': f'Bearer {credentials.token}'}
            )
            return resp.json()

        google_user_info = await loop.run_in_executor(None, get_user_info)
        connected_email = google_user_info.get('email')
        refresh_token = credentials.refresh_token

        # Aggiorna DB
        update_query = """
            UPDATE users 
            SET google_refresh_token = :rt, 
                google_calendar_email = :email,
                is_google_calendar_connected = true,
                updated_at = :now
            WHERE id = :uid
        """
        
        params = {
            "email": connected_email,
            "now": datetime.utcnow(),
            "uid": current_user["id"]
        }
        
        if refresh_token:
            params["rt"] = refresh_token
        else:
            print("⚠️ Warning: No refresh token received from Google.")
            params["rt"] = None 

        if refresh_token:
             await database.execute(update_query, params)
        else:
             # Update senza toccare il refresh token (solo email e flag)
             update_query_no_rt = """
                UPDATE users 
                SET google_calendar_email = :email,
                    is_google_calendar_connected = true,
                    updated_at = :now
                WHERE id = :uid
            """
             del params["rt"]
             await database.execute(update_query_no_rt, params)
        
        return {"status": "success", "connected_email": connected_email}
        
    except Exception as e:
        print(f"Auth Error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to connect Google Calendar: {str(e)}")

@app.post("/api/auth/google/calendar/disconnect")
async def disconnect_google_calendar(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Disconnette il calendario rimuovendo i token"""
    query = """
        UPDATE users 
        SET google_refresh_token = NULL, 
            google_calendar_email = NULL,
            is_google_calendar_connected = false,
            updated_at = :now
        WHERE id = :uid
    """
    await database.execute(query, {
        "now": datetime.utcnow(),
        "uid": current_user["id"]
    })
    return {"status": "success"}


# ========================
# CALENDAR ENDPOINTS
# ========================

@app.get("/api/calendar/status")
async def get_calendar_status(user_id: int = Query(...)):
    """Verifica stato connessione calendario"""
    user = await fetch_user_or_404(user_id)
    return {
        "connected": user.get("is_google_calendar_connected", False),
        "calendar_email": user.get("google_calendar_email"),
        "connected_at": user.get("updated_at") # Approssimato
    }

@app.get("/api/calendar/events")
async def get_calendar_events(
    start: str = Query(...), # ISO format
    end: str = Query(...),   # ISO format
    user_id: Optional[int] = Query(None), # Se specificato (e admin), vedi quel calendario
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    loop = asyncio.get_event_loop()
    
    # Determina target user(s)
    target_users = []
    
    if user_id:
        # Se specificato un utente target
        # Utente può vedere se stesso, Admin può vedere chiunque
        if current_user["role"] not in ("admin", "superadmin") and current_user["id"] != user_id:
             raise HTTPException(status_code=403, detail="Permesso negato")
        
        try:
            user = await fetch_user_or_404(user_id)
            if user.get("is_google_calendar_connected"):
                target_users.append(user)
        except HTTPException:
            pass # Ignore if not found
            
    elif current_user["role"] in ("admin", "superadmin"):
        # Admin senza target specifico -> Vede TUTTI
        query = "SELECT * FROM users WHERE is_google_calendar_connected = true"
        rows = await database.fetch_all(query)
        target_users = [dict(row) for row in rows]
    else:
        # User normale -> Solo se stesso
        user = await fetch_user_or_404(current_user["id"])
        if user.get("is_google_calendar_connected"):
            target_users.append(user)
            
    all_events = []
    
    # Definisci funzione sincrona per fetch
    def fetch_user_events(u):
        try:
            if not u.get("google_refresh_token"):
                return []
            
            # Costruisci service
            service = gcal.get_calendar_service(
                access_token="", # Verrà refreshato
                refresh_token=u.get("google_refresh_token")
            )
            
            dt_start = datetime.fromisoformat(start.replace("Z", "+00:00"))
            dt_end = datetime.fromisoformat(end.replace("Z", "+00:00"))
            
            # List events
            events = gcal.list_events(
                service, 
                time_min=dt_start,
                time_max=dt_end
            )
            
            # Arricchisci eventi con info owner
            for ev in events:
                ev["owner_user_id"] = str(u["id"])
                ev["owner_username"] = u.get("username")
                ev["owner_calendar_email"] = u.get("google_calendar_email")
                
            return events
        except Exception as e:
            print(f"⚠️ Error fetching events for user {u.get('id')}: {e}")
            return []

    # Esegui in parallelo (o sequenziale nel thread pool)
    for u in target_users:
        events = await loop.run_in_executor(None, fetch_user_events, u)
        all_events.extend(events)
        
    # Rispondi con formato compatibile con frontend
    return {
        "events": all_events,
        "period": {"start": start, "end": end},
        "users_count": len(target_users)
    }

@app.get("/api/calendar/admin/all-events")
async def get_all_calendar_events_admin(
    start: str = Query(...),
    end: str = Query(...),
    user_ids: Optional[str] = Query(None), # comma separated
    current_user: Dict[str, Any] = Depends(get_admin_user)
):
    loop = asyncio.get_event_loop()
    
    query = "SELECT * FROM users WHERE is_google_calendar_connected = true"
    rows = await database.fetch_all(query)
    all_users = [dict(row) for row in rows]
    
    target_users = all_users
    if user_ids:
        ids = [int(x) for x in user_ids.split(",") if x.strip()]
        target_users = [u for u in all_users if u["id"] in ids]
        
    all_events = []
    
    def fetch_user_events(u):
        try:
            if not u.get("google_refresh_token"): return []
            service = gcal.get_calendar_service(access_token="", refresh_token=u.get("google_refresh_token"))
            dt_start = datetime.fromisoformat(start.replace("Z", "+00:00"))
            dt_end = datetime.fromisoformat(end.replace("Z", "+00:00"))
            events = gcal.list_events(service, time_min=dt_start, time_max=dt_end)
            for ev in events:
                ev["owner_user_id"] = str(u["id"])
                ev["owner_username"] = u.get("username")
                ev["owner_calendar_email"] = u.get("google_calendar_email")
            return events
        except Exception as e:
            print(f"⚠️ Error {u['id']}: {e}")
            return []

    for u in target_users:
        events = await loop.run_in_executor(None, fetch_user_events, u)
        all_events.extend(events)
        
    return {
        "events": all_events,
        "period": {"start": start, "end": end},
        "users_count": len(target_users)
    }

@app.post("/api/calendar/events")
async def create_calendar_event(
    event: Dict[str, Any] = Body(...),
    user_id: int = Query(...), # Owner del calendario su cui creare
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    # Verifica permessi: posso creare sul mio o sono admin
    if current_user["role"] not in ("admin", "superadmin") and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Permesso negato")
        
    target_user = await fetch_user_or_404(user_id)
    if not target_user.get("is_google_calendar_connected"):
        raise HTTPException(status_code=400, detail="Utente non ha calendario collegato")
        
    loop = asyncio.get_event_loop()
    
    def do_create():
        service = gcal.get_calendar_service(
            access_token="",
            refresh_token=target_user.get("google_refresh_token")
        )
        return gcal.create_event(
            service,
            summary=event.get("summary"),
            start=event.get("start"),
            end=event.get("end"),
            description=event.get("description"),
            location=event.get("location"),
            attendees=event.get("attendees")
        )
        
    try:
        new_event = await loop.run_in_executor(None, do_create)
        new_event["owner_user_id"] = str(target_user["id"])
        return new_event
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/calendar/events/{event_id}")
async def delete_calendar_event(
    event_id: str,
    user_id: int = Query(...),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    if current_user["role"] not in ("admin", "superadmin") and current_user["id"] != user_id:
        raise HTTPException(status_code=403, detail="Permesso negato")
        
    target_user = await fetch_user_or_404(user_id)
    
    loop = asyncio.get_event_loop()
    
    def do_delete():
        service = gcal.get_calendar_service(
            access_token="",
            refresh_token=target_user.get("google_refresh_token")
        )
        return gcal.delete_event(service, event_id)
        
    success = await loop.run_in_executor(None, do_delete)
    if not success:
        raise HTTPException(status_code=500, detail="Errore eliminazione")
        
    return {"status": "success"}

@app.get("/api/calendar/admin/users")
async def get_calendar_users(current_user: Dict[str, Any] = Depends(get_admin_user)):
    """Lista utenti con stato calendario per filtri admin"""
    query = """
        SELECT id as user_id, username, nome, cognome, google_calendar_email as calendar_email, 
               is_google_calendar_connected as is_connected, updated_at as connected_at
        FROM users
    """
    rows = await database.fetch_all(query)
    # Converti in dict e formatta date se necessario
    results = []
    for row in rows:
        d = dict(row)
        d["user_id"] = str(d["user_id"])
        if d.get("connected_at"):
            d["connected_at"] = d["connected_at"].isoformat()
        results.append(d)
    return results

# VC_OS SYNC ENDPOINT
class SyncTaskRequest(BaseModel):
    user_id: int
    task_id: str
    title: str
    description: Optional[str]
    due_date: Optional[str] # ISO format
    google_event_id: Optional[str] = None
    action: str = "create" # create, update, delete

@app.post("/api/internal/calendar/sync-task")
async def internal_sync_task(req: SyncTaskRequest):
    """
    Endpoint interno per sincronizzare i task di produttività sul calendario dedicato.
    """
    # 1. Recupera utente
    user_row = await database.fetch_one("SELECT * FROM users WHERE id = :id", {"id": req.user_id})
    if not user_row:
        return {"status": "skipped", "reason": "user_not_found"}
    
    user = dict(user_row)
    if not user.get("is_google_calendar_connected") or not user.get("google_refresh_token"):
        return {"status": "skipped", "reason": "user_not_connected"}

    loop = asyncio.get_event_loop()

    def do_sync():
        service = gcal.get_calendar_service(
            access_token="",
            refresh_token=user.get("google_refresh_token")
        )
        
        # 1. Ensure Calendar exists
        calendar_id = gcal.ensure_app_calendar(service)
        
        if req.action == "delete":
            if req.google_event_id:
                gcal.delete_event(service, req.google_event_id, calendar_id)
            return {"google_event_id": None}
            
        elif req.action in ("create", "update"):
            if not req.due_date:
                return {"google_event_id": None}
                
            # Create/Update logic
            # Se abbiamo google_event_id, proviamo update, se fallisce (404) ricreiamo?
            # Per semplicità usiamo create_event che fa insert
            
            # Formatta date: task ha due_date (fine giornata lavorativa o specifico?)
            # Assumiamo due_date come inizio, e +1h come fine, o tutto il giorno?
            # Useremo tutto il giorno per i task se non hanno orario specifico
            
            start_dt = req.due_date
            # Se la stringa non ha T, è YYYY-MM-DD -> All Day
            is_all_day = 'T' not in req.due_date
            
            event_body = {
                'summary': req.title,
                'description': req.description or "",
                'extendedProperties': {
                    'private': {
                        'task_id': req.task_id,
                        'app_source': 'VC_OS'
                    }
                }
            }
            
            if is_all_day:
                event_body['start'] = {'date': req.due_date}
                event_body['end'] = {'date': req.due_date} # Google Calendar exclusive end? Check. solitamente end date è esclusiva (+1 day)
                # Helper: parse date, add 1 day
                try:
                    d = datetime.strptime(req.due_date, "%Y-%m-%d")
                    from datetime import timedelta
                    d_end = d + timedelta(days=1)
                    event_body['end'] = {'date': d_end.strftime("%Y-%m-%d")}
                except:
                    event_body['end'] = {'date': req.due_date}
            else:
                 event_body['start'] = {'dateTime': req.due_date, 'timeZone': 'Europe/Rome'}
                 # Default 1h duration
                 try:
                     d = datetime.fromisoformat(req.due_date.replace("Z", "+00:00"))
                     from datetime import timedelta
                     d_end = d + timedelta(hours=1)
                     event_body['end'] = {'dateTime': d_end.isoformat(), 'timeZone': 'Europe/Rome'}
                 except:
                     event_body['end'] = event_body['start']

            if req.action == "update" and req.google_event_id:
                try:
                    updated = service.events().patch(
                        calendarId=calendar_id,
                        eventId=req.google_event_id,
                        body=event_body
                    ).execute()
                    return {"google_event_id": updated['id']}
                except Exception as e:
                    print(f"Update fallito, provo create: {e}")
                    # Fallback a create
            
            # Create
            created = service.events().insert(
                calendarId=calendar_id,
                body=event_body
            ).execute()
            return {"google_event_id": created['id']}
            
        return {"google_event_id": None}

    try:
        result = await loop.run_in_executor(None, do_sync)
        return {"status": "success", **result}
    except Exception as e:
        print(f"Sync Error: {e}")
        return {"status": "error", "detail": str(e)}

if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT"))
    if not port:
        raise ValueError("PORT environment variable is required")
    uvicorn.run(app, host="0.0.0.0", port=port)
