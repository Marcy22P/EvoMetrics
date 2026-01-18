"""
Calendar Service - Microservizio per gestione calendari Google
Permette agli utenti di collegare il proprio Google Calendar
e all'admin di visualizzare tutti i calendari aggregati
"""

from fastapi import FastAPI, HTTPException, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from typing import List, Optional
from datetime import datetime, timedelta
import os
import httpx
from pathlib import Path

# Carica variabili d'ambiente
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

from database import database, init_database, close_database
from models import (
    CalendarEvent, CalendarEventCreate, CalendarEventUpdate,
    UserCalendarInfo, FreeBusyRequest, FreeBusyResponse, FreeBusySlot
)
import google_calendar as gcal

# Configurazione FastAPI
app = FastAPI(
    title="Calendar Service",
    description="Microservizio per gestione calendari Google integrati",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# User Service URL per verifiche
USER_SERVICE_URL = os.getenv("USER_SERVICE_URL") or os.getenv("BASE_URL") or os.getenv("GATEWAY_URL")
if not USER_SERVICE_URL:
    raise ValueError("USER_SERVICE_URL, BASE_URL o GATEWAY_URL deve essere configurato")

@app.on_event("startup")
async def startup():
    await init_database()

@app.on_event("shutdown")
async def shutdown():
    await close_database()

# ========================
# HELPER FUNCTIONS
# ========================

async def get_user_token(user_id: str) -> Optional[dict]:
    """Ottiene il token OAuth di un utente dal DB"""
    query = "SELECT * FROM calendar_tokens WHERE user_id = :user_id"
    row = await database.fetch_one(query, {"user_id": user_id})
    if row:
        return dict(row)
    return None

async def save_user_token(user_id: str, tokens: dict, calendar_email: str = None):
    """Salva o aggiorna il token OAuth di un utente"""
    existing = await get_user_token(user_id)
    
    if existing:
        query = """
            UPDATE calendar_tokens 
            SET access_token = :access_token,
                refresh_token = COALESCE(:refresh_token, refresh_token),
                token_expiry = :token_expiry,
                calendar_email = COALESCE(:calendar_email, calendar_email)
            WHERE user_id = :user_id
        """
    else:
        query = """
            INSERT INTO calendar_tokens (user_id, access_token, refresh_token, token_expiry, calendar_email, connected_at)
            VALUES (:user_id, :access_token, :refresh_token, :token_expiry, :calendar_email, :connected_at)
        """
    
    await database.execute(query, {
        "user_id": user_id,
        "access_token": tokens.get("access_token"),
        "refresh_token": tokens.get("refresh_token"),
        "token_expiry": tokens.get("token_expiry"),
        "calendar_email": calendar_email,
        "connected_at": datetime.utcnow().isoformat()
    })

async def delete_user_token(user_id: str):
    """Rimuove il collegamento calendario di un utente"""
    query = "DELETE FROM calendar_tokens WHERE user_id = :user_id"
    await database.execute(query, {"user_id": user_id})

async def get_all_connected_users() -> List[dict]:
    """Ottiene tutti gli utenti con calendario collegato"""
    query = "SELECT * FROM calendar_tokens"
    rows = await database.fetch_all(query)
    return [dict(r) for r in rows]

async def get_user_info(user_id: str) -> Optional[dict]:
    """Ottiene info utente dal User Service"""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{USER_SERVICE_URL}/api/users/{user_id}", timeout=5.0)
            if resp.status_code == 200:
                return resp.json()
    except Exception as e:
        print(f"⚠️ Errore fetch user info: {e}")
    return None

async def is_admin(user_id: str) -> bool:
    """Verifica se l'utente è admin"""
    user = await get_user_info(user_id)
    if user:
        return user.get("role") == "admin"
    return False

# ========================
# ENDPOINTS - OAUTH
# ========================

@app.get("/api/calendar/auth/url")
async def get_auth_url(
    user_id: str = Query(..., description="ID utente che sta collegando"),
    redirect_uri: str = Query(..., description="URI di redirect dopo auth")
):
    """
    Genera l'URL per autorizzare l'accesso al Google Calendar.
    L'utente viene reindirizzato a Google per il consenso.
    """
    try:
        # Stato contiene user_id per il callback
        state = user_id
        auth_url = gcal.get_auth_url(redirect_uri, state=state)
        return {"auth_url": auth_url}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/calendar/auth/callback")
async def auth_callback(
    code: str = Query(...),
    state: str = Query(None),  # user_id passato come state
    redirect_uri: str = Query(...)
):
    """
    Callback OAuth dopo autorizzazione Google.
    Scambia il code per tokens e li salva per l'utente.
    """
    if not state:
        raise HTTPException(status_code=400, detail="Manca user_id (state)")
    
    user_id = state
    
    try:
        # Scambia code per tokens
        tokens = gcal.exchange_code_for_tokens(code, redirect_uri)
        
        # Ottieni email calendario
        service = gcal.get_calendar_service(
            tokens["access_token"],
            tokens.get("refresh_token"),
            tokens.get("token_expiry")
        )
        calendar_email = gcal.get_calendar_email(service)
        
        # Salva tokens
        await save_user_token(user_id, tokens, calendar_email)
        
        return {
            "success": True,
            "message": "Calendario collegato con successo",
            "calendar_email": calendar_email
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore OAuth callback: {str(e)}")

@app.delete("/api/calendar/disconnect")
async def disconnect_calendar(user_id: str = Query(...)):
    """Scollega il calendario Google di un utente"""
    await delete_user_token(user_id)
    return {"success": True, "message": "Calendario scollegato"}

@app.get("/api/calendar/status")
async def get_connection_status(user_id: str = Query(...)):
    """Verifica lo stato di connessione del calendario per un utente"""
    token = await get_user_token(user_id)
    if token:
        return {
            "connected": True,
            "calendar_email": token.get("calendar_email"),
            "connected_at": token.get("connected_at")
        }
    return {"connected": False}

# ========================
# ENDPOINTS - EVENTI
# ========================

@app.get("/api/calendar/events", response_model=List[CalendarEvent])
async def get_events(
    user_id: str = Query(...),
    start: datetime = Query(None),
    end: datetime = Query(None)
):
    """
    Ottiene gli eventi del calendario dell'utente.
    Se non specificato, restituisce eventi del mese corrente.
    """
    token = await get_user_token(user_id)
    if not token:
        raise HTTPException(status_code=400, detail="Calendario non collegato")
    
    # Default: mese corrente
    if not start:
        start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if not end:
        if start.month == 12:
            end = start.replace(year=start.year + 1, month=1)
        else:
            end = start.replace(month=start.month + 1)
    
    try:
        service = gcal.get_calendar_service(
            token["access_token"],
            token.get("refresh_token"),
            token.get("token_expiry")
        )
        events = gcal.list_events(service, start, end)
        return events
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/calendar/events", response_model=CalendarEvent)
async def create_event(
    event: CalendarEventCreate,
    user_id: str = Query(...)
):
    """
    Crea un nuovo evento.
    - Utenti normali: creano sul proprio calendario
    - Admin: possono creare su qualsiasi calendario (usando target_user_id)
    """
    # Determina su quale calendario creare
    target_user = user_id
    
    if event.target_user_id:
        # Verifica che chi crea sia admin
        if not await is_admin(user_id):
            raise HTTPException(status_code=403, detail="Solo admin possono creare eventi su altri calendari")
        target_user = event.target_user_id
    
    token = await get_user_token(target_user)
    if not token:
        raise HTTPException(status_code=400, detail=f"Calendario non collegato per utente {target_user}")
    
    try:
        service = gcal.get_calendar_service(
            token["access_token"],
            token.get("refresh_token"),
            token.get("token_expiry")
        )
        
        created = gcal.create_event(
            service,
            summary=event.summary,
            start=event.start,
            end=event.end,
            description=event.description,
            location=event.location,
            attendees=event.attendees,
            color_id=event.color_id,
            recurrence=event.recurrence
        )
        return created
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/calendar/events/{event_id}", response_model=CalendarEvent)
async def update_event(
    event_id: str,
    event: CalendarEventUpdate,
    user_id: str = Query(...)
):
    """Aggiorna un evento esistente"""
    token = await get_user_token(user_id)
    if not token:
        raise HTTPException(status_code=400, detail="Calendario non collegato")
    
    try:
        service = gcal.get_calendar_service(
            token["access_token"],
            token.get("refresh_token"),
            token.get("token_expiry")
        )
        
        updated = gcal.update_event(
            service,
            event_id,
            summary=event.summary,
            description=event.description,
            start=event.start,
            end=event.end,
            location=event.location,
            attendees=event.attendees,
            color_id=event.color_id
        )
        return updated
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/calendar/events/{event_id}")
async def delete_event_endpoint(
    event_id: str,
    user_id: str = Query(...)
):
    """Elimina un evento"""
    token = await get_user_token(user_id)
    if not token:
        raise HTTPException(status_code=400, detail="Calendario non collegato")
    
    try:
        service = gcal.get_calendar_service(
            token["access_token"],
            token.get("refresh_token"),
            token.get("token_expiry")
        )
        success = gcal.delete_event(service, event_id)
        if success:
            return {"success": True}
        raise HTTPException(status_code=500, detail="Errore eliminazione evento")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ========================
# ENDPOINTS - ADMIN
# ========================

@app.get("/api/calendar/admin/users", response_model=List[UserCalendarInfo])
async def get_connected_users(requesting_user_id: str = Query(...)):
    """
    [ADMIN] Ottiene lista di tutti gli utenti con info calendario.
    Include chi ha collegato il calendario e chi no.
    """
    if not await is_admin(requesting_user_id):
        raise HTTPException(status_code=403, detail="Accesso riservato agli admin")
    
    # Ottieni tutti gli utenti dal User Service
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{USER_SERVICE_URL}/api/users", timeout=10.0)
            if resp.status_code != 200:
                raise HTTPException(status_code=500, detail="Errore fetch utenti")
            all_users = resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore comunicazione User Service: {e}")
    
    # Ottieni tokens collegati
    connected = await get_all_connected_users()
    connected_map = {t["user_id"]: t for t in connected}
    
    result = []
    for user in all_users:
        user_id = user.get("id")
        token_info = connected_map.get(user_id)
        
        result.append(UserCalendarInfo(
            user_id=user_id,
            username=user.get("username", ""),
            nome=user.get("nome"),
            cognome=user.get("cognome"),
            calendar_email=token_info.get("calendar_email") if token_info else None,
            is_connected=token_info is not None,
            connected_at=token_info.get("connected_at") if token_info else None
        ))
    
    return result

@app.get("/api/calendar/admin/all-events")
async def get_all_events(
    requesting_user_id: str = Query(...),
    start: datetime = Query(None),
    end: datetime = Query(None),
    user_ids: str = Query(None, description="IDs utenti separati da virgola (opzionale)")
):
    """
    [ADMIN] Ottiene eventi aggregati da tutti i calendari collegati.
    Restituisce eventi raggruppati per utente.
    """
    if not await is_admin(requesting_user_id):
        raise HTTPException(status_code=403, detail="Accesso riservato agli admin")
    
    # Default: settimana corrente
    if not start:
        start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    if not end:
        end = start + timedelta(days=7)
    
    # Filtra utenti se specificato
    filter_user_ids = None
    if user_ids:
        filter_user_ids = [u.strip() for u in user_ids.split(",")]
    
    connected = await get_all_connected_users()
    
    aggregated_events = []
    
    for token_data in connected:
        uid = token_data["user_id"]
        
        # Filtra se richiesto
        if filter_user_ids and uid not in filter_user_ids:
            continue
        
        try:
            service = gcal.get_calendar_service(
                token_data["access_token"],
                token_data.get("refresh_token"),
                token_data.get("token_expiry")
            )
            events = gcal.list_events(service, start, end)
            
            # Aggiungi info utente agli eventi
            user_info = await get_user_info(uid)
            username = user_info.get("username", uid) if user_info else uid
            
            for ev in events:
                ev["owner_user_id"] = uid
                ev["owner_username"] = username
                ev["owner_calendar_email"] = token_data.get("calendar_email")
                aggregated_events.append(ev)
                
        except Exception as e:
            print(f"⚠️ Errore fetch eventi per {uid}: {e}")
            continue
    
    # Ordina per data inizio
    aggregated_events.sort(key=lambda x: x.get("start", ""))
    
    return {
        "events": aggregated_events,
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "users_count": len(connected)
    }

@app.post("/api/calendar/admin/freebusy", response_model=List[FreeBusyResponse])
async def get_freebusy_all(
    request: FreeBusyRequest,
    requesting_user_id: str = Query(...)
):
    """
    [ADMIN] Ottiene disponibilità di tutti gli utenti o di un subset.
    Utile per pianificare meeting e vedere sovrapposizioni.
    """
    if not await is_admin(requesting_user_id):
        raise HTTPException(status_code=403, detail="Accesso riservato agli admin")
    
    connected = await get_all_connected_users()
    
    # Filtra utenti se specificato
    if request.user_ids:
        connected = [t for t in connected if t["user_id"] in request.user_ids]
    
    results = []
    
    for token_data in connected:
        uid = token_data["user_id"]
        user_info = await get_user_info(uid)
        username = user_info.get("username", uid) if user_info else uid
        
        try:
            service = gcal.get_calendar_service(
                token_data["access_token"],
                token_data.get("refresh_token"),
                token_data.get("token_expiry")
            )
            
            calendar_email = token_data.get("calendar_email", "primary")
            freebusy = gcal.get_freebusy(service, request.start, request.end, [calendar_email])
            
            busy_slots = []
            for slot in freebusy.get(calendar_email, []):
                busy_slots.append(FreeBusySlot(
                    start=datetime.fromisoformat(slot["start"].replace("Z", "+00:00")),
                    end=datetime.fromisoformat(slot["end"].replace("Z", "+00:00"))
                ))
            
            results.append(FreeBusyResponse(
                user_id=uid,
                username=username,
                calendar_email=calendar_email,
                busy_slots=busy_slots
            ))
            
        except Exception as e:
            print(f"⚠️ Errore freebusy per {uid}: {e}")
            results.append(FreeBusyResponse(
                user_id=uid,
                username=username,
                calendar_email=token_data.get("calendar_email"),
                busy_slots=[]
            ))
    
    return results

# ========================
# HEALTH CHECK
# ========================

@app.get("/health")
async def health():
    return {"status": "healthy", "service": "calendar-service"}

@app.get("/")
async def root():
    return {
        "service": "Calendar Service",
        "version": "1.0.0",
        "docs": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8010)
