"""
Database connection helper per Subtitle Service
Segue pattern identico a clienti-service/database.py:
  - databases (asyncpg) per query async
  - SQLAlchemy metadata per definizioni tabelle
  - CREATE TABLE IF NOT EXISTS nel init_database()
"""

import databases
import os
from pathlib import Path
from sqlalchemy import MetaData, Table, Column, String, Integer, DateTime, Text, Boolean, Float
from sqlalchemy.orm import declarative_base

# Compatibilita' con altri servizi che possono importare da questo modulo
# per errore a causa del conflitto sys.path in unified mode.
# mcp-service importa `Base`, sales-service importa `engine` e `SessionLocal`.
Base = declarative_base()
engine = None
SessionLocal = None

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
    print(f"✅ DATABASE_URL aggiornato con +asyncpg (Subtitle Service): {DATABASE_URL[:50]}...")

# Aggiungi parametri SSL per Render.com se non presenti
if DATABASE_URL.startswith("postgresql+asyncpg://") and "sslmode" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}sslmode=prefer"
    print(f"🔒 SSL mode aggiunto all'URL per Render.com (Subtitle Service)")

# Pool ridotto per evitare TooManyConnections (come tutti gli altri servizi)
database = databases.Database(DATABASE_URL, min_size=0, max_size=2)

# Metadata per definire le tabelle
metadata = MetaData()

