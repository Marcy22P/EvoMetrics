from typing import List, Dict, Any
from database import database, init_database

async def get_all_contratti() -> List[Dict[str, Any]]:
    """Ottiene tutti i contratti dal database"""
    # Assicurati che il database sia connesso
    if not database.is_connected:
        await init_database()
    
    query = "SELECT * FROM contratti ORDER BY created_at DESC"
    rows = await database.fetch_all(query)
    return [dict(row) for row in rows]



