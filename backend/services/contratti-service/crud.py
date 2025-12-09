from typing import List, Dict, Any
from database import database

async def get_all_contratti() -> List[Dict[str, Any]]:
    """Ottiene tutti i contratti dal database"""
    query = "SELECT * FROM contratti ORDER BY created_at DESC"
    rows = await database.fetch_all(query)
    return [dict(row) for row in rows]



