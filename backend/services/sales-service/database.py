from sqlalchemy import create_engine, Column, String, Integer, DateTime, JSON, Text, Boolean, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import datetime
import os
from pathlib import Path

# Database URL configurabile
# In produzione reale (su Render.com), usa PostgreSQL (DATABASE_URL principale)
# In sviluppo, usa default SQLite locale per comodità
# Rileva produzione reale SOLO se siamo effettivamente su Render.com
# (RENDER_EXTERNAL_HOSTNAME è presente solo su Render.com, non nel .env locale)
# Nota: Non usato più per la logica database, mantenuto solo per compatibilità
IS_REAL_PRODUCTION = os.environ.get("RENDER_EXTERNAL_HOSTNAME") is not None

# Sales Pipeline usa lo stesso database PostgreSQL principale (DATABASE_URL) come tutti gli altri servizi
# Coerente con tutti gli altri servizi: stesso database in sviluppo e produzione
DATABASE_URL = os.environ.get("SALES_DATABASE_URL")

if not DATABASE_URL:
    # Usa DATABASE_URL principale (PostgreSQL) - stesso database di tutti gli altri servizi
    MAIN_DATABASE_URL = os.environ.get("DATABASE_URL")
    if not MAIN_DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable is required")
    
    # IMPORTANTE: SQLAlchemy sincrono usa psycopg2, non asyncpg
    if "+asyncpg" in MAIN_DATABASE_URL:
        DATABASE_URL = MAIN_DATABASE_URL.replace("+asyncpg", "+psycopg2")
        print("🔄 DATABASE_URL convertito da asyncpg a psycopg2 per SQLAlchemy sincrono")
    elif MAIN_DATABASE_URL.startswith("postgresql://") and "+" not in MAIN_DATABASE_URL:
        DATABASE_URL = MAIN_DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
        print("🔄 DATABASE_URL aggiornato con driver psycopg2 per SQLAlchemy sincrono")
    else:
        DATABASE_URL = MAIN_DATABASE_URL
    
    print("✅ Sales Service: uso DATABASE_URL principale (PostgreSQL condiviso)")
    print(f"📊 Sales Service - Database: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else 'local'}")
else:
    # SALES_DATABASE_URL è configurato esplicitamente (override)
    # Se è PostgreSQL, converti per SQLAlchemy sincrono (usa psycopg2, non asyncpg)
    if DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgresql+asyncpg://"):
        # IMPORTANTE: SQLAlchemy sincrono usa psycopg2, non asyncpg
        if "+asyncpg" in DATABASE_URL:
            DATABASE_URL = DATABASE_URL.replace("+asyncpg", "+psycopg2")
            print("🔄 SALES_DATABASE_URL convertito da asyncpg a psycopg2 per SQLAlchemy sincrono")
        elif DATABASE_URL.startswith("postgresql://") and "+" not in DATABASE_URL:
            DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
            print("🔄 SALES_DATABASE_URL aggiornato con driver psycopg2 per SQLAlchemy sincrono")
        
        print(f"📊 Sales Service - Database override: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else 'local'}")

# connect_args solo per SQLite, non per PostgreSQL
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Per PostgreSQL, aggiungi timeout, SSL e opzioni per gestire database in sleep mode
    # Render.com PostgreSQL: prova prima con prefer (più permissivo), poi require se necessario
    ssl_mode = os.environ.get("POSTGRES_SSL_MODE", "prefer")  # prefer, require, verify-ca, verify-full
    postgresql_connect_args = {
        "connect_timeout": 30,  # Timeout connessione 30 secondi
        "sslmode": ssl_mode,
        "options": "-c statement_timeout=60000"  # Timeout statement 60 secondi
    }
    print(f"🔒 SSL configurato per PostgreSQL (sslmode={ssl_mode})")
    
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Verifica che la connessione sia valida prima di usarla
        pool_recycle=3600,   # Ricicla connessioni dopo 1 ora
        pool_size=1,         # Ridotto per evitare TooManyConnections
        max_overflow=1,      # Solo 1 connessione extra
        connect_args=postgresql_connect_args
    )
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

class LeadTag(Base):
    """Tag customizzabili per i lead"""
    __tablename__ = "lead_tags"
    
    id = Column(Integer, primary_key=True, index=True)
    label = Column(String, nullable=False)
    color = Column(String, default="base")
    hex_color = Column(String(7), nullable=True)  # V2: colore hex custom (#FF5733)
    index = Column(Integer, default=0)
    is_system = Column(Boolean, default=False)

