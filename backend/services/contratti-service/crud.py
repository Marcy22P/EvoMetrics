from typing import List, Dict, Any
from database import database, ensure_database_initialized

async def get_all_contratti() -> List[Dict[str, Any]]:
    """Ottiene tutti i contratti dal database"""
    # Lazy initialization: connetti solo quando necessario
    await ensure_database_initialized()
    
    query = "SELECT * FROM contratti ORDER BY created_at DESC"
    rows = await database.fetch_all(query)
    return [dict(row) for row in rows]



