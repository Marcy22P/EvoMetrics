from typing import List, Dict, Any
from database import database, init_database
from serializers import serialize_preventivo

async def get_all_preventivi() -> List[Dict[str, Any]]:
    """Ottiene tutti i preventivi dal database"""
    # Assicurati che il database sia connesso
    if not database.is_connected:
        await init_database()
    
    query = "SELECT * FROM preventivi ORDER BY created_at DESC"
    rows = await database.fetch_all(query)
    
    preventivi = []
    for row in rows:
        try:
            preventivo_dict = serialize_preventivo(dict(row))
            preventivi.append(preventivo_dict)
        except Exception as row_error:
            print(f"❌ Errore processando riga preventivo in crud: {row_error}")
            continue
            
    return preventivi
