from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

class CalendarToken(BaseModel):
    """Token OAuth per calendario Google di un utente"""
    user_id: str
    access_token: str
    refresh_token: Optional[str] = None
    token_expiry: Optional[datetime] = None
    calendar_email: Optional[str] = None
    connected_at: datetime
    
class CalendarTokenCreate(BaseModel):
    user_id: str
    access_token: str
    refresh_token: Optional[str] = None
    token_expiry: Optional[datetime] = None
    calendar_email: Optional[str] = None

class CalendarEvent(BaseModel):
    """Evento calendario"""
    id: Optional[str] = None
    summary: str  # Titolo
    description: Optional[str] = None
    start: datetime
    end: datetime
    location: Optional[str] = None
    attendees: List[str] = []  # Email partecipanti
    creator_email: Optional[str] = None
    calendar_id: Optional[str] = None  # ID calendario Google
    color_id: Optional[str] = None
    recurrence: Optional[List[str]] = None  # Per eventi ricorrenti
    
class CalendarEventCreate(BaseModel):
    """Creazione evento"""
    summary: str
    description: Optional[str] = None
    start: datetime
    end: datetime
    location: Optional[str] = None
    attendees: List[str] = []
    target_user_id: Optional[str] = None  # Per admin: su quale calendario creare
    color_id: Optional[str] = None
    recurrence: Optional[List[str]] = None

class CalendarEventUpdate(BaseModel):
    """Aggiornamento evento"""
    summary: Optional[str] = None
    description: Optional[str] = None
    start: Optional[datetime] = None
    end: Optional[datetime] = None
    location: Optional[str] = None
    attendees: Optional[List[str]] = None
    color_id: Optional[str] = None

class UserCalendarInfo(BaseModel):
    """Info calendario collegato di un utente"""
    user_id: str
    username: str
    nome: Optional[str] = None
    cognome: Optional[str] = None
    calendar_email: Optional[str] = None
    is_connected: bool
    connected_at: Optional[datetime] = None
    
class FreeBusyRequest(BaseModel):
    """Richiesta disponibilità"""
    start: datetime
    end: datetime
    user_ids: Optional[List[str]] = None  # Se vuoto, tutti gli utenti collegati
    
class FreeBusySlot(BaseModel):
    """Slot occupato"""
    start: datetime
    end: datetime
    
class FreeBusyResponse(BaseModel):
    """Risposta disponibilità per utente"""
    user_id: str
    username: str
    calendar_email: Optional[str] = None
    busy_slots: List[FreeBusySlot] = []
