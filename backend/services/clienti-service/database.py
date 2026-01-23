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

# Pool MOLTO ridotto per evitare TooManyConnections
database = databases.Database(DATABASE_URL, min_size=0, max_size=2)

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

# Tabella assegnazione clienti a utenti (molti-a-molti)
cliente_assignees_table = Table(
    "cliente_assignees",
    metadata,
    Column("id", String(50), primary_key=True),
    Column("cliente_id", String(50), ForeignKey("clienti.id"), nullable=False),
    Column("user_id", String(50), nullable=False),  # ID dell'utente assegnato
    Column("assigned_at", DateTime, nullable=False),
    Column("assigned_by", String(50), nullable=True),  # Chi ha fatto l'assegnazione
)


async def init_database():
    """Initialize database connection and ensure tables exist"""
    await database.connect()
    print("✅ Database connesso (Clienti Service)")
    
    # Crea tabella cliente_assignees se non esiste
    try:
        await database.execute("""
            CREATE TABLE IF NOT EXISTS cliente_assignees (
                id VARCHAR(50) PRIMARY KEY,
                cliente_id VARCHAR(50) NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
                user_id VARCHAR(50) NOT NULL,
                assigned_at TIMESTAMP NOT NULL,
                assigned_by VARCHAR(50),
                UNIQUE(cliente_id, user_id)
            )
        """)
        # Crea indice per query veloci
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_cliente_assignees_user_id ON cliente_assignees(user_id)
        """)
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_cliente_assignees_cliente_id ON cliente_assignees(cliente_id)
        """)
        print("✅ Tabella cliente_assignees verificata/creata")
    except Exception as e:
        print(f"⚠️ Errore creazione tabella cliente_assignees: {e}")


async def close_database():
    """Close database connection"""
    await database.disconnect()
    print("✅ Database disconnesso (Clienti Service)")
