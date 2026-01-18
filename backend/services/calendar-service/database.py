"""
Database configuration per Calendar Service
Gestisce tokens OAuth per calendari Google degli utenti
"""
import databases
import os
from pathlib import Path

# Database URL configurabile
# In produzione (RENDER=true), questa variabile dovrebbe essere esplicita
# In sviluppo, usa default locale per comodità
IS_PRODUCTION = os.environ.get("RENDER", "false").lower() == "true" or os.environ.get("ENVIRONMENT", "").lower() == "production"
DATABASE_URL = os.environ.get("CALENDAR_DATABASE_URL")

if not DATABASE_URL:
    if IS_PRODUCTION:
        # In produzione, richiedi esplicitamente la configurazione
        raise ValueError("CALENDAR_DATABASE_URL environment variable is required in production")
    else:
        # In sviluppo, usa default locale
        DB_PATH = Path(__file__).parent / "calendar.db"
        DATABASE_URL = f"sqlite:///{DB_PATH}"
        print("⚠️ CALENDAR_DATABASE_URL non configurato, uso default locale (sviluppo)")

database = databases.Database(DATABASE_URL)

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
