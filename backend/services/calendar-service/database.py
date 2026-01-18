"""
Database configuration per Calendar Service
Gestisce tokens OAuth per calendari Google degli utenti
"""
import databases
import os
from pathlib import Path

# Percorso DB
DB_PATH = Path(__file__).parent / "calendar.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

database = databases.Database(DATABASE_URL)

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
    await database.execute("""
        CREATE TABLE IF NOT EXISTS calendar_preferences (
            user_id TEXT PRIMARY KEY,
            default_calendar_id TEXT DEFAULT 'primary',
            notification_minutes INTEGER DEFAULT 30,
            show_declined_events INTEGER DEFAULT 0,
            timezone TEXT DEFAULT 'Europe/Rome'
        )
    """)
    
    print("✅ Calendar Service: Database inizializzato")

async def close_database():
    """Chiude la connessione al database"""
    await database.disconnect()