class Lead(Base):
    __tablename__ = "leads"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    azienda = Column(String, nullable=True)
    stage = Column(String, default="optin")
    source = Column(String, default="manual")
    clickfunnels_data = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)
    response_status = Column(String, default="pending", nullable=True)
    lead_tag_id = Column(Integer, nullable=True)
    structured_notes = Column(JSON, nullable=True)
    # V2 fields
    deal_value = Column(Integer, nullable=True)  # Valore in centesimi (1500 = 15.00 EUR)
    deal_currency = Column(String(3), default="EUR")
    deal_services = Column(JSON, nullable=True)  # [{name, price}]
    linked_preventivo_id = Column(String(50), nullable=True)
    linked_contratto_id = Column(String(50), nullable=True)
    source_channel = Column(String(50), nullable=True)  # Meta Ads, Google Ads, etc.
    assigned_to_user_id = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # ─── V3: campi operativi sales ────────────────────────────────────────────
    stage_entered_at = Column(DateTime, nullable=True)
    first_contact_at = Column(DateTime, nullable=True)
    first_appointment_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, nullable=True)
    no_show_count = Column(Integer, default=0, nullable=True)
    follow_up_count = Column(Integer, default=0, nullable=True)
    consapevolezza = Column(String(50), nullable=True)
    obiettivo_cliente = Column(String(50), nullable=True)
    pacchetto_consigliato = Column(String(50), nullable=True)
    budget_indicativo = Column(String(50), nullable=True)
    setter_id = Column(String(50), nullable=True)
    appointment_date = Column(DateTime, nullable=True)
    follow_up_date = Column(DateTime, nullable=True)
    trattativa_persa_reason = Column(String(100), nullable=True)
    lead_score = Column(Integer, default=0, nullable=True)