# ========================
# TABELLA: subtitle_jobs
# ========================
subtitle_jobs_table = Table(
    "subtitle_jobs",
    metadata,
    Column("id", String(50), primary_key=True),
    Column("cliente_id", String(50), nullable=False),
    Column("content_type", String(20), nullable=False),  # "organico" | "paid_ads"
    Column("input_drive_file_id", String(255), nullable=False),
    Column("input_drive_file_name", String(500), nullable=True),
    Column("status", String(20), nullable=False, default="draft"),
    Column("progress", Integer, nullable=False, default=0),
    Column("error_message", Text, nullable=True),
    Column("retry_count", Integer, nullable=False, default=0),
    Column("created_by_user_id", String(50), nullable=True),
    Column("assigned_reviewer_id", String(50), nullable=True),
    Column("next_action", String(100), nullable=True),
    Column("metadata", Text, nullable=True),  # JSONB serializzato come TEXT
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

# ========================
# TABELLA: subtitle_versions
# ========================
subtitle_versions_table = Table(
    "subtitle_versions",
    metadata,
    Column("id", String(50), primary_key=True),
    Column("job_id", String(50), nullable=False),  # FK logica a subtitle_jobs.id
    Column("version", Integer, nullable=False),  # 1=AI, 2=revised, 3=approved
    Column("content", Text, nullable=True),  # JSON array di segmenti
    Column("drive_srt_file_id", String(255), nullable=True),
    Column("drive_lrc_file_id", String(255), nullable=True),
    Column("drive_ass_file_id", String(255), nullable=True),
    Column("drive_dump_file_id", String(255), nullable=True),
    Column("notes", Text, nullable=True),
    Column("created_at", DateTime, nullable=False),
    Column("created_by_user_id", String(50), nullable=True),
)

# ========================
# TABELLA: subtitle_events (audit log)
# ========================
subtitle_events_table = Table(
    "subtitle_events",
    metadata,
    Column("id", String(50), primary_key=True),
    Column("job_id", String(50), nullable=False),  # FK logica a subtitle_jobs.id
    Column("event_type", String(50), nullable=False),
    Column("user_id", String(50), nullable=True),
    Column("details", Text, nullable=True),  # JSON
    Column("created_at", DateTime, nullable=False),
)


# ========================
# TABELLA: content_comments
# ========================
content_comments_table = Table(
    "content_comments",
    metadata,
    Column("id", String(50), primary_key=True),
    Column("drive_file_id", String(255), nullable=False),
    Column("cliente_id", String(50), nullable=False),
    Column("user_id", String(50), nullable=False),
    Column("user_name", String(200), nullable=True),
    Column("content", Text, nullable=False),
    Column("parent_id", String(50), nullable=True),  # NULL = top-level
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)


async def init_database():
    """Initialize database connection and ensure tables exist"""
    await database.connect()
    print("✅ Database connesso (Subtitle Service)")

    # Crea tabella subtitle_jobs se non esiste
    try:
        await database.execute("""
            CREATE TABLE IF NOT EXISTS subtitle_jobs (
                id VARCHAR(50) PRIMARY KEY,
                cliente_id VARCHAR(50) NOT NULL,
                content_type VARCHAR(20) NOT NULL DEFAULT 'organico',
                input_drive_file_id VARCHAR(255) NOT NULL,
                input_drive_file_name VARCHAR(500),
                status VARCHAR(20) NOT NULL DEFAULT 'draft',
                progress INTEGER NOT NULL DEFAULT 0,
                error_message TEXT,
                retry_count INTEGER NOT NULL DEFAULT 0,
                created_by_user_id VARCHAR(50),
                assigned_reviewer_id VARCHAR(50),
                next_action VARCHAR(100),
                metadata TEXT,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            )
        """)
        # Indici per query frequenti
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_subtitle_jobs_cliente_id ON subtitle_jobs(cliente_id)
        """)
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_subtitle_jobs_status ON subtitle_jobs(status)
        """)
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_subtitle_jobs_created_by ON subtitle_jobs(created_by_user_id)
        """)
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_subtitle_jobs_reviewer ON subtitle_jobs(assigned_reviewer_id)
        """)
        print("✅ Tabella subtitle_jobs verificata/creata")
    except Exception as e:
        print(f"⚠️ Errore creazione tabella subtitle_jobs: {e}")

    # Crea tabella subtitle_versions se non esiste
    try:
        await database.execute("""
            CREATE TABLE IF NOT EXISTS subtitle_versions (
                id VARCHAR(50) PRIMARY KEY,
                job_id VARCHAR(50) NOT NULL REFERENCES subtitle_jobs(id) ON DELETE CASCADE,
                version INTEGER NOT NULL,
                content TEXT,
                drive_srt_file_id VARCHAR(255),
                drive_lrc_file_id VARCHAR(255),
                drive_ass_file_id VARCHAR(255),
                drive_dump_file_id VARCHAR(255),
                notes TEXT,
                created_at TIMESTAMP NOT NULL,
                created_by_user_id VARCHAR(50),
                UNIQUE(job_id, version)
            )
        """)
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_subtitle_versions_job_id ON subtitle_versions(job_id)
        """)
        print("✅ Tabella subtitle_versions verificata/creata")
    except Exception as e:
        print(f"⚠️ Errore creazione tabella subtitle_versions: {e}")

    # Crea tabella subtitle_events se non esiste
    try:
        await database.execute("""
            CREATE TABLE IF NOT EXISTS subtitle_events (
                id VARCHAR(50) PRIMARY KEY,
                job_id VARCHAR(50) NOT NULL REFERENCES subtitle_jobs(id) ON DELETE CASCADE,
                event_type VARCHAR(50) NOT NULL,
                user_id VARCHAR(50),
                details TEXT,
                created_at TIMESTAMP NOT NULL
            )
        """)
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_subtitle_events_job_id ON subtitle_events(job_id)
        """)
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_subtitle_events_type ON subtitle_events(event_type)
        """)
        print("✅ Tabella subtitle_events verificata/creata")
    except Exception as e:
        print(f"⚠️ Errore creazione tabella subtitle_events: {e}")

    # Crea tabella content_comments se non esiste
    try:
        await database.execute("""
            CREATE TABLE IF NOT EXISTS content_comments (
                id VARCHAR(50) PRIMARY KEY,
                drive_file_id VARCHAR(255) NOT NULL,
                cliente_id VARCHAR(50) NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                user_name VARCHAR(200),
                content TEXT NOT NULL,
                parent_id VARCHAR(50),
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            )
        """)
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_comments_file ON content_comments(drive_file_id)
        """)
        await database.execute("""
            CREATE INDEX IF NOT EXISTS idx_comments_cliente ON content_comments(cliente_id)
        """)
        print("✅ Tabella content_comments verificata/creata")
    except Exception as e:
        print(f"⚠️ Errore creazione tabella content_comments: {e}")


async def close_database():
    """Close database connection"""
    await database.disconnect()
    print("✅ Database disconnesso (Subtitle Service)")
