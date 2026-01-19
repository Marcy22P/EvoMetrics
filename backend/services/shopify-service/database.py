"""
Database connection helper per Shopify Service
"""

import databases
import os
from pathlib import Path
from sqlalchemy import MetaData, Table, Column, String, DateTime, Text, Boolean

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


database = databases.Database(DATABASE_URL) if (DB_POOL_MIN_SIZE == 0 and DB_POOL_MAX_SIZE == 10) else databases.Database(DATABASE_URL, min_size=DB_POOL_MIN_SIZE, max_size=DB_POOL_MAX_SIZE)

# Metadata per definire le tabelle
metadata = MetaData()

# Tabella integrazioni Shopify
shopify_integrations_table = Table(
    "shopify_integrations",
    metadata,
    Column("id", String(50), primary_key=True),
    Column("cliente_id", String(50), nullable=False),
    Column("shop", String(255), nullable=False, unique=True),
    Column("access_token", Text, nullable=False),  # Token cifrato
    Column("scope", Text, nullable=True),
    Column("is_active", Boolean, nullable=False, default=True),
    Column("installed_at", DateTime, nullable=True),
    Column("uninstalled_at", DateTime, nullable=True),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False)
)


async def init_database():
    """Inizializza connessione database"""
    await database.connect()


async def close_database():
    """Chiudi connessione database"""
    await database.disconnect()

