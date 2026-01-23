import os
import httpx
from typing import Optional

# Per chiamate interne, usa l'URL diretto Render (bypassa Cloudflare)
# RENDER_INTERNAL_URL è l'URL .onrender.com diretto
# GATEWAY_URL potrebbe essere il dominio pubblico con Cloudflare
INTERNAL_URL = os.environ.get("RENDER_INTERNAL_URL") or os.environ.get("GATEWAY_URL") or os.environ.get("BASE_URL")
if not INTERNAL_URL:
    raise ValueError("RENDER_INTERNAL_URL, GATEWAY_URL o BASE_URL deve essere configurato")

async def sync_task_to_calendar(user_id: str, task_data: dict, action: str = "create", google_event_id: Optional[str] = None):
    """
    Chiama user-service per sincronizzare il task/evento su Google Calendar.
    
    - Se item_type='event': crea un evento con orario specifico e partecipanti
    - Se item_type='task': crea un task nel calendario (promemoria all-day)
    """
    if not user_id:
        return None
    
    item_type = task_data.get("item_type", "task")
    
    # Per eventi, servono date e orari specifici
    if item_type == "event":
        if action != "delete" and not (task_data.get("event_start_time") or task_data.get("due_date")):
            return None
    else:
        # Per task, serve almeno due_date
        if action != "delete" and not task_data.get("due_date"):
            return None

    # Formatta le date
    def format_date(dt):
        if dt and hasattr(dt, "isoformat"):
            return dt.isoformat()
        return dt
    
    due_date = format_date(task_data.get("due_date"))
    event_start_time = format_date(task_data.get("event_start_time"))
    event_end_time = format_date(task_data.get("event_end_time"))
    
    payload = {
        "user_id": int(user_id),
        "task_id": task_data["id"],
        "title": task_data["title"],
        "description": task_data.get("description"),
        "due_date": due_date,
        "google_event_id": google_event_id,
        "action": action,
        # Nuovi campi per eventi
        "item_type": item_type,
        "event_start_time": event_start_time,
        "event_end_time": event_end_time,
        "event_participants": task_data.get("event_participants", [])
    }

    try:
        url = f"{INTERNAL_URL}/api/internal/calendar/sync-task"
        
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json=payload, timeout=10.0)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("google_event_id")
            else:
                print(f"Sync failed: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"Calendar Sync Error: {e}")
        return None
