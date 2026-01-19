import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from databases import Database

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

# Fix per Render/Heroku che usano ancora postgres://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# IMPORTANTE: SQLAlchemy sincrono usa psycopg2, non asyncpg
# Rimuovi +asyncpg se presente e assicurati di usare psycopg2
SYNC_DATABASE_URL = DATABASE_URL
if "+asyncpg" in SYNC_DATABASE_URL:
    SYNC_DATABASE_URL = SYNC_DATABASE_URL.replace("+asyncpg", "+psycopg2")
    print(f"🔄 DATABASE_URL convertito da asyncpg a psycopg2 per SQLAlchemy sincrono")
elif SYNC_DATABASE_URL.startswith("postgresql://") and "+" not in SYNC_DATABASE_URL:
    # Se è postgresql:// senza driver, aggiungi psycopg2
    SYNC_DATABASE_URL = SYNC_DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
    print(f"🔄 DATABASE_URL aggiornato con driver psycopg2 per SQLAlchemy sincrono")

print(f"📊 MCP Service - DATABASE_URL sincrono: {SYNC_DATABASE_URL.split('@')[-1] if '@' in SYNC_DATABASE_URL else 'local'}")

# SQLAlchemy (Sincrono per migrazioni/scripts)
# Configurazione pool con pre-ping per gestire connessioni scadute
# Connection pool size ridotto per evitare saturazione in produzione
DB_POOL_SIZE = int(os.environ.get("DB_POOL_SIZE", "1"))  # Ridotto da 5 a 1
DB_POOL_MAX_OVERFLOW = int(os.environ.get("DB_POOL_MAX_OVERFLOW", "2"))  # Ridotto da 10 a 2

# Configurazione connect_args per PostgreSQL
postgresql_connect_args = {}
if SYNC_DATABASE_URL.startswith("postgresql"):
    # Render.com PostgreSQL: prova prima con prefer (più permissivo), poi require se necessario
    ssl_mode = os.environ.get("POSTGRES_SSL_MODE", "prefer")  # prefer, require, verify-ca, verify-full
    postgresql_connect_args = {
        "connect_timeout": 30,  # Timeout connessione 30 secondi
        "sslmode": ssl_mode,
        "options": "-c statement_timeout=60000"  # Timeout statement 60 secondi
    }
    print(f"🔒 SSL configurato per PostgreSQL (sslmode={ssl_mode})")

engine = create_engine(
    SYNC_DATABASE_URL,
    pool_pre_ping=True,  # Verifica che la connessione sia valida prima di usarla
    pool_recycle=3600,   # Ricicla connessioni dopo 1 ora
    pool_size=DB_POOL_SIZE,         # Dimensione pool ridotta
    max_overflow=DB_POOL_MAX_OVERFLOW,      # Connessioni extra ridotte
    connect_args=postgresql_connect_args
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Databases (Asincrono per FastAPI)
# Assicurati che l'URL sia asincrono
if not DATABASE_URL.startswith("postgresql+asyncpg://"):
    # Se è postgresql:// converti in postgresql+asyncpg://
    ASYNC_DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
else:
    ASYNC_DATABASE_URL = DATABASE_URL

# Connection pool size configurabile - ridotto per evitare saturazione in produzione
DB_POOL_MIN_SIZE = int(os.environ.get("DB_POOL_MIN_SIZE", "0"))  # 0 = nessuna connessione iniziale
DB_POOL_MAX_SIZE = int(os.environ.get("DB_POOL_MAX_SIZE", "1"))  # 1 = massimo 1 connessione per servizio

database = Database(ASYNC_DATABASE_URL, min_size=DB_POOL_MIN_SIZE, max_size=DB_POOL_MAX_SIZE)

