"""
Database connection helper per Gradimento Service
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
    print(f"✅ DATABASE_URL aggiornato con +asyncpg: {DATABASE_URL[:50]}...")

# Aggiungi parametri SSL per Render.com se non presenti
# Render.com richiede SSL, ma asyncpg ha bisogno di sslmode=prefer nell'URL
if DATABASE_URL.startswith("postgresql+asyncpg://") and "sslmode" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}sslmode=prefer"
    print(f"🔒 SSL mode aggiunto all'URL per Render.com")

# Connection pool size configurabile - ridotto per evitare saturazione in produzione
DB_POOL_MIN_SIZE = int(os.environ.get("DB_POOL_MIN_SIZE", "0"))  # Default 0 (come Database() senza parametri)
DB_POOL_MAX_SIZE = int(os.environ.get("DB_POOL_MAX_SIZE", "10"))  # Default 10 (come Database() senza parametri)


# Ottimizzazione pool: min 1, max 3 connessioni
database = databases.Database(DATABASE_URL) if (DB_POOL_MIN_SIZE == 0 and DB_POOL_MAX_SIZE == 10) else databases.Database(DATABASE_URL, min_size=DB_POOL_MIN_SIZE, max_size=DB_POOL_MAX_SIZE)

# Flag per tracciare se il database è stato inizializzato
_db_initialized = False


async def ensure_database_initialized():
    """Lazy initialization: connetti al database solo se non già connesso"""
    global _db_initialized
    if not _db_initialized:
        try:
            if not database.is_connected:
                await database.connect()
            _db_initialized = True
            print("✅ Database connesso (Gradimento Service - lazy init)")
        except Exception as e:
            print(f"⚠️ Errore connessione database (Gradimento Service): {e}")
            # Non bloccare l'applicazione, riproverà al prossimo accesso
            _db_initialized = False


async def init_database():
    """Initialize database connection (deprecated, use ensure_database_initialized)"""
    await ensure_database_initialized()


async def close_database():
    """Close database connection"""
    global _db_initialized
    try:
        if database.is_connected:
            await database.disconnect()
        _db_initialized = False
        print("✅ Database disconnesso (Gradimento Service)")
    except Exception as e:
        print(f"⚠️ Errore disconnessione database (Gradimento Service): {e}")

