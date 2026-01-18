"""
Database connection per Auth Service
"""

import databases
import os
from pathlib import Path

# Carica variabili d'ambiente dalla root del progetto
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

# Database configuration
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

# Aggiungi +asyncpg se mancante
if DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    print(f"✅ DATABASE_URL aggiornato con +asyncpg: {DATABASE_URL[:50]}...")

# Connection pool size configurabile
DB_POOL_MIN_SIZE = int(os.environ.get("DB_POOL_MIN_SIZE", "1"))
DB_POOL_MAX_SIZE = int(os.environ.get("DB_POOL_MAX_SIZE", "3"))

# Database setup
# Ottimizzazione pool: min 1, max 3 connessioni per evitare saturazione in unified mode
database = databases.Database(DATABASE_URL, min_size=DB_POOL_MIN_SIZE, max_size=DB_POOL_MAX_SIZE)

async def init_database():
    """Initialize database connection"""
    await database.connect()
    print("✅ Database connesso (Auth Service)")

async def close_database():
    """Close database connection"""
    await database.disconnect()
    print("✅ Database disconnesso (Auth Service)")
