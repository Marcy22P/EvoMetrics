import os
from databases import Database
from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

# Fix per Render/Postgres
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Aggiungi parametri SSL per Render.com se non presenti
# Render.com richiede SSL, ma asyncpg ha bisogno di sslmode=prefer nell'URL
if DATABASE_URL and DATABASE_URL.startswith("postgresql+asyncpg://") and "sslmode" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}sslmode=prefer"
    print(f"🔒 SSL mode aggiunto all'URL per Render.com")

# Pool MOLTO ridotto per evitare TooManyConnections
database = Database(DATABASE_URL, min_size=0, max_size=2)
metadata = MetaData()
Base = declarative_base()

engine = create_engine(DATABASE_URL.replace("+asyncpg", ""))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

async def init_database():
    await database.connect()

async def close_database():
    await database.disconnect()





