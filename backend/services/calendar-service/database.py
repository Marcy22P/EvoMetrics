"""
Database configuration per Calendar Service
Gestisce tokens OAuth per calendari Google degli utenti
"""
import databases
import os
from pathlib import Path

# Database URL configurabile, con fallback al default
DATABASE_URL = os.environ.get("CALENDAR_DATABASE_URL")
if not DATABASE_URL:
    # Fallback: usa path relativo alla directory del servizio
    DB_PATH = Path(__file__).parent / "calendar.db"
    DATABASE_URL = f"sqlite:///{DB_PATH}"

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
