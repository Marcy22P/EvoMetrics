from sqlalchemy import create_engine, Column, String, Integer, DateTime, JSON, Text, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime
import os

# Database URL configurabile
# In produzione reale (su Render.com), questa variabile dovrebbe essere esplicita
# In sviluppo, usa default locale per comodità
# Rileva produzione reale SOLO se siamo effettivamente su Render.com
# (RENDER_EXTERNAL_HOSTNAME è presente solo su Render.com, non nel .env locale)
IS_REAL_PRODUCTION = os.environ.get("RENDER_EXTERNAL_HOSTNAME") is not None

DATABASE_URL = os.environ.get("SALES_DATABASE_URL")

if not DATABASE_URL:
    if IS_REAL_PRODUCTION:
        # In produzione reale su Render.com, richiedi esplicitamente la configurazione
        raise ValueError("SALES_DATABASE_URL environment variable is required in production")
    else:
        # In sviluppo (locale o con RENDER=true nel .env), usa default locale
        DATABASE_URL = "sqlite:///./sales.db"
        print("⚠️ SALES_DATABASE_URL non configurato, uso default locale (sviluppo)")

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class PipelineStage(Base):
    __tablename__ = "pipeline_stages"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String, unique=True, index=True)
    label = Column(String)
    color = Column(String, default="base")
    index = Column(Integer, default=0)
    is_system = Column(Boolean, default=False)

class Lead(Base):
    __tablename__ = "leads"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    stage = Column(String, default="optin")
    source = Column(String, default="manual")
    clickfunnels_data = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

def init_db():
    Base.metadata.create_all(bind=engine)
    print("✅ Schema sales aggiornato.")
    
    db = SessionLocal()
    count = db.query(PipelineStage).count()
    
    if count == 0:
        print("🌱 Seeding default stages...")
        default_stages = [
            PipelineStage(key="optin", label="Optin", color="success", index=0, is_system=False),
            PipelineStage(key="prima_chiamata", label="Prima Chiamata", color="info", index=1, is_system=False),
            PipelineStage(key="preventivo_consegnato", label="Preventivo Consegnato", color="warning", index=2, is_system=False),
            PipelineStage(key="seconda_chiamata", label="Seconda Chiamata", color="critical", index=3, is_system=False),
            PipelineStage(key="cliente", label="Cliente", color="success", index=4, is_system=False),
            PipelineStage(key="archiviato", label="Archiviato", color="base", index=5, is_system=False),
        ]
        db.add_all(default_stages)
        db.commit()
        print("✅ Default stages seeded.")
    db.close()
