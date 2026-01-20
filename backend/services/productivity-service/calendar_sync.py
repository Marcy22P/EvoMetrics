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
    Chiama user-service per sincronizzare il task su Google Calendar.
    """
    if not user_id:
        return None
        
    # Se due_date è assente e action è create/update, non possiamo mettere in calendario
    if action != "delete" and not task_data.get("due_date"):
        return None

    # Formatta data
    due_date = task_data.get("due_date")
    if due_date and hasattr(due_date, "isoformat"):
        due_date = due_date.isoformat()
        # Se è datetime con ora 00:00:00, potrebbe essere inteso come data pura?
        # Lasciamo gestire al user-service la logica T
    
    payload = {
        "user_id": int(user_id),
        "task_id": task_data["id"],
        "title": task_data["title"],
        "description": task_data.get("description"),
        "due_date": due_date,
        "google_event_id": google_event_id,
        "action": action
    }

    try:
        # Usa URL interno user-service se disponibile, altrimenti gateway
        # Endpoint: /api/internal/calendar/sync-task
        # Se siamo dietro gateway, user-service è montato su / ? No, le rotte di user-service sono registrate sul router principale.
        # User Service ha rotte /api/users, etc.
        # Quindi l'endpoint è /api/internal/calendar/sync-task
        
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