def init_db():
    """
    Inizializza il database con retry per gestire database in sleep mode.
    IMPORTANTE: create_all() NON elimina dati esistenti, crea solo tabelle se non esistono.
    """
    import time
    from sqlalchemy.exc import OperationalError
    
    max_retries = 5
    delay = 3
    
    for attempt in range(max_retries):
        try:
            # Verifica se le tabelle esistono già
            inspector = inspect(engine)
            existing_tables = inspector.get_table_names()
            
            # Conta i lead esistenti PRIMA di creare le tabelle (se esistono già)
            db = SessionLocal()
            existing_leads_count = 0
            existing_stages_count = 0
            
            try:
                if 'leads' in existing_tables:
                    existing_leads_count = db.query(Lead).count()
                if 'pipeline_stages' in existing_tables:
                    existing_stages_count = db.query(PipelineStage).count()
            except Exception as e:
                print(f"⚠️ Errore conteggio dati esistenti (normale se tabelle non esistono): {e}")
            finally:
                db.close()
            
            if existing_leads_count > 0:
                print(f"📊 Trovati {existing_leads_count} lead esistenti nel database - i dati verranno preservati")
            if existing_stages_count > 0:
                print(f"📊 Trovati {existing_stages_count} stage esistenti nel database - i dati verranno preservati")
            
            # Crea le tabelle se non esistono (NON elimina dati esistenti)
            Base.metadata.create_all(bind=engine)
            print("✅ Schema sales verificato/creato (dati esistenti preservati).")
            
            # Aggiungi colonne mancanti se la tabella esiste già (migrazione schema)
            db = SessionLocal()
            try:
                if 'leads' in existing_tables:
                    # Verifica colonne esistenti
                    columns = [col['name'] for col in inspector.get_columns('leads')]
                    
                    # Rimuovi colonna "nome" legacy se esiste (sostituita da first_name/last_name)
                    if 'nome' in columns:
                        print("🔄 Rimozione colonna legacy 'nome' (sostituita da first_name/last_name)...")
                        try:
                            # Prima rendi nullable se non lo è già
                            db.execute(text("ALTER TABLE leads ALTER COLUMN nome DROP NOT NULL"))
                        except Exception:
                            pass  # Potrebbe già essere nullable o non avere constraint
                        
                        try:
                            # Poi elimina la colonna
                            db.execute(text("ALTER TABLE leads DROP COLUMN nome CASCADE"))
                            db.commit()
                            print("✅ Colonna legacy 'nome' rimossa.")
                        except Exception as e:
                            print(f"⚠️ Errore rimozione colonna 'nome': {e}")
                            db.rollback()
                    
                    # Aggiungi first_name se mancante (PostgreSQL e SQLite supportano IF NOT EXISTS in modo diverso)
                    if 'first_name' not in columns:
                        print("🔄 Aggiungo colonna first_name alla tabella leads...")
                        try:
                            # Prova con IF NOT EXISTS (PostgreSQL 9.5+)
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_name TEXT"))
                        except Exception:
                            # Fallback per SQLite o PostgreSQL vecchio
                            db.execute(text("ALTER TABLE leads ADD COLUMN first_name TEXT"))
                        db.commit()
                        print("✅ Colonna first_name aggiunta.")
                    
                    # Aggiungi last_name se mancante
                    if 'last_name' not in columns:
                        print("🔄 Aggiungo colonna last_name alla tabella leads...")
                        try:
                            # Prova con IF NOT EXISTS (PostgreSQL 9.5+)
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_name TEXT"))
                        except Exception:
                            # Fallback per SQLite o PostgreSQL vecchio
                            db.execute(text("ALTER TABLE leads ADD COLUMN last_name TEXT"))
                        db.commit()
                        print("✅ Colonna last_name aggiunta.")
                    
                    # Aggiungi phone se mancante
                    if 'phone' not in columns:
                        print("🔄 Aggiungo colonna phone alla tabella leads...")
                        try:
                            # Prova con IF NOT EXISTS (PostgreSQL 9.5+)
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT"))
                        except Exception:
                            # Fallback per SQLite o PostgreSQL vecchio
                            db.execute(text("ALTER TABLE leads ADD COLUMN phone TEXT"))
                        db.commit()
                        print("✅ Colonna phone aggiunta.")
                    
                    # Aggiungi email se mancante
                    if 'email' not in columns:
                        print("🔄 Aggiungo colonna email alla tabella leads...")
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT UNIQUE"))
                        except Exception:
                            db.execute(text("ALTER TABLE leads ADD COLUMN email TEXT"))
                            # Aggiungi indice univoco separatamente se necessario
                            try:
                                db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS leads_email_key ON leads(email)"))
                            except Exception:
                                pass
                        db.commit()
                        print("✅ Colonna email aggiunta.")
                    
                    # Aggiungi notes se mancante
                    if 'notes' not in columns:
                        print("🔄 Aggiungo colonna notes alla tabella leads...")
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT"))
                        except Exception:
                            db.execute(text("ALTER TABLE leads ADD COLUMN notes TEXT"))
                        db.commit()
                        print("✅ Colonna notes aggiunta.")
                    
                    # Aggiungi azienda se mancante
                    if 'azienda' not in columns:
                        print("🔄 Aggiungo colonna azienda alla tabella leads...")
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS azienda TEXT"))
                        except Exception:
                            db.execute(text("ALTER TABLE leads ADD COLUMN azienda TEXT"))
                        db.commit()
                        print("✅ Colonna azienda aggiunta.")
                    
                    # Gestisci colonna stage: se esiste come ENUM, convertila a TEXT
                    if 'stage' in columns:
                        # Verifica se è un ENUM (controlla il tipo)
                        stage_col = next((col for col in inspector.get_columns('leads') if col['name'] == 'stage'), None)
                        if stage_col:
                            col_type = stage_col.get('type')
                            col_type_str = str(col_type)
                            type_name = type(col_type).__name__ if col_type else ''
                            
                            # Rileva ENUM in vari modi
                            is_enum = (
                                'ENUM' in col_type_str.upper() or 
                                'enum' in col_type_str.lower() or
                                'ENUM' in type_name.upper() or
                                'EnumType' in type_name
                            )
                            
                            if is_enum:
                                print("🔄 Conversione colonna stage da ENUM a TEXT...")
                                try:
                                    # Salva i valori esistenti PRIMA di eliminare la colonna
                                    existing_values = db.execute(text("SELECT id, stage FROM leads")).fetchall()
                                    print(f"📊 Trovati {len(existing_values)} lead da preservare durante conversione")
                                    
                                    # Rimuovi la colonna ENUM e ricreala come TEXT
                                    db.execute(text("ALTER TABLE leads DROP COLUMN stage CASCADE"))
                                    db.execute(text("ALTER TABLE leads ADD COLUMN stage TEXT DEFAULT 'optin'"))
                                    
                                    # Ripristina i valori esistenti
                                    for row in existing_values:
                                        stage_value = str(row[1]) if row[1] else 'optin'
                                        db.execute(
                                            text("UPDATE leads SET stage = :stage WHERE id = :id"),
                                            {"stage": stage_value, "id": row[0]}
                                        )
                                    
                                    db.commit()
                                    print(f"✅ Colonna stage convertita da ENUM a TEXT ({len(existing_values)} lead preservati).")
                                except Exception as e:
                                    print(f"⚠️ Errore conversione stage: {e}")
                                    import traceback
                                    traceback.print_exc()
                                    db.rollback()
                    else:
                        # Aggiungi stage se mancante
                        print("🔄 Aggiungo colonna stage alla tabella leads...")
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'optin'"))
                        except Exception:
                            db.execute(text("ALTER TABLE leads ADD COLUMN stage TEXT DEFAULT 'optin'"))
                        db.commit()
                        print("✅ Colonna stage aggiunta.")
                    
                    # Aggiungi response_status se mancante
                    if 'response_status' not in columns:
                        print("🔄 Aggiungo colonna response_status alla tabella leads...")
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS response_status TEXT DEFAULT 'pending'"))
                        except Exception:
                            db.execute(text("ALTER TABLE leads ADD COLUMN response_status TEXT DEFAULT 'pending'"))
                        db.commit()
                        print("✅ Colonna response_status aggiunta.")
                    
                    # Aggiungi structured_notes se mancante (JSON per note strutturate)
                    if 'structured_notes' not in columns:
                        print("🔄 Aggiungo colonna structured_notes alla tabella leads...")
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS structured_notes JSONB DEFAULT '[]'"))
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN structured_notes JSONB DEFAULT '[]'"))
                            except Exception:
                                # Fallback per SQLite
                                db.execute(text("ALTER TABLE leads ADD COLUMN structured_notes TEXT DEFAULT '[]'"))
                        db.commit()
                        print("✅ Colonna structured_notes aggiunta.")
                    
                    # Aggiungi lead_tag_id se mancante (nuovo sistema tag)
                    if 'lead_tag_id' not in columns:
                        print("🔄 Aggiungo colonna lead_tag_id alla tabella leads...")
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_tag_id INTEGER"))
                        except Exception:
                            db.execute(text("ALTER TABLE leads ADD COLUMN lead_tag_id INTEGER"))
                        db.commit()
                        print("✅ Colonna lead_tag_id aggiunta.")
                    
                    # V2: Nuove colonne Pipeline V2
                    v2_columns = {
                        'deal_value': "ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_value INTEGER",
                        'deal_currency': "ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_currency VARCHAR(3) DEFAULT 'EUR'",
                        'deal_services': "ALTER TABLE leads ADD COLUMN IF NOT EXISTS deal_services JSONB",
                        'linked_preventivo_id': "ALTER TABLE leads ADD COLUMN IF NOT EXISTS linked_preventivo_id VARCHAR(50)",
                        'linked_contratto_id': "ALTER TABLE leads ADD COLUMN IF NOT EXISTS linked_contratto_id VARCHAR(50)",
                        'source_channel': "ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_channel VARCHAR(50)",
                        'assigned_to_user_id': "ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to_user_id VARCHAR(50)",
                    }
                    for col_name, sql in v2_columns.items():
                        if col_name not in columns:
                            print(f"🔄 V2: Aggiungo colonna {col_name}...")
                            try:
                                db.execute(text(sql))
                                db.commit()
                                print(f"✅ V2: Colonna {col_name} aggiunta.")
                            except Exception as e:
                                print(f"⚠️ V2: Errore aggiunta {col_name}: {e}")
                                db.rollback()

                    # ─── MIGRAZIONI V3: campi operativi sales ─────────────────
                    v3_columns = {
                        'stage_entered_at':      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMP",
                        'first_contact_at':      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMP",
                        'first_appointment_at':  "ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_appointment_at TIMESTAMP",
                        'last_activity_at':      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP",
                        'no_show_count':         "ALTER TABLE leads ADD COLUMN IF NOT EXISTS no_show_count INTEGER DEFAULT 0",
                        'follow_up_count':       "ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0",
                        'consapevolezza':        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS consapevolezza VARCHAR(50)",
                        'obiettivo_cliente':     "ALTER TABLE leads ADD COLUMN IF NOT EXISTS obiettivo_cliente VARCHAR(50)",
                        'pacchetto_consigliato': "ALTER TABLE leads ADD COLUMN IF NOT EXISTS pacchetto_consigliato VARCHAR(50)",
                        'budget_indicativo':     "ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_indicativo VARCHAR(50)",
                        'setter_id':             "ALTER TABLE leads ADD COLUMN IF NOT EXISTS setter_id VARCHAR(50)",
                        'appointment_date':      "ALTER TABLE leads ADD COLUMN IF NOT EXISTS appointment_date TIMESTAMP",
                        'follow_up_date':        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_date TIMESTAMP",
                        'trattativa_persa_reason': "ALTER TABLE leads ADD COLUMN IF NOT EXISTS trattativa_persa_reason VARCHAR(100)",
                        'lead_score':            "ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0",
                    }
                    # Aggiorna la lista colonne prima di verificare V3
                    columns = [col['name'] for col in inspector.get_columns('leads')]
                    for col_name, sql in v3_columns.items():
                        if col_name not in columns:
                            print(f"🔄 V3: Aggiungo colonna {col_name}...")
                            try:
                                db.execute(text(sql))
                                db.commit()
                                print(f"✅ V3: Colonna {col_name} aggiunta.")
                            except Exception as e:
                                print(f"⚠️ V3: Errore aggiunta {col_name}: {e}")
                                db.rollback()
                
                # V2: hex_color per lead_tags
                if 'lead_tags' in existing_tables:
                    tag_columns = [col['name'] for col in inspector.get_columns('lead_tags')]
                    if 'hex_color' not in tag_columns:
                        print("🔄 V2: Aggiungo colonna hex_color a lead_tags...")
                        try:
                            db.execute(text("ALTER TABLE lead_tags ADD COLUMN IF NOT EXISTS hex_color VARCHAR(7)"))
                            db.commit()
                            print("✅ V2: Colonna hex_color aggiunta a lead_tags.")
                        except Exception as e:
                            print(f"⚠️ V2: Errore aggiunta hex_color: {e}")
                            db.rollback()
                        
            except Exception as e:
                print(f"⚠️ Errore aggiunta colonne mancanti: {e}")
                db.rollback()
            
            # Verifica che i dati siano ancora presenti dopo create_all
            try:
                final_leads_count = db.query(Lead).count()
                final_stages_count = db.query(PipelineStage).count()
                
                if existing_leads_count > 0 and final_leads_count != existing_leads_count:
                    print(f"⚠️ ATTENZIONE: Lead count cambiato da {existing_leads_count} a {final_leads_count}")
                elif existing_leads_count > 0:
                    print(f"✅ Verificato: {final_leads_count} lead preservati correttamente")
                
                if existing_stages_count > 0 and final_stages_count != existing_stages_count:
                    print(f"⚠️ ATTENZIONE: Stages count cambiato da {existing_stages_count} a {final_stages_count}")
                elif existing_stages_count > 0:
                    print(f"✅ Verificato: {final_stages_count} stages preservati correttamente")
            except Exception as e:
                print(f"⚠️ Errore verifica dati: {e}")
            
            # Seeding solo se non ci sono stage
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
            else:
                print(f"✅ {count} stages già presenti, seeding saltato.")
            
            # Seeding lead_tags solo se non ce ne sono
            tags_count = db.query(LeadTag).count()
            if tags_count == 0:
                print("🌱 Seeding default lead tags...")
                default_tags = [
                    LeadTag(label="Fissato calendly", color="success", index=0, is_system=False),
                    LeadTag(label="Non fissato", color="warning", index=1, is_system=False),
                    LeadTag(label="Da richiamare", color="info", index=2, is_system=False),
                    LeadTag(label="Non interessato", color="critical", index=3, is_system=False),
                    LeadTag(label="Non ha budget", color="attention", index=4, is_system=False),
                    LeadTag(label="Squalificato", color="base", index=5, is_system=False),
                ]
                db.add_all(default_tags)
                db.commit()
                print("✅ Default lead tags seeded.")
            else:
                print(f"✅ {tags_count} lead tags già presenti, seeding saltato.")
            
            db.close()
            return  # Successo, esci
            
        except OperationalError as e:
            error_msg = str(e)
            if attempt < max_retries - 1:
                wait_time = delay * (attempt + 1)  # Backoff esponenziale: 3s, 6s, 9s, 12s, 15s
                print(f"⚠️ Errore connessione database (tentativo {attempt + 1}/{max_retries})")
                print(f"   Errore: {error_msg[:200]}...")  # Limita lunghezza messaggio
                print(f"🔄 Retry tra {wait_time} secondi...")
                time.sleep(wait_time)
            else:
                print(f"❌ Impossibile connettersi al database dopo {max_retries} tentativi")
                print(f"   Ultimo errore: {error_msg[:200]}...")
                print(f"⚠️ Le tabelle verranno create al primo accesso.")
                # Non sollevare eccezione, permette all'app di avviarsi comunque
        except Exception as e:
            error_msg = str(e)
            print(f"❌ Errore inizializzazione database: {error_msg[:200]}...")
            if attempt < max_retries - 1:
                wait_time = delay * (attempt + 1)
                print(f"🔄 Retry tra {wait_time} secondi...")
                time.sleep(wait_time)
            else:
                print(f"⚠️ Le tabelle verranno create al primo accesso.")
                # Non sollevare eccezione, permette all'app di avviarsi comunque
                break
