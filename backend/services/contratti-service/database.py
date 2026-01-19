"""
Database connection helper per Contratti Service
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


# Ottimizzazione pool: min 1, max 3 connessioni per evitare saturazione in unified mode
database = databases.Database(DATABASE_URL) if (DB_POOL_MIN_SIZE == 0 and DB_POOL_MAX_SIZE == 10) else databases.Database(DATABASE_URL, min_size=DB_POOL_MIN_SIZE, max_size=DB_POOL_MAX_SIZE)


_db_initialized = False

async def init_database():
    """Initialize database connection (lazy initialization)"""
    global _db_initialized
    if _db_initialized and database.is_connected:
        return
    
    try:
        if not database.is_connected:
            await database.connect()
            print("✅ Database connesso (Contratti Service - lazy)")
        
        # Aggiungi colonna cliente_id se non esiste
        try:
            await database.execute("ALTER TABLE contratti ADD COLUMN IF NOT EXISTS cliente_id TEXT")
            print("✅ Colonna cliente_id aggiunta/verificata in contratti")
        except Exception as e:
            print(f"⚠️ Warning aggiunta colonna cliente_id: {e}")
        
        _db_initialized = True
    except Exception as e:
        print(f"⚠️ Errore inizializzazione database Contratti Service: {e}")
        raise

async def ensure_database_initialized():
    """Garantisce che il database sia connesso e inizializzato. Usa lazy initialization."""
    global _db_initialized
    if _db_initialized and database.is_connected:
        return
    
    if not database:
        raise Exception("Database non configurato")
    
    try:
        if not database.is_connected:
            await database.connect()
            print("✅ Database connesso (Contratti Service - lazy)")
        
        if not _db_initialized:
            await init_database()
    except Exception as e:
        error_msg = str(e)
        print(f"⚠️ Errore inizializzazione database lazy: {error_msg[:200]}...")
        raise


async def close_database():
    """Close database connection"""
    await database.disconnect()
    print("✅ Database disconnesso (Contratti Service)")

