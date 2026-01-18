"""
Google Calendar API wrapper
Gestisce operazioni CRUD sugli eventi calendario
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
        return calendar.get('id')  # L'ID del calendario primary è l'email
    except Exception as e:
        print(f"❌ Errore get calendar email: {e}")
        return None

def list_events(
    service,
    time_min: datetime = None,
    time_max: datetime = None,
    calendar_id: str = 'primary',
    max_results: int = 100
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

def _parse_event(event: Dict, calendar_id: str = None) -> Dict[str, Any]:
    """Converte evento Google in formato interno"""
    start = event.get('start', {})
    end = event.get('end', {})
    
    # Google restituisce dateTime per eventi con orario, date per eventi tutto il giorno
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

def create_event(
    service,
    summary: str,
    start: datetime,
    end: datetime,
    description: str = None,
    location: str = None,
    attendees: List[str] = None,
    calendar_id: str = 'primary',
    color_id: str = None,
    recurrence: List[str] = None
) -> Dict[str, Any]:
    """Crea un nuovo evento"""
    event_body = {
        'summary': summary,
        'start': {
            'dateTime': start.isoformat(),
            'timeZone': 'Europe/Rome',
        },
        'end': {
            'dateTime': end.isoformat(),
            'timeZone': 'Europe/Rome',
        }
    }
    
    if description:
        event_body['description'] = description
    if location:
        event_body['location'] = location
    if attendees:
        event_body['attendees'] = [{'email': email} for email in attendees]
    if color_id:
        event_body['colorId'] = color_id
    if recurrence:
        event_body['recurrence'] = recurrence
    
    try:
        event = service.events().insert(
            calendarId=calendar_id,
            body=event_body,
            sendUpdates='all' if attendees else 'none'
        ).execute()
        
        return _parse_event(event, calendar_id)
    except Exception as e:
        print(f"❌ Errore create event: {e}")
        raise e

def update_event(
    service,
    event_id: str,
    calendar_id: str = 'primary',
    **updates
) -> Dict[str, Any]:
    """Aggiorna un evento esistente"""
    try:
        # Prima ottieni l'evento esistente
        event = service.events().get(calendarId=calendar_id, eventId=event_id).execute()
        
        # Applica aggiornamenti
        if 'summary' in updates and updates['summary']:
            event['summary'] = updates['summary']
        if 'description' in updates:
            event['description'] = updates['description']
        if 'location' in updates:
            event['location'] = updates['location']
        if 'start' in updates and updates['start']:
            event['start'] = {'dateTime': updates['start'].isoformat(), 'timeZone': 'Europe/Rome'}
        if 'end' in updates and updates['end']:
            event['end'] = {'dateTime': updates['end'].isoformat(), 'timeZone': 'Europe/Rome'}
        if 'attendees' in updates:
            event['attendees'] = [{'email': email} for email in (updates['attendees'] or [])]
        if 'color_id' in updates and updates['color_id']:
            event['colorId'] = updates['color_id']
        
        updated = service.events().update(
            calendarId=calendar_id,
            eventId=event_id,
            body=event,
            sendUpdates='all' if event.get('attendees') else 'none'
        ).execute()
        
        return _parse_event(updated, calendar_id)
    except Exception as e:
        print(f"❌ Errore update event: {e}")
        raise e

def delete_event(service, event_id: str, calendar_id: str = 'primary') -> bool:
    """Elimina un evento"""
    try:
        service.events().delete(
            calendarId=calendar_id,
            eventId=event_id,
            sendUpdates='all'
        ).execute()
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
    """
    Ottiene disponibilità/occupazione per più calendari.
    Ritorna {calendar_id: [{"start": ..., "end": ...}, ...]}
    """
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
            busy_slots = data.get('busy', [])
            freebusy[cal_id] = busy_slots
        
        return freebusy
    except Exception as e:
        print(f"❌ Errore get freebusy: {e}")
        return {}
