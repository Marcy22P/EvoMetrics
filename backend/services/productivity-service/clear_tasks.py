import asyncio
import os
from databases import Database
from dotenv import load_dotenv
from pathlib import Path

# Carica variabili d'ambiente
root_dir = Path(__file__).parent.parent.parent.parent
env_path = root_dir / ".env"
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

DATABASE_URL = os.environ.get("DATABASE_URL")
if DATABASE_URL and DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

async def clear_tasks():
    if not DATABASE_URL:
        print("❌ DATABASE_URL non trovato.")
        return

    database = Database(DATABASE_URL)
    try:
        await database.connect()
        print("✅ Connesso al Database.")
        
        # Cancella tutti i task
        await database.execute("DELETE FROM tasks")
        print("🗑️  Tutti i task sono stati eliminati.")
        
    except Exception as e:
        print(f"❌ Errore: {e}")
    finally:
        await database.disconnect()

if __name__ == "__main__":
    asyncio.run(clear_tasks())
