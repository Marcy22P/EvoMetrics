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

# SQLAlchemy (Sincrono per migrazioni/scripts)
# Configurazione pool con pre-ping per gestire connessioni scadute
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # Verifica che la connessione sia valida prima di usarla
    pool_recycle=3600,   # Ricicla connessioni dopo 1 ora
    pool_size=5,         # Dimensione pool
    max_overflow=10      # Connessioni extra oltre al pool
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

database = Database(ASYNC_DATABASE_URL)

