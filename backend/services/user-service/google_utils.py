"""
Google Calendar Utils per User Service
Gestione autenticazione ed eventi
"""
import os
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

# Scopes necessari per Google Calendar
CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
]

APP_CALENDAR_NAME = "Evoluzione Imprese"

def get_oauth_flow(redirect_uri: str) -> Flow:
    """Crea un OAuth flow per Google Calendar"""
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        raise Exception("GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET non configurati")
    
    client_config = {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    
    return Flow.from_client_config(
        client_config,
        scopes=CALENDAR_SCOPES,
        redirect_uri=redirect_uri
    )

def get_auth_url(redirect_uri: str, state: str = None) -> str:
    """Genera URL per autorizzazione Google Calendar"""
    flow = get_oauth_flow(redirect_uri)
    auth_url, _ = flow.authorization_url(
        prompt='consent',
        access_type='offline',
        state=state,
        include_granted_scopes='true'
    )
    return auth_url

def exchange_code_for_tokens(code: str, redirect_uri: str) -> Dict[str, Any]:
    """Scambia authorization code per access/refresh tokens"""
    flow = get_oauth_flow(redirect_uri)
    flow.fetch_token(code=code)
    
    creds = flow.credentials
    
    return {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_expiry": creds.expiry.isoformat() if creds.expiry else None,
    }

def build_credentials(access_token: str, refresh_token: str = None, token_expiry: str = None) -> Credentials:
    """Costruisce oggetto Credentials da tokens salvati"""
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    
    expiry = None
    if token_expiry:
        try:
            expiry = datetime.fromisoformat(token_expiry.replace('Z', '+00:00'))
        except:
            pass
    
    return Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        expiry=expiry
    )

def refresh_credentials_if_needed(creds: Credentials) -> Tuple[Credentials, bool]:
    """Aggiorna le credenziali se scadute. Ritorna (creds, was_refreshed)"""
    if creds.expired and creds.refresh_token:
        try:
            creds.refresh(Request())
            return creds, True
        except Exception as e:
            print(f"❌ Errore refresh token: {e}")
            raise Exception("Token scaduto e refresh fallito. Ricollegare il calendario.")
    return creds, False

def get_calendar_service(access_token: str, refresh_token: str = None, token_expiry: str = None):
    """Ottiene il service Google Calendar con le credenziali fornite"""
    creds = build_credentials(access_token, refresh_token, token_expiry)
    creds, _ = refresh_credentials_if_needed(creds)
    return build('calendar', 'v3', credentials=creds)

def get_calendar_email(service) -> Optional[str]:
    """Ottiene l'email principale del calendario"""
    try:
        calendar = service.calendars().get(calendarId='primary').execute()
        return calendar.get('id')
    except Exception as e:
        print(f"❌ Errore get calendar email: {e}")
        return None

def ensure_app_calendar(service) -> str:
    """
    Assicura che esista il calendario 'Evoluzione Imprese'.
    Ritorna il calendar_id.
    """
    try:
        # 1. Cerca calendario esistente
        calendar_list = service.calendarList().list().execute()
        for calendar_entry in calendar_list.get('items', []):
            if calendar_entry.get('summary') == APP_CALENDAR_NAME:
                return calendar_entry.get('id')
        
        # 2. Se non esiste, crea nuovo
        calendar = {
            'summary': APP_CALENDAR_NAME,
            'timeZone': 'Europe/Rome'
        }
        created_calendar = service.calendars().insert(body=calendar).execute()
        print(f"✅ Creato calendario '{APP_CALENDAR_NAME}' con ID: {created_calendar['id']}")
        return created_calendar['id']
    except Exception as e:
        print(f"❌ Errore ensure_app_calendar: {e}")
        # Fallback a primary se fallisce creazione
        return 'primary'

def _parse_event(event: Dict, calendar_id: str = None) -> Dict[str, Any]:
    """Converte evento Google in formato interno"""
    start = event.get('start', {})
    end = event.get('end', {})
    
    start_dt = start.get('dateTime') or start.get('date')
    end_dt = end.get('dateTime') or end.get('date')
    
    return {
        'id': event.get('id'),
        'summary': event.get('summary', '(Senza titolo)'),
        'description': event.get('description'),
        'start': start_dt,
        'end': end_dt,
        'location': event.get('location'),
        'attendees': [a.get('email') for a in event.get('attendees', [])],
        'creator_email': event.get('creator', {}).get('email'),
        'calendar_id': calendar_id,
        'color_id': event.get('colorId'),
        'html_link': event.get('htmlLink'),
        'is_all_day': 'date' in start and 'dateTime' not in start
    }

def list_events(
    service,
    time_min: datetime = None,
    time_max: datetime = None,
    calendar_id: str = 'primary',
    max_results: int = 250
) -> List[Dict[str, Any]]:
    """Lista eventi da un calendario"""
    try:
        params = {
            'calendarId': calendar_id,
            'maxResults': max_results,
            'singleEvents': True,
            'orderBy': 'startTime'
        }
        
        if time_min:
            params['timeMin'] = time_min.isoformat() + 'Z' if time_min.tzinfo is None else time_min.isoformat()
        if time_max:
            params['timeMax'] = time_max.isoformat() + 'Z' if time_max.tzinfo is None else time_max.isoformat()
        
        events_result = service.events().list(**params).execute()
        events = events_result.get('items', [])
        
        return [_parse_event(e, calendar_id) for e in events]
    except Exception as e:
        print(f"❌ Errore list events: {e}")
        return []

def create_event(
    service,
    summary: str,
    start: str, # ISO format string
    end: str, # ISO format string
    description: str = None,
    location: str = None,
    attendees: List[str] = None,
    calendar_id: str = 'primary',
    target_user_id: str = None # Ignorato qui, gestito dal caller
) -> Dict[str, Any]:
    """Crea un nuovo evento"""
    event_body = {
        'summary': summary,
        'start': {
            'dateTime': start,
            'timeZone': 'Europe/Rome',
        },
        'end': {
            'dateTime': end,
            'timeZone': 'Europe/Rome',
        }
    }
    
    if description:
        event_body['description'] = description
    if location:
        event_body['location'] = location
    if attendees:
        event_body['attendees'] = [{'email': email} for email in attendees]
    
    try:
        event = service.events().insert(
            calendarId=calendar_id,
            body=event_body
        ).execute()
        
        return _parse_event(event, calendar_id)
    except Exception as e:
        print(f"❌ Errore create event: {e}")
        raise e

def delete_event(service, event_id: str, calendar_id: str = 'primary') -> bool:
    try:
        service.events().delete(calendarId=calendar_id, eventId=event_id).execute()
        return True
    except Exception as e:
        print(f"❌ Errore delete event: {e}")
        return False

def get_freebusy(
    service,
    time_min: datetime,
    time_max: datetime,
    calendar_ids: List[str]
) -> Dict[str, List[Dict]]:
    try:
        body = {
            'timeMin': time_min.isoformat() + 'Z' if time_min.tzinfo is None else time_min.isoformat(),
            'timeMax': time_max.isoformat() + 'Z' if time_max.tzinfo is None else time_max.isoformat(),
            'items': [{'id': cal_id} for cal_id in calendar_ids]
        }
        result = service.freebusy().query(body=body).execute()
        calendars = result.get('calendars', {})
        freebusy = {}
        for cal_id, data in calendars.items():
            freebusy[cal_id] = data.get('busy', [])
        return freebusy
    except Exception as e:
        print(f"❌ Errore get freebusy: {e}")
        return {}
