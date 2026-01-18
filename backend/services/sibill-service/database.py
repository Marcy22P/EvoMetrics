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

# Connection pool size configurabile
DB_POOL_MIN_SIZE = int(os.environ.get("DB_POOL_MIN_SIZE", "1"))
DB_POOL_MAX_SIZE = int(os.environ.get("DB_POOL_MAX_SIZE", "3"))

database = Database(DATABASE_URL, min_size=DB_POOL_MIN_SIZE, max_size=DB_POOL_MAX_SIZE)
metadata = MetaData()
Base = declarative_base()

engine = create_engine(DATABASE_URL.replace("+asyncpg", ""))
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

async def init_database():
    await database.connect()

async def close_database():
    await database.disconnect()





