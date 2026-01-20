"""
Database configuration per Calendar Service
Gestisce tokens OAuth per calendari Google degli utenti
"""
import databases
import os
from pathlib import Path

# Database URL configurabile
# In produzione reale (su Render.com), usa PostgreSQL (DATABASE_URL principale)
# In sviluppo, usa default SQLite locale per comodità
# Rileva produzione reale SOLO se siamo effettivamente su Render.com
# (RENDER_EXTERNAL_HOSTNAME è presente solo su Render.com, non nel .env locale)
IS_REAL_PRODUCTION = os.environ.get("RENDER_EXTERNAL_HOSTNAME") is not None

DATABASE_URL = os.environ.get("CALENDAR_DATABASE_URL")

if not DATABASE_URL:
    if IS_REAL_PRODUCTION:
        # In produzione su Render.com, usa DATABASE_URL principale (PostgreSQL)
        # SQLite non è adatto per produzione cloud
        MAIN_DATABASE_URL = os.environ.get("DATABASE_URL")
        if MAIN_DATABASE_URL:
            # Usa lo stesso database PostgreSQL principale
            DATABASE_URL = MAIN_DATABASE_URL
            print("⚠️ CALENDAR_DATABASE_URL non configurato, uso DATABASE_URL principale (PostgreSQL)")
        else:
            raise ValueError("CALENDAR_DATABASE_URL o DATABASE_URL environment variable is required in production")
    else:
        # In sviluppo (locale o con RENDER=true nel .env), usa default locale
        DB_PATH = Path(__file__).parent / "calendar.db"
        DATABASE_URL = f"sqlite:///{DB_PATH}"
        print("⚠️ CALENDAR_DATABASE_URL non configurato, uso default locale (sviluppo)")

# Aggiungi +asyncpg se è PostgreSQL e non SQLite
if DATABASE_URL and DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)
    print(f"✅ DATABASE_URL aggiornato con +asyncpg: {DATABASE_URL[:50]}...")

# Aggiungi parametri SSL per Render.com se non presenti
# Render.com richiede SSL, ma asyncpg ha bisogno di sslmode=prefer nell'URL
if DATABASE_URL and DATABASE_URL.startswith("postgresql+asyncpg://") and "sslmode" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}sslmode=prefer"
    print(f"🔒 SSL mode aggiunto all'URL per Render.com")

# Pool MOLTO ridotto per evitare TooManyConnections
database = databases.Database(DATABASE_URL, min_size=0, max_size=2)

# Configurazioni default configurabili
DEFAULT_TIMEZONE = os.environ.get("DEFAULT_TIMEZONE", "Europe/Rome")
DEFAULT_NOTIFICATION_MINUTES = int(os.environ.get("DEFAULT_NOTIFICATION_MINUTES", "30"))

async def init_database():
    """Inizializza le tabelle del database"""
    await database.connect()
    
    # Tabella per token OAuth calendario per utente
    await database.execute("""
        CREATE TABLE IF NOT EXISTS calendar_tokens (
            user_id TEXT PRIMARY KEY,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            token_expiry TEXT,
            calendar_email TEXT,
            connected_at TEXT NOT NULL
        )
    """)
    
    # Tabella per preferenze calendario utente
    await database.execute(f"""
        CREATE TABLE IF NOT EXISTS calendar_preferences (
            user_id TEXT PRIMARY KEY,
            default_calendar_id TEXT DEFAULT 'primary',
            notification_minutes INTEGER DEFAULT {DEFAULT_NOTIFICATION_MINUTES},
            show_declined_events INTEGER DEFAULT 0,
            timezone TEXT DEFAULT '{DEFAULT_TIMEZONE}'
        )
    """)
    
    print("✅ Calendar Service: Database inizializzato")

async def close_database():
    """Chiude la connessione al database"""
    await database.disconnect()
