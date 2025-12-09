import asyncio
import os
import json
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
        print("\n--- 1. AGGIORNAMENTO SCHEMA PREVENTIVI ---")
        try:
            await database.execute("ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS numero_preventivo VARCHAR(255)")
            await database.execute("ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS nome_cliente VARCHAR(255)")
            await database.execute("ALTER TABLE preventivi ADD COLUMN IF NOT EXISTS importo_totale DECIMAL(10, 2)")
            print("✅ Colonne aggiunte a 'preventivi'")
        except Exception as e:
            print(f"⚠️ Errore aggiunta colonne preventivi: {e}")

        print("\n--- 2. MIGRAZIONE DATI PREVENTIVI ---")
        rows = await database.fetch_all("SELECT id, data, client_info FROM preventivi")
        print(f"Trovati {len(rows)} preventivi da processare.")
        
        for row in rows:
            try:
                data_json = {}
                if row['data']:
                    if isinstance(row['data'], str):
                        try:
                            data_json = json.loads(row['data'])
                        except:
                            pass
                    elif isinstance(row['data'], dict):
                        data_json = row['data']
                
                client_info = {}
                if row['client_info']:
                    if isinstance(row['client_info'], str):
                        try:
                            client_info = json.loads(row['client_info'])
                        except:
                            pass
                    elif isinstance(row['client_info'], dict):
                        client_info = row['client_info']

                numero = data_json.get('numero')
                
                nome = data_json.get('cliente')
                if not nome:
                     nome = client_info.get('name') or client_info.get('ragione_sociale') or f"{client_info.get('nome', '')} {client_info.get('cognome', '')}".strip()
                
                totale = data_json.get('totale')
                # Gestione pulizia totale (es. "1.200,00 €")
                totale_val = 0.0
                if totale is not None:
                    if isinstance(totale, (int, float)):
                        totale_val = float(totale)
                    elif isinstance(totale, str):
                        clean_tot = totale.replace('€', '').replace('.', '').replace(',', '.').strip()
                        try:
                            totale_val = float(clean_tot)
                        except:
                            pass

                await database.execute(
                    "UPDATE preventivi SET numero_preventivo = :num, nome_cliente = :nome, importo_totale = :tot WHERE id = :id",
                    {"num": numero, "nome": nome, "tot": totale_val, "id": row['id']}
                )
                # print(f"  -> Aggiornato preventivo {row['id']}")
                
            except Exception as e:
                print(f"❌ Errore migrazione preventivo {row['id']}: {e}")
        print("✅ Migrazione preventivi completata.")


        print("\n--- 3. AGGIORNAMENTO SCHEMA CONTRATTI ---")
        try:
            # 'numero' esiste già
            await database.execute("ALTER TABLE contratti ADD COLUMN IF NOT EXISTS nome_cliente VARCHAR(255)")
            await database.execute("ALTER TABLE contratti ADD COLUMN IF NOT EXISTS numero_contratto VARCHAR(255)") # Alias normalizzato
            print("✅ Colonne aggiunte a 'contratti'")
        except Exception as e:
            print(f"⚠️ Errore aggiunta colonne contratti: {e}")

        print("\n--- 4. MIGRAZIONE DATI CONTRATTI ---")
        rows = await database.fetch_all("SELECT id, numero, dati_committente FROM contratti")
        print(f"Trovati {len(rows)} contratti da processare.")
        
        for row in rows:
            try:
                dati_committente = {}
                if row['dati_committente']:
                    if isinstance(row['dati_committente'], str):
                        try:
                            dati_committente = json.loads(row['dati_committente'])
                        except:
                            pass
                    elif isinstance(row['dati_committente'], dict):
                        dati_committente = row['dati_committente']
                
                ragione_sociale = dati_committente.get('ragioneSociale') or dati_committente.get('ragione_sociale')
                numero = row['numero']
                
                await database.execute(
                    "UPDATE contratti SET nome_cliente = :nome, numero_contratto = :num WHERE id = :id",
                    {"nome": ragione_sociale, "num": numero, "id": row['id']}
                )
                # print(f"  -> Aggiornato contratto {row['id']}")
                
            except Exception as e:
                print(f"❌ Errore migrazione contratto {row['id']}: {e}")
        print("✅ Migrazione contratti completata.")

    finally:
        await database.disconnect()

if __name__ == "__main__":
    asyncio.run(migrate())

