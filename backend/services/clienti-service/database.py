"""
Database connection helper per Clienti Service
"""

import databases
import os
from pathlib import Path
from sqlalchemy import MetaData, Table, Column, String, DateTime, Text, Boolean, ForeignKey

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

# Tabella clienti
clienti_table = Table(
    "clienti",
    metadata,
    Column("id", String(50), primary_key=True),
    Column("nome_azienda", String(255), nullable=False),
    Column("contatti", Text, nullable=True),  # JSON: email, telefono, indirizzo, etc.
    Column("servizi_attivi", Text, nullable=True),  # JSON: ["shopify", "meta_ads", "seo", etc.]
    Column("integrazioni", Text, nullable=True),  # JSON: shopify_shop, meta_ad_account_id, etc.
    Column("note", Text, nullable=True),
    Column("source", String(50), nullable=True),  # "preventivo", "contratto", "manual", "assessment"
    Column("source_id", String(50), nullable=True),  # ID del preventivo/contratto/assessment di origine
    Column("dettagli", Text, nullable=True), # JSON: Nuovi dettagli strutturati (Brand, Canali, Stats, ecc.)
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False)
)

# Tabella magic links per installazione Shopify
magic_links_table = Table(
    "magic_links",
    metadata,
    Column("id", String(50), primary_key=True),
    Column("cliente_id", String(50), ForeignKey("clienti.id"), nullable=False),
    Column("token", String(255), unique=True, nullable=False),
    Column("is_active", Boolean, nullable=False, default=True),
    Column("is_used", Boolean, nullable=False, default=False),
    Column("expires_at", DateTime, nullable=False),
    Column("revoked_at", DateTime, nullable=True),
    Column("created_at", DateTime, nullable=False),
    Column("used_at", DateTime, nullable=True)
)


async def init_database():
    """Initialize database connection"""
    await database.connect()
    print("✅ Database connesso (Clienti Service)")


async def close_database():
    """Close database connection"""
    await database.disconnect()
    print("✅ Database disconnesso (Clienti Service)")
