from databases import Database
import os
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

# Aggiungi parametri SSL per Render.com se non presenti
# Render.com richiede SSL, ma asyncpg ha bisogno di sslmode=prefer nell'URL
if DATABASE_URL and DATABASE_URL.startswith("postgresql+asyncpg://") and "sslmode" not in DATABASE_URL:
    separator = "&" if "?" in DATABASE_URL else "?"
    DATABASE_URL = f"{DATABASE_URL}{separator}sslmode=prefer"
    print(f"🔒 SSL mode aggiunto all'URL per Render.com")

# Pool MOLTO ridotto per evitare TooManyConnections
if not DATABASE_URL:
    database = None
else:
    database = Database(DATABASE_URL, min_size=0, max_size=2)

# Flag per tracciare se il database è stato inizializzato
_db_initialized = False

async def init_database():
    """Inizializza il database. Non blocca l'avvio se fallisce."""
    global _db_initialized
    if not database:
        return
    
    try:
        await database.connect()
        print("✅ Database connesso (Productivity Service)")
        
        # --- MIGRATION CHECK & CLEANUP ---
        try:
            # Recupera colonne esistenti
            check_query = """
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'tasks';
            """
            rows = await database.fetch_all(check_query)
            columns = [r['column_name'] for r in rows]
            
            # ⚠️ IMPORTANTE: NON eliminiamo mai la tabella tasks anche se ci sono colonne legacy
            # Le colonne legacy verranno ignorate, ma i dati devono essere preservati
            # Se ci sono colonne legacy, aggiungiamo solo le nuove colonne necessarie
            if 'list_id' in columns or 'date_created' in columns:
                print("⚠️ Rilevato schema legacy (list_id/date_created). Colonne legacy verranno ignorate, dati preservati.")
                # NON fare DROP TABLE - preserva i dati esistenti
            
            # Altrimenti procedi con le normali alterazioni se la tabella esiste ancora (caso non legacy)
            elif 'tasks' in [r[0] for r in await database.fetch_all("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema'")]:
                 # La tabella esiste e non è legacy deprecata, facciamo solo check colonne mancanti
                if 'name' in columns and 'title' not in columns:
                    print("🔄 Migrazione: Rinomina colonna 'name' -> 'title' in tasks")
                    await database.execute("ALTER TABLE tasks RENAME COLUMN name TO title")
                
                await database.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assignee_id TEXT")
                await database.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS role_required TEXT")
                await database.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id TEXT")
                await database.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'")
                await database.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS estimated_minutes INTEGER DEFAULT 0")
                await database.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS dependencies JSONB DEFAULT '[]'")
                await database.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'")
                # Check icon column
                check_icon = await database.fetch_one("SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='icon'")
                if not check_icon:
                    print("🔄 Adding icon column to tasks table...")
                    await database.execute("ALTER TABLE tasks ADD COLUMN icon TEXT")

                # Check google_event_id column
                check_event_id = await database.fetch_one("SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='google_event_id'")
                if not check_event_id:
                    print("🔄 Adding google_event_id column to tasks table...")
                    await database.execute("ALTER TABLE tasks ADD COLUMN google_event_id TEXT")

                # Check category_id column (NUOVO)
                check_cat_id = await database.fetch_one("SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='category_id'")
                if not check_cat_id:
                    print("🔄 Adding category_id column to tasks table...")
                    await database.execute("ALTER TABLE tasks ADD COLUMN category_id TEXT")

                # Check entity_type column (per distinguere tra clienti e lead)
                check_entity_type = await database.fetch_one("SELECT column_name FROM information_schema.columns WHERE table_name='tasks' AND column_name='entity_type'")
                if not check_entity_type:
                    print("🔄 Adding entity_type column to tasks table...")
                    await database.execute("ALTER TABLE tasks ADD COLUMN entity_type TEXT DEFAULT 'client'")

                print("✅ Schema tasks aggiornato.")
            
        except Exception as e:
            print(f"⚠️ Warning aggiornamento schema: {e}")

        # Crea tabelle se non esistono (fallback per fresh install)
        await database.execute("""
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'todo', -- todo, in_progress, review, done (ora gestiti dinamicamente)
            assignee_id TEXT, -- User ID del collaboratore
            role_required TEXT, -- Ruolo richiesto se non assegnato
            project_id TEXT, -- ID del Cliente/Lead
            entity_type TEXT DEFAULT 'client', -- 'client' o 'lead' per distinguere il tipo di entità
            priority TEXT DEFAULT 'medium',
            estimated_minutes INTEGER DEFAULT 0,
            due_date TIMESTAMP,
            icon TEXT, -- VC_OS: Icona custom (deprecato in favore di category, ma mantenuto per compatibilità)
            category_id TEXT, -- VC_OS: Categoria esplicita
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            completed_at TIMESTAMP,
            dependencies JSONB DEFAULT '[]', -- Array di Task ID che bloccano questo
            metadata JSONB DEFAULT '{}',
            attachments JSONB DEFAULT '[]' -- Array di {name, url, drive_id, type}
        )
        """)
        
        # Tabella Templates (Workflow definitions)
        await database.execute("""
        CREATE TABLE IF NOT EXISTS workflow_templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            tasks_definition JSONB NOT NULL,
            trigger_services JSONB DEFAULT '[]', -- Lista di nomi servizi (es. 'Sito Web') che attivano questo workflow
            trigger_type TEXT DEFAULT 'manual', -- 'manual', 'event', 'pipeline_stage'
            trigger_event TEXT, -- 'client_created', 'contract_signed', 'lead_stage_changed'
            entity_type TEXT DEFAULT 'client', -- 'client' o 'lead'
            trigger_pipeline_stage TEXT, -- Stage della pipeline che attiva il workflow (es. 'optin', 'prima_chiamata')
            created_at TIMESTAMP DEFAULT NOW()
        )
        """)
        
        # Aggiungi colonne se non esistono (migration)
        try:
            await database.execute("ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS trigger_type TEXT DEFAULT 'manual'")
            await database.execute("ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS trigger_event TEXT")
            await database.execute("ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS entity_type TEXT DEFAULT 'client'")
            await database.execute("ALTER TABLE workflow_templates ADD COLUMN IF NOT EXISTS trigger_pipeline_stage TEXT")
            print("✅ Schema workflow_templates aggiornato con nuovi campi.")
        except Exception as e:
            print(f"⚠️ Warning aggiornamento schema workflow_templates: {e}")

        # Tabella Stati Personalizzati
        await database.execute("""
        CREATE TABLE IF NOT EXISTS task_statuses (
            id TEXT PRIMARY KEY, -- es. 'todo', 'in_progress'
            label TEXT NOT NULL, -- es. 'Da Fare', 'In Corso'
            color TEXT NOT NULL, -- es. '#dfe3e8', '#fbf1a9'
            is_default BOOLEAN DEFAULT FALSE,
            position INTEGER DEFAULT 0
        )
        """)

        # Tabella Task Categories (NUOVA)
        await database.execute("""
        CREATE TABLE IF NOT EXISTS task_categories (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            tone TEXT DEFAULT 'base',
            keywords JSONB DEFAULT '[]',
            icon TEXT,
            order_index INTEGER DEFAULT 0,
            is_system BOOLEAN DEFAULT FALSE
        )
        """)

        # Seed Task Categories se vuota
        cat_count = await database.fetch_one("SELECT COUNT(*) as count FROM task_categories")
        if cat_count["count"] == 0:
            print("🌱 Seeding task_categories...")
            import json
            import uuid
            
            # 1. Amministrative
            await database.execute(
                "INSERT INTO task_categories (id, label, tone, keywords, icon, order_index, is_system) VALUES (:id, :label, :tone, :keywords, :icon, :order, :sys)",
                {
                    "id": str(uuid.uuid4()),
                    "label": "Amministrativa",
                    "tone": "critical",
                    "keywords": json.dumps(['admin', 'contratt', 'preventiv', 'fattur', 'sales', 'amministra', 'banca', 'pagament']),
                    "icon": "admin",
                    "order": 1,
                    "sys": True
                }
            )
            # 2. Organizzative
            await database.execute(
                "INSERT INTO task_categories (id, label, tone, keywords, icon, order_index, is_system) VALUES (:id, :label, :tone, :keywords, :icon, :order, :sys)",
                {
                    "id": str(uuid.uuid4()),
                    "label": "Organizzativa",
                    "tone": "warning",
                    "keywords": json.dumps(['call', 'document', 'email', 'meet', 'riunione', 'brief', 'linee guida', 'organizza', 'pianifica', 'report']),
                    "icon": "call",
                    "order": 2,
                    "sys": True
                }
            )
            # 3. Operative
            await database.execute(
                "INSERT INTO task_categories (id, label, tone, keywords, icon, order_index, is_system) VALUES (:id, :label, :tone, :keywords, :icon, :order, :sys)",
                {
                    "id": str(uuid.uuid4()),
                    "label": "Operativa",
                    "tone": "success",
                    "keywords": json.dumps([]), # Default
                    "icon": "work",
                    "order": 3,
                    "sys": True
                }
            )
            print("✅ Seeding task_categories completato.")

        # Seed Default Statuses se la tabella è vuota
        count_status = await database.fetch_val("SELECT COUNT(*) FROM task_statuses")
        if count_status == 0:
            default_statuses = [
                ('todo', 'Da Fare', 'new', 0),
                ('in_progress', 'In Corso', 'attention', 1),
                ('review', 'In Revisione', 'warning', 2),
                ('done', 'Completato', 'success', 3)
            ]
            for sid, label, color, pos in default_statuses:
                await database.execute(
                    "INSERT INTO task_statuses (id, label, color, is_default, position) VALUES (:id, :label, :color, TRUE, :pos)",
                    {"id": sid, "label": label, "color": color, "pos": pos}
                )
            print("✅ Default statuses seeded.")

        # Seed templates rimosso: i workflow vengono creati solo dall'utente tramite l'interfaccia
        # Nessun workflow di default viene inserito automaticamente
        
        _db_initialized = True
        print("✅ Database Productivity Service inizializzato con successo")
    except Exception as e:
        error_msg = str(e)
        print(f"⚠️ Errore inizializzazione database Productivity Service: {error_msg[:200]}...")
        print(f"⚠️ Il database verrà inizializzato al primo accesso.")
        # Non bloccare l'avvio, l'inizializzazione verrà fatta lazy

async def ensure_database_initialized():
    """Garantisce che il database sia connesso e inizializzato. Usa lazy initialization."""
    global _db_initialized
    if _db_initialized:
        return
    
    if not database:
        raise Exception("Database non configurato")
    
    try:
        # Prova a connettere se non connesso
        if not database.is_connected:
            await database.connect()
            print("✅ Database connesso (Productivity Service - lazy)")
        
        # Se non inizializzato, inizializza ora
        if not _db_initialized:
            await init_database()
    except Exception as e:
        error_msg = str(e)
        print(f"⚠️ Errore inizializzazione database lazy: {error_msg[:200]}...")
        # Rilancia l'eccezione per permettere al chiamante di gestirla
        raise

async def close_database():
    global _db_initialized
    if database:
        await database.disconnect()
        _db_initialized = False