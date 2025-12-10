import asyncio
import os
from pathlib import Path
from dotenv import load_dotenv
import databases

# Load .env
env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(env_path)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("❌ DATABASE_URL non trovato")
    exit(1)

if DATABASE_URL.startswith("postgresql://") and "+asyncpg" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

database = databases.Database(DATABASE_URL)

async def migrate():
    print(f"🔌 Connessione a {DATABASE_URL.split('@')[-1]}...")
    await database.connect()
    
    try:
        print("\n--- AGGIORNAMENTO SCHEMA CLIENTI ---")
        try:
            # Aggiungiamo la colonna dettagli per i nuovi dati strutturati
            await database.execute("ALTER TABLE clienti ADD COLUMN IF NOT EXISTS dettagli TEXT")
            print("✅ Colonna 'dettagli' aggiunta a 'clienti'")
        except Exception as e:
            print(f"⚠️ Errore aggiunta colonna dettagli: {e}")

    finally:
        await database.disconnect()

if __name__ == "__main__":
    asyncio.run(migrate())

