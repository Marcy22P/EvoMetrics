"""
Database connection helper per Assessments Service
Usa lazy initialization per evitare TooManyConnectionsError
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

if DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# SSL per Render.com
if DATABASE_URL.startswith("postgresql+asyncpg://") and "sslmode" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}sslmode=prefer"

# Pool ridotto per produzione
DB_POOL_MIN_SIZE = int(os.environ.get("DB_POOL_MIN_SIZE", "1"))
DB_POOL_MAX_SIZE = int(os.environ.get("DB_POOL_MAX_SIZE", "3"))

database = databases.Database(DATABASE_URL, min_size=DB_POOL_MIN_SIZE, max_size=DB_POOL_MAX_SIZE)

# Flag per lazy initialization
_db_initialized = False


async def ensure_database_initialized():
    """Lazy initialization del database"""
    global _db_initialized
    if not _db_initialized:
        try:
            if not database.is_connected:
                await database.connect()
                print("[Assessments] Database connesso (lazy init)")
            _db_initialized = True
        except Exception as e:
            print(f"[Assessments] Errore connessione DB: {e}")
            raise


async def init_database():
    """Initialize database connection"""
    await ensure_database_initialized()


async def close_database():
    """Close database connection"""
    global _db_initialized
    if database.is_connected:
        await database.disconnect()
        _db_initialized = False
        print("[Assessments] Database disconnesso")
