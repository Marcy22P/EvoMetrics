from fastapi import FastAPI, Depends, HTTPException, Request, Body, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from database import SessionLocal, init_db, Lead as LeadModel, PipelineStage as PipelineStageModel, LeadTag as LeadTagModel, DATABASE_URL, IS_REAL_PRODUCTION
from models import Lead, LeadCreate, LeadUpdate, PipelineStage, PipelineStageCreate, PipelineStageUpdate, LeadTag, LeadTagCreate, LeadTagUpdate
import uuid
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import os
import datetime
from datetime import timedelta
import json
import csv
import io

app = FastAPI(
    title="Sales Service",
    description="Gestione Pipeline e Lead da ClickFunnels",
    version="1.0.0"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency DB
_db_initialized = False

def get_db():
    global _db_initialized
    db = SessionLocal()
    try:
        # Se non inizializzato, prova a creare le tabelle al primo accesso
        if not _db_initialized:
            try:
                from database import Base, engine
                from sqlalchemy import text, inspect
                inspector = inspect(engine)
                
                # Crea le tabelle se non esistono
                Base.metadata.create_all(bind=engine)
                
                # Aggiungi colonne mancanti se la tabella leads esiste già
                existing_tables = inspector.get_table_names()
                if 'leads' in existing_tables:
                    columns = [col['name'] for col in inspector.get_columns('leads')]
                    
                    # Rimuovi colonna "nome" legacy se esiste (sostituita da first_name/last_name)
                    if 'nome' in columns:
                        print("🔄 Rimozione colonna legacy 'nome' (lazy init)...")
                        try:
                            # Prima rendi nullable se non lo è già
                            db.execute(text("ALTER TABLE leads ALTER COLUMN nome DROP NOT NULL"))
                        except Exception:
                            pass  # Potrebbe già essere nullable o non avere constraint
                        
                        try:
                            # Poi elimina la colonna
                            db.execute(text("ALTER TABLE leads DROP COLUMN nome CASCADE"))
                            db.commit()
                            print("✅ Colonna legacy 'nome' rimossa (lazy init).")
                        except Exception as e:
                            print(f"⚠️ Errore rimozione colonna 'nome': {e}")
                            db.rollback()
                    
                    # Aggiungi first_name se mancante
                    if 'first_name' not in columns:
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_name TEXT"))
                            db.commit()
                            print("✅ Colonna first_name aggiunta (lazy init)")
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN first_name TEXT"))
                                db.commit()
                                print("✅ Colonna first_name aggiunta (lazy init)")
                            except Exception as e:
                                print(f"⚠️ Errore aggiunta first_name: {e}")
                                db.rollback()
                    
                    # Aggiungi last_name se mancante
                    if 'last_name' not in columns:
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_name TEXT"))
                            db.commit()
                            print("✅ Colonna last_name aggiunta (lazy init)")
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN last_name TEXT"))
                                db.commit()
                                print("✅ Colonna last_name aggiunta (lazy init)")
                            except Exception as e:
                                print(f"⚠️ Errore aggiunta last_name: {e}")
                                db.rollback()
                    
                    # Aggiungi phone se mancante
                    if 'phone' not in columns:
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS phone TEXT"))
                            db.commit()
                            print("✅ Colonna phone aggiunta (lazy init)")
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN phone TEXT"))
                                db.commit()
                                print("✅ Colonna phone aggiunta (lazy init)")
                            except Exception as e:
                                print(f"⚠️ Errore aggiunta phone: {e}")
                                db.rollback()
                    
                    # Aggiungi email se mancante
                    if 'email' not in columns:
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT UNIQUE"))
                            db.commit()
                            print("✅ Colonna email aggiunta (lazy init)")
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN email TEXT"))
                                try:
                                    db.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS leads_email_key ON leads(email)"))
                                except Exception:
                                    pass
                                db.commit()
                                print("✅ Colonna email aggiunta (lazy init)")
                            except Exception as e:
                                print(f"⚠️ Errore aggiunta email: {e}")
                                db.rollback()
                    
                    # Aggiungi notes se mancante
                    if 'notes' not in columns:
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes TEXT"))
                            db.commit()
                            print("✅ Colonna notes aggiunta (lazy init)")
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN notes TEXT"))
                                db.commit()
                                print("✅ Colonna notes aggiunta (lazy init)")
                            except Exception as e:
                                print(f"⚠️ Errore aggiunta notes: {e}")
                                db.rollback()
                    
                    # Aggiungi azienda se mancante
                    if 'azienda' not in columns:
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS azienda TEXT"))
                            db.commit()
                            print("✅ Colonna azienda aggiunta (lazy init)")
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN azienda TEXT"))
                                db.commit()
                                print("✅ Colonna azienda aggiunta (lazy init)")
                            except Exception as e:
                                print(f"⚠️ Errore aggiunta azienda: {e}")
                                db.rollback()
                    
                    # Gestisci colonna stage: se esiste come ENUM, convertila a TEXT
                    if 'stage' in columns:
                        # Verifica se è un ENUM
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
                                print("🔄 Conversione colonna stage da ENUM a TEXT (lazy init)...")
                                try:
                                    # Salva valori esistenti PRIMA di eliminare la colonna
                                    existing_values = db.execute(text("SELECT id, stage FROM leads")).fetchall()
                                    print(f"📊 Trovati {len(existing_values)} lead da preservare durante conversione (lazy init)")
                                    
                                    # Rimuovi ENUM e ricrea come TEXT
                                    db.execute(text("ALTER TABLE leads DROP COLUMN stage CASCADE"))
                                    db.execute(text("ALTER TABLE leads ADD COLUMN stage TEXT DEFAULT 'optin'"))
                                    
                                    # Ripristina valori
                                    for row in existing_values:
                                        stage_value = str(row[1]) if row[1] else 'optin'
                                        db.execute(
                                            text("UPDATE leads SET stage = :stage WHERE id = :id"),
                                            {"stage": stage_value, "id": row[0]}
                                        )
                                    db.commit()
                                    print(f"✅ Colonna stage convertita da ENUM a TEXT (lazy init, {len(existing_values)} lead preservati)")
                                except Exception as e:
                                    print(f"⚠️ Errore conversione stage: {e}")
                                    import traceback
                                    traceback.print_exc()
                                    db.rollback()
                    else:
                        # Aggiungi stage se mancante
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'optin'"))
                            db.commit()
                            print("✅ Colonna stage aggiunta (lazy init)")
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN stage TEXT DEFAULT 'optin'"))
                                db.commit()
                                print("✅ Colonna stage aggiunta (lazy init)")
                            except Exception as e:
                                print(f"⚠️ Errore aggiunta stage: {e}")
                                db.rollback()
                    
                    # Aggiungi response_status se mancante
                    if 'response_status' not in columns:
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS response_status TEXT DEFAULT 'pending'"))
                            db.commit()
                            print("✅ Colonna response_status aggiunta (lazy init)")
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN response_status TEXT DEFAULT 'pending'"))
                                db.commit()
                                print("✅ Colonna response_status aggiunta (lazy init)")
                            except Exception as e:
                                print(f"⚠️ Errore aggiunta response_status: {e}")
                                db.rollback()
                    
                    # Aggiungi structured_notes se mancante (JSON per note strutturate)
                    if 'structured_notes' not in columns:
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS structured_notes JSONB DEFAULT '[]'"))
                            db.commit()
                            print("✅ Colonna structured_notes aggiunta (lazy init)")
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN structured_notes JSONB DEFAULT '[]'"))
                                db.commit()
                                print("✅ Colonna structured_notes aggiunta (lazy init)")
                            except Exception as fallback_e:
                                # Fallback per SQLite che non ha JSONB
                                try:
                                    db.execute(text("ALTER TABLE leads ADD COLUMN structured_notes TEXT DEFAULT '[]'"))
                                    db.commit()
                                    print("✅ Colonna structured_notes aggiunta come TEXT (lazy init)")
                                except Exception as e:
                                    print(f"⚠️ Errore aggiunta structured_notes: {e}")
                                    db.rollback()
                    
                    # Aggiungi lead_tag_id se mancante (nuovo sistema tag)
                    if 'lead_tag_id' not in columns:
                        try:
                            db.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_tag_id INTEGER"))
                            db.commit()
                            print("✅ Colonna lead_tag_id aggiunta (lazy init)")
                        except Exception:
                            try:
                                db.execute(text("ALTER TABLE leads ADD COLUMN lead_tag_id INTEGER"))
                                db.commit()
                                print("✅ Colonna lead_tag_id aggiunta (lazy init)")
                            except Exception as e:
                                print(f"⚠️ Errore aggiunta lead_tag_id: {e}")
                                db.rollback()
                
                # Seeding lead_tags se la tabella è vuota (refresh inspector per vedere tabelle appena create)
                updated_tables = inspector.get_table_names()
                if 'lead_tags' in updated_tables:
                    tags_count = db.execute(text("SELECT COUNT(*) FROM lead_tags")).scalar()
                    if tags_count == 0:
                        print("🌱 Seeding default lead tags (lazy init)...")
                        default_tags = [
                            ("Fissato calendly", "success", 0),
                            ("Non fissato", "warning", 1),
                            ("Da richiamare", "info", 2),
                            ("Non interessato", "critical", 3),
                            ("Non ha budget", "attention", 4),
                            ("Squalificato", "base", 5),
                        ]
                        for label, color, index in default_tags:
                            db.execute(text(
                                "INSERT INTO lead_tags (label, color, index, is_system) VALUES (:label, :color, :index, :is_system)"
                            ), {"label": label, "color": color, "index": index, "is_system": False})
                        db.commit()
                        print("✅ Default lead tags seeded (lazy init)")
                
                _db_initialized = True
                print("✅ Database Sales inizializzato al primo accesso")
            except Exception as e:
                print(f"⚠️ Errore inizializzazione database al primo accesso: {e}")
                # Continua comunque, potrebbe essere un problema temporaneo
        yield db
    finally:
        db.close()

# NON inizializzare il database durante l'import - verrà fatto al primo accesso
# Questo evita di bloccare l'avvio dell'applicazione se il database non è disponibile
print("🚀 Sales Service: Database verrà inizializzato al primo accesso...")

# --- WEBHOOK CLICKFUNNELS ---
def create_workflow_tasks_for_clickfunnel_lead(lead_id: str, stage: str):
    """
    Crea direttamente le task nel database quando un lead viene creato da ClickFunnel.
    Cerca workflow templates con trigger_type = 'clickfunnel' o trigger_type = 'pipeline_stage' con stage matching.
    Crea una nuova sessione del database per essere thread-safe in background tasks.
    """
    print(f"🔄 [WORKFLOW] Inizio creazione task per lead {lead_id} in stage {stage}")
    db = SessionLocal()
    try:
        # Test connessione database
        try:
            db.execute(text("SELECT 1"))
            print(f"✅ [WORKFLOW] Database connesso per workflow")
        except Exception as e:
            print(f"⚠️ [WORKFLOW] Errore connessione database: {e}")
            import traceback
            traceback.print_exc()
            return
        
        # Cerca workflow templates che hanno trigger_type = 'clickfunnel' oppure trigger_type = 'pipeline_stage' con stage matching
        print(f"🔍 [WORKFLOW] Cerca template con trigger_type='clickfunnel' o trigger_type='pipeline_stage' (stage={stage})")
        templates_clickfunnel_query = text("""
            SELECT * FROM workflow_templates 
            WHERE trigger_type = 'clickfunnel' AND entity_type = 'lead'
        """)
        templates_clickfunnel = db.execute(templates_clickfunnel_query).fetchall()
        print(f"📋 [WORKFLOW] Trovati {len(templates_clickfunnel)} template ClickFunnel")
        
        templates_stage_query = text("""
            SELECT * FROM workflow_templates 
            WHERE trigger_type = 'pipeline_stage' AND trigger_pipeline_stage = :stage AND entity_type = 'lead'
        """)
        templates_stage = db.execute(templates_stage_query, {"stage": stage}).fetchall()
        print(f"📋 [WORKFLOW] Trovati {len(templates_stage)} template per stage {stage}")
        
        # Combina i template
        all_templates = list(templates_clickfunnel) + list(templates_stage)
        
        if not all_templates:
            print(f"ℹ️ [WORKFLOW] Nessun workflow trovato per ClickFunnel lead in stage {stage}")
            return
        
        start_date = datetime.datetime.now()
        if start_date.tzinfo is not None:
            start_date = start_date.replace(tzinfo=None)
        
        print(f"🔄 [WORKFLOW] Trovati {len(all_templates)} workflow template per lead {lead_id} in stage {stage}")
        
        # Per ogni template, crea le task
        for template_row in all_templates:
            template = dict(template_row._mapping) if hasattr(template_row, '_mapping') else dict(template_row)
            template_id = template.get("id")
            template_name = template.get("name", "Unknown")
            
            try:
                # tasks_definition potrebbe essere già una lista (deserializzata da JSONB) o una stringa JSON
                tasks_definition_raw = template.get("tasks_definition", "[]")
                if isinstance(tasks_definition_raw, str):
                    tasks_def = json.loads(tasks_definition_raw)
                elif isinstance(tasks_definition_raw, list):
                    tasks_def = tasks_definition_raw
                else:
                    print(f"⚠️ [WORKFLOW] tasks_definition ha tipo inaspettato: {type(tasks_definition_raw)}, uso lista vuota")
                    tasks_def = []
                
                created_tasks_map = {}  # Mappa indice -> task_id reale per risolvere dipendenze
                
                print(f"🔄 [WORKFLOW] Avvio workflow '{template_name}' (ID: {template_id}) per lead {lead_id}")
                print(f"📋 [WORKFLOW] Numero di task da creare: {len(tasks_def)}")
                
                # Itera e crea Tasks
                for i, t_def in enumerate(tasks_def):
                    task_id = str(uuid.uuid4())
                    task_title = t_def.get("title", "Task")
                    print(f"📝 [WORKFLOW] Creazione task {i+1}/{len(tasks_def)}: '{task_title}' (ID: {task_id})")
                    
                    # Calcola scadenza relativa
                    relative_days = t_def.get("relative_start_days", 0)
                    due_date = start_date + timedelta(days=relative_days)
                    
                    # Gestione Dipendenze (Semplificata: dipendenza dal precedente)
                    dependencies = []
                    if t_def.get("dependencies_on_prev") and i > 0:
                        prev_task_index = i - 1
                        if prev_task_index in created_tasks_map:
                            dependencies.append(created_tasks_map[prev_task_index])
                            print(f"🔗 [WORKFLOW] Task {i+1} dipende da task {prev_task_index+1}")
                    
                    # Metadata
                    metadata = t_def.get("metadata", {})
                    
                    # Query Inserimento Task
                    insert_query = text("""
                        INSERT INTO tasks (
                            id, title, description, status, role_required, project_id, entity_type,
                            estimated_minutes, due_date, icon, dependencies, metadata, created_at, updated_at
                        ) VALUES (
                            :id, :title, :description, 'todo', :role_required, :project_id, :entity_type,
                            :estimated_minutes, :due_date, :icon, :dependencies, :metadata, :created_at, :created_at
                        )
                    """)
                    
                    try:
                        db.execute(insert_query, {
                            "id": task_id,
                            "title": task_title,
                            "description": f"Generato da workflow: {template_name}",
                            "role_required": t_def.get("role_required"),
                            "project_id": lead_id,  # lead_id come project_id
                            "entity_type": "lead",  # Indica che questa task è collegata a un lead
                            "estimated_minutes": t_def.get("estimated_minutes", 0),
                            "due_date": due_date,
                            "icon": t_def.get("icon"),
                            "dependencies": json.dumps(dependencies),
                            "metadata": json.dumps(metadata),
                            "created_at": start_date
                        })
                        created_tasks_map[i] = task_id
                        print(f"✅ [WORKFLOW] Task '{task_title}' creato con successo (ID: {task_id})")
                    except Exception as task_error:
                        print(f"❌ [WORKFLOW] Errore creazione task '{task_title}': {task_error}")
                        import traceback
                        traceback.print_exc()
                        raise  # Rilancia per gestire il rollback
                
                db.commit()
                print(f"✅ [WORKFLOW] Creati {len(created_tasks_map)} task per workflow '{template_name}' (lead {lead_id})")
                
            except Exception as e:
                print(f"❌ Errore creazione task per template {template_id}: {e}")
                import traceback
                traceback.print_exc()
                db.rollback()
                continue
        
        print(f"✅ [WORKFLOW] Workflow completati per lead {lead_id}")
        
    except Exception as e:
        print(f"❌ [WORKFLOW] Errore creazione workflow per lead {lead_id}: {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()
        print(f"🔒 [WORKFLOW] Sessione database chiusa per lead {lead_id}")

@app.post("/webhook/clickfunnels")
async def clickfunnels_webhook(request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Endpoint pubblico per ricevere dati da ClickFunnels.
    URL configurabile via CLICKFUNNEL_WEBHOOK_URL (es. https://www.evoluzioneimprese.com/webhook/clickfunnels)
    Stage iniziale configurabile via CLICKFUNNEL_INITIAL_STAGE (default: "optin")
    """
    try:
        # Logging per debug
        print(f"📥 Webhook ClickFunnel ricevuto")
        
        # Leggi il payload JSON
        content_type = request.headers.get('content-type', '')
        print(f"📋 Content-Type: {content_type}")
        
        data = {}
        if "application/json" in content_type:
            data = await request.json()
        else:
            form_data = await request.form()
            data = dict(form_data)
        
        print(f"📦 Payload ricevuto: {str(data)[:500]}...")

        # ClickFunnel invia i dati in una struttura annidata: data.data.contact.email
        # Estrai i dati dalla struttura reale di ClickFunnel
        email = None
        first_name = None
        last_name = None
        phone = None
        azienda = None
        
        # Prova prima la struttura annidata di ClickFunnel: data.data.contact
        clickfunnel_data = data.get("data", {})
        if isinstance(clickfunnel_data, dict):
            inner_data = clickfunnel_data.get("data", {})
            if isinstance(inner_data, dict):
                contact = inner_data.get("contact", {})
                
                # Estrai email dalla struttura annidata
                if isinstance(contact, dict):
                    email = contact.get("email")
                
                # Fallback per email
                if not email:
                    email = inner_data.get("email")
                
                # Estrai nome (ClickFunnel invia "name" completo, non first_name/last_name)
                name = contact.get("name") if isinstance(contact, dict) else None
                if name:
                    # Prova a splittare il nome in first_name e last_name
                    name_parts = name.split(" ", 1)
                    first_name = name_parts[0] if len(name_parts) > 0 else None
                    last_name = name_parts[1] if len(name_parts) > 1 else None
                else:
                    first_name = inner_data.get("first_name")
                    last_name = inner_data.get("last_name")
                
                # Estrai telefono
                phone = inner_data.get("phone_number") or inner_data.get("phone")
                
                # Estrai azienda se presente
                azienda = inner_data.get("azienda")
                
                print(f"📋 Dati estratti (struttura annidata) - Email: {email}, Nome: {name or f'{first_name} {last_name}'.strip()}, Telefono: {phone}, Azienda: {azienda}")
        
        # Fallback: struttura semplice (se non trovato nella struttura annidata)
        if not email:
            email = data.get("email") or data.get("contact[email]")
            contact = data.get("contact", {})
            if isinstance(contact, dict):
                email = email or contact.get("email")
        
        if not first_name:
            first_name = data.get("first_name")
        if not last_name:
            last_name = data.get("last_name")
        if not phone:
            phone = data.get("phone") or data.get("phone_number")
        if not azienda:
            azienda = data.get("azienda")

        if not email:
            print("⚠️ Nessuna email trovata nel webhook, ignoro.")
            print(f"   Struttura dati ricevuta: {str(data)[:500]}")
            return {"status": "ignored", "reason": "no_email"}

        existing = db.query(LeadModel).filter(LeadModel.email == email).first()
        if existing:
            print(f"🔄 Lead già esistente: {email}. Aggiorno dati.")
            existing.first_name = first_name or existing.first_name
            existing.last_name = last_name or existing.last_name
            existing.phone = phone or existing.phone
            existing.azienda = azienda or existing.azienda  # Aggiorna anche l'azienda!
            existing.clickfunnels_data = data
            db.commit()
            print(f"✅ Lead aggiornato: {email} (Azienda: {existing.azienda})")
            return {"status": "updated", "id": existing.id}

        # Determina stage iniziale: prima da env, poi primo stage disponibile, poi default "optin"
        initial_stage = os.getenv("CLICKFUNNEL_INITIAL_STAGE", "optin")
        
        # Se lo stage configurato non esiste, cerca il primo stage disponibile
        configured_stage = db.query(PipelineStageModel).filter(PipelineStageModel.key == initial_stage).first()
        if not configured_stage:
            first_stage = db.query(PipelineStageModel).order_by(PipelineStageModel.index).first()
            if first_stage:
                initial_stage = first_stage.key
                print(f"⚠️ Stage {os.getenv('CLICKFUNNEL_INITIAL_STAGE')} non trovato, uso primo stage disponibile: {initial_stage}")
            else:
                print(f"⚠️ Nessuno stage configurato, uso default: {initial_stage}")

        new_lead = LeadModel(
            id=str(uuid.uuid4()),
            email=email,
            first_name=first_name,
            last_name=last_name,
            phone=phone,
            azienda=azienda,
            stage=initial_stage,
            source="clickfunnels",
            clickfunnels_data=data,
            notes="Importato da Webhook ClickFunnel"
        )
        
        db.add(new_lead)
        db.commit()
        db.refresh(new_lead)
        
        # Verifica che il lead sia stato salvato correttamente
        verify_lead = db.query(LeadModel).filter(LeadModel.id == new_lead.id).first()
        if not verify_lead:
            print(f"❌ ERRORE CRITICO: Lead {new_lead.id} non trovato dopo commit!")
            return {"status": "error", "detail": "Errore salvataggio lead"}
        
        total_leads = db.query(LeadModel).count()
        print(f"✅ Nuovo Lead creato da ClickFunnel: {email} (ID: {new_lead.id}, Stage: {initial_stage}, Azienda: {azienda}, Totale lead nel DB: {total_leads})")
        
        # Crea workflow direttamente nel database (in background)
        background_tasks.add_task(create_workflow_tasks_for_clickfunnel_lead, new_lead.id, initial_stage)
        
        # Crea workflow per stage change (se ci sono workflow configurati per lo stage)
        background_tasks.add_task(create_workflow_tasks_for_stage_change, new_lead.id, initial_stage, None)
        
        return {"status": "created", "id": new_lead.id, "stage": initial_stage}

    except Exception as e:
        print(f"❌ Errore Webhook: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"status": "error", "detail": str(e)}

# --- API STAGES ---

@app.get("/api/pipeline/stages", response_model=List[PipelineStage])
def get_stages(db: Session = Depends(get_db)):
    return db.query(PipelineStageModel).order_by(PipelineStageModel.index).all()

@app.post("/api/pipeline/stages", response_model=PipelineStage)
def create_stage(stage: PipelineStageCreate, db: Session = Depends(get_db)):
    if db.query(PipelineStageModel).filter(PipelineStageModel.key == stage.key).first():
        raise HTTPException(status_code=400, detail="Stage key already exists")
    
    new_stage = PipelineStageModel(**stage.dict())
    db.add(new_stage)
    db.commit()
    db.refresh(new_stage)
    return new_stage

@app.put("/api/pipeline/stages/{stage_id}", response_model=PipelineStage)
def update_stage(stage_id: int, stage_update: PipelineStageUpdate, db: Session = Depends(get_db)):
    db_stage = db.query(PipelineStageModel).filter(PipelineStageModel.id == stage_id).first()
    if not db_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    update_data = stage_update.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_stage, key, value)
    
    db.commit()
    db.refresh(db_stage)
    return db_stage

@app.delete("/api/pipeline/stages/{stage_id}")
def delete_stage(stage_id: int, fallback_stage_key: str = None, db: Session = Depends(get_db)):
    db_stage = db.query(PipelineStageModel).filter(PipelineStageModel.id == stage_id).first()
    if not db_stage:
        raise HTTPException(status_code=404, detail="Stage not found")
    
    total_stages = db.query(PipelineStageModel).count()
    if total_stages <= 1:
        raise HTTPException(status_code=400, detail="Impossibile eliminare l'ultimo stage.")
    
    if not fallback_stage_key:
        fallback = db.query(PipelineStageModel).filter(PipelineStageModel.id != stage_id).order_by(PipelineStageModel.index).first()
        fallback_stage_key = fallback.key if fallback else "optin"
         
    leads = db.query(LeadModel).filter(LeadModel.stage == db_stage.key).all()
    for lead in leads:
        lead.stage = fallback_stage_key
        
    db.delete(db_stage)
    db.commit()
    return {"status": "deleted", "leads_moved": len(leads)}

@app.post("/api/pipeline/stages/reorder")
def reorder_stages(order: List[int] = Body(...), db: Session = Depends(get_db)):
    for index, stage_id in enumerate(order):
        db_stage = db.query(PipelineStageModel).filter(PipelineStageModel.id == stage_id).first()
        if db_stage:
            db_stage.index = index
    db.commit()
    return {"status": "reordered"}

# --- API CRUD LEADS ---

@app.get("/api/leads")
def get_leads(stage: str = None, db: Session = Depends(get_db)):
    query = db.query(LeadModel)
    if stage:
        query = query.filter(LeadModel.stage == stage)
    leads = query.order_by(LeadModel.created_at.desc()).all()
    
    # Log per debugging (solo se ci sono problemi)
    total_count = db.query(LeadModel).count()
    if total_count == 0:
        print("⚠️ ATTENZIONE: Nessun lead trovato nel database")
    elif stage:
        print(f"📊 Recuperati {len(leads)} lead per stage '{stage}' (totale nel DB: {total_count})")
    
    # Popola tag e utente assegnato per ogni lead
    result = []
    # Cache utenti per evitare N+1 queries
    user_cache = {}
    
    for lead in leads:
        lead_dict = {
            "id": lead.id,
            "email": lead.email,
            "first_name": lead.first_name,
            "last_name": lead.last_name,
            "phone": lead.phone,
            "azienda": lead.azienda,
            "stage": lead.stage,
            "source": lead.source,
            "clickfunnels_data": lead.clickfunnels_data,
            "notes": lead.notes,
            "response_status": lead.response_status,
            "lead_tag_id": lead.lead_tag_id,
            "structured_notes": lead.structured_notes or [],
            "deal_value": getattr(lead, 'deal_value', None),
            "deal_currency": getattr(lead, 'deal_currency', 'EUR'),
            "deal_services": getattr(lead, 'deal_services', None),
            "linked_preventivo_id": getattr(lead, 'linked_preventivo_id', None),
            "linked_contratto_id": getattr(lead, 'linked_contratto_id', None),
            "source_channel": getattr(lead, 'source_channel', None),
            "assigned_to_user_id": getattr(lead, 'assigned_to_user_id', None),
            "assigned_to_user": None,
            "created_at": lead.created_at,
            "updated_at": lead.updated_at,
            "lead_tag": None
        }
        
        # Recupera il tag se presente
        if lead.lead_tag_id:
            tag = db.query(LeadTagModel).filter(LeadTagModel.id == lead.lead_tag_id).first()
            if tag:
                lead_dict["lead_tag"] = {
                    "id": tag.id,
                    "label": tag.label,
                    "color": tag.color,
                    "hex_color": getattr(tag, 'hex_color', None),
                    "index": tag.index,
                    "is_system": tag.is_system
                }
        
        # Recupera utente assegnato se presente
        assigned_uid = getattr(lead, 'assigned_to_user_id', None)
        if assigned_uid:
            if assigned_uid not in user_cache:
                try:
                    user_row = db.execute(
                        text("SELECT id, username, nome, cognome FROM users WHERE id = :uid"),
                        {"uid": assigned_uid}
                    ).fetchone()
                    if user_row:
                        user_cache[assigned_uid] = {
                            "id": str(user_row[0]),
                            "username": user_row[1],
                            "nome": user_row[2],
                            "cognome": user_row[3],
                        }
                    else:
                        user_cache[assigned_uid] = None
                except Exception:
                    user_cache[assigned_uid] = None
            lead_dict["assigned_to_user"] = user_cache.get(assigned_uid)
        
        result.append(lead_dict)
    
    return result

@app.post("/api/leads", response_model=Lead)
def create_lead(lead_in: LeadCreate, db: Session = Depends(get_db)):
    """Crea un nuovo lead manualmente."""
    existing = db.query(LeadModel).filter(LeadModel.email == lead_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Un lead con questa email esiste già")
    
    stage = lead_in.stage
    if not stage:
        first_stage = db.query(PipelineStageModel).order_by(PipelineStageModel.index).first()
        stage = first_stage.key if first_stage else "optin"
    
    # Serializza deal_services se presente
    deal_services_json = None
    if lead_in.deal_services:
        deal_services_json = [{"name": s.name, "price": s.price} for s in lead_in.deal_services]

    new_lead = LeadModel(
        id=str(uuid.uuid4()),
        email=lead_in.email,
        first_name=lead_in.first_name,
        last_name=lead_in.last_name,
        phone=lead_in.phone,
        azienda=lead_in.azienda,
        stage=stage,
        source="manual",
        notes=lead_in.notes,
        response_status=lead_in.response_status or "pending",
        lead_tag_id=lead_in.lead_tag_id,
        structured_notes=lead_in.structured_notes or [],
        clickfunnels_data=lead_in.clickfunnels_data,
        deal_value=lead_in.deal_value,
        deal_currency=lead_in.deal_currency or "EUR",
        deal_services=deal_services_json,
        linked_preventivo_id=lead_in.linked_preventivo_id,
        linked_contratto_id=lead_in.linked_contratto_id,
        source_channel=lead_in.source_channel,
        assigned_to_user_id=lead_in.assigned_to_user_id,
    )
    
    db.add(new_lead)
    db.commit()
    db.refresh(new_lead)
    
    # Verifica che il lead sia stato salvato correttamente
    verify_lead = db.query(LeadModel).filter(LeadModel.id == new_lead.id).first()
    if not verify_lead:
        print(f"❌ ERRORE CRITICO: Lead {new_lead.id} non trovato dopo commit!")
        raise HTTPException(status_code=500, detail="Errore salvataggio lead")
    
    total_leads = db.query(LeadModel).count()
    print(f"✅ Lead creato manualmente: {lead_in.email} (ID: {new_lead.id}, Stage: {stage}, Totale lead nel DB: {total_leads})")
    return new_lead

def create_workflow_tasks_for_stage_change(lead_id: str, new_stage: str, previous_stage: str):
    """
    Crea direttamente le task nel database quando un lead cambia stage.
    Cerca workflow templates con trigger_type = 'pipeline_stage' e trigger_pipeline_stage = new_stage.
    Crea una nuova sessione del database per essere thread-safe in background tasks.
    """
    db = SessionLocal()
    try:
        print(f"🔔 Evento trigger: Lead {lead_id} cambia stage '{previous_stage}' -> '{new_stage}'")
        
        # Cerca workflow templates che hanno trigger_pipeline_stage = new_stage
        templates_query = text("""
            SELECT * FROM workflow_templates 
            WHERE trigger_type = 'pipeline_stage' AND trigger_pipeline_stage = :stage AND entity_type = 'lead'
        """)
        templates = db.execute(templates_query, {"stage": new_stage}).fetchall()
        
        if not templates:
            print(f"ℹ️ Nessun workflow trovato per stage {new_stage}")
            return
        
        start_date = datetime.datetime.now()
        if start_date.tzinfo is not None:
            start_date = start_date.replace(tzinfo=None)
        
        print(f"🔄 Trovati {len(templates)} workflow template per stage {new_stage}")
        
        # Per ogni template, crea le task
        for template_row in templates:
            template = dict(template_row._mapping) if hasattr(template_row, '_mapping') else dict(template_row)
            template_id = template.get("id")
            template_name = template.get("name", "Unknown")
            
            try:
                # tasks_definition potrebbe essere già una lista (deserializzata da JSONB) o una stringa JSON
                tasks_definition_raw = template.get("tasks_definition", "[]")
                if isinstance(tasks_definition_raw, str):
                    tasks_def = json.loads(tasks_definition_raw)
                elif isinstance(tasks_definition_raw, list):
                    tasks_def = tasks_definition_raw
                else:
                    print(f"⚠️ [WORKFLOW] tasks_definition ha tipo inaspettato: {type(tasks_definition_raw)}, uso lista vuota")
                    tasks_def = []
                
                created_tasks_map = {}  # Mappa indice -> task_id reale per risolvere dipendenze
                
                print(f"🔄 [WORKFLOW] Avvio workflow '{template_name}' per lead {lead_id} (stage: {new_stage})")
                
                # Itera e crea Tasks
                for i, t_def in enumerate(tasks_def):
                    task_id = str(uuid.uuid4())
                    
                    # Calcola scadenza relativa
                    relative_days = t_def.get("relative_start_days", 0)
                    due_date = start_date + timedelta(days=relative_days)
                    
                    # Gestione Dipendenze (Semplificata: dipendenza dal precedente)
                    dependencies = []
                    if t_def.get("dependencies_on_prev") and i > 0:
                        prev_task_index = i - 1
                        if prev_task_index in created_tasks_map:
                            dependencies.append(created_tasks_map[prev_task_index])
                    
                    # Metadata
                    metadata = t_def.get("metadata", {})
                    
                    # Query Inserimento Task
                    insert_query = text("""
                        INSERT INTO tasks (
                            id, title, description, status, role_required, project_id, entity_type,
                            estimated_minutes, due_date, icon, dependencies, metadata, created_at, updated_at
                        ) VALUES (
                            :id, :title, :description, 'todo', :role_required, :project_id, :entity_type,
                            :estimated_minutes, :due_date, :icon, :dependencies, :metadata, :created_at, :created_at
                        )
                    """)
                    
                    db.execute(insert_query, {
                        "id": task_id,
                        "title": t_def.get("title", "Task"),
                        "description": f"Generato da workflow: {template_name}",
                        "role_required": t_def.get("role_required"),
                        "project_id": lead_id,  # lead_id come project_id
                        "entity_type": "lead",  # Indica che questa task è collegata a un lead
                        "estimated_minutes": t_def.get("estimated_minutes", 0),
                        "due_date": due_date,
                        "icon": t_def.get("icon"),
                        "dependencies": json.dumps(dependencies),
                        "metadata": json.dumps(metadata),
                        "created_at": start_date
                    })
                    
                    created_tasks_map[i] = task_id
                
                db.commit()
                print(f"✅ Creati {len(created_tasks_map)} task per workflow '{template_name}' (lead {lead_id}, stage: {new_stage})")
                
            except Exception as e:
                print(f"❌ Errore creazione task per template {template_id}: {e}")
                import traceback
                traceback.print_exc()
                db.rollback()
                continue
        
        print(f"✅ Workflow completati per cambio stage (lead {lead_id})")
        
    except Exception as e:
        print(f"❌ Errore creazione workflow per cambio stage (lead {lead_id}): {e}")
        import traceback
        traceback.print_exc()
        db.rollback()
    finally:
        db.close()

@app.put("/api/leads/{lead_id}", response_model=Lead)
def update_lead(lead_id: str, lead_in: LeadUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """
    Aggiorna un lead. Se lo stage cambia, triggera automaticamente i workflow configurati.
    """
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Salva lo stage precedente se stiamo cambiando lo stage
    previous_stage = lead.stage
    stage_changed = False
    
    update_data = lead_in.dict(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            if key == "stage" and value != previous_stage:
                stage_changed = True
                print(f"🔄 Lead {lead_id}: Stage cambiato da '{previous_stage}' a '{value}'")
            # Serializza deal_services se presente
            if key == "deal_services" and isinstance(value, list):
                value = [{"name": s.get("name", s.name) if hasattr(s, "name") else s.get("name", ""), "price": s.get("price", 0)} for s in value]
            setattr(lead, key, value)
    
    # Aggiorna updated_at
    lead.updated_at = datetime.datetime.utcnow()
        
    db.commit()
    db.refresh(lead)
    
    # Se lo stage è cambiato, triggera workflow in background
    if stage_changed and lead.stage:
        print(f"🚀 Trigger workflow per lead {lead_id}: stage '{previous_stage}' -> '{lead.stage}'")
        background_tasks.add_task(create_workflow_tasks_for_stage_change, lead_id, lead.stage, previous_stage)
    
    return lead

@app.delete("/api/leads/{lead_id}")
def delete_lead(lead_id: str, db: Session = Depends(get_db)):
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    db.delete(lead)
    db.commit()
    return {"status": "deleted"}

# --- NOTE STRUTTURATE ---
@app.post("/api/leads/{lead_id}/notes")
def add_lead_note(lead_id: str, note_content: dict, db: Session = Depends(get_db)):
    """
    Aggiunge una nota strutturata a un lead.
    Body: { "content": "Testo della nota" }
    """
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    content = note_content.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Il contenuto della nota è obbligatorio")
    
    # Parse delle note esistenti
    existing_notes = lead.structured_notes or []
    if isinstance(existing_notes, str):
        try:
            existing_notes = json.loads(existing_notes)
        except:
            existing_notes = []
    
    # Crea nuova nota
    new_note = {
        "id": str(uuid.uuid4()),
        "content": content,
        "created_at": datetime.datetime.utcnow().isoformat(),
        "updated_at": None
    }
    
    existing_notes.append(new_note)
    lead.structured_notes = existing_notes
    lead.updated_at = datetime.datetime.utcnow()
    
    db.commit()
    db.refresh(lead)
    
    return {"status": "success", "note": new_note, "total_notes": len(existing_notes)}

@app.put("/api/leads/{lead_id}/notes/{note_id}")
def update_lead_note(lead_id: str, note_id: str, note_content: dict, db: Session = Depends(get_db)):
    """
    Aggiorna una nota esistente.
    Body: { "content": "Nuovo testo della nota" }
    """
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    content = note_content.get("content", "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Il contenuto della nota è obbligatorio")
    
    existing_notes = lead.structured_notes or []
    if isinstance(existing_notes, str):
        try:
            existing_notes = json.loads(existing_notes)
        except:
            existing_notes = []
    
    # Trova e aggiorna la nota
    note_found = False
    for note in existing_notes:
        if note.get("id") == note_id:
            note["content"] = content
            note["updated_at"] = datetime.datetime.utcnow().isoformat()
            note_found = True
            break
    
    if not note_found:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    
    lead.structured_notes = existing_notes
    lead.updated_at = datetime.datetime.utcnow()
    
    db.commit()
    db.refresh(lead)
    
    return {"status": "success", "notes": existing_notes}

@app.delete("/api/leads/{lead_id}/notes/{note_id}")
def delete_lead_note(lead_id: str, note_id: str, db: Session = Depends(get_db)):
    """
    Elimina una nota specifica.
    """
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    existing_notes = lead.structured_notes or []
    if isinstance(existing_notes, str):
        try:
            existing_notes = json.loads(existing_notes)
        except:
            existing_notes = []
    
    # Rimuovi la nota
    original_count = len(existing_notes)
    existing_notes = [n for n in existing_notes if n.get("id") != note_id]
    
    if len(existing_notes) == original_count:
        raise HTTPException(status_code=404, detail="Nota non trovata")
    
    lead.structured_notes = existing_notes
    lead.updated_at = datetime.datetime.utcnow()
    
    db.commit()
    
    return {"status": "deleted", "remaining_notes": len(existing_notes)}

# --- RESPONSE STATUS OPTIONS (DEPRECATO - usa /api/lead-tags) ---
@app.get("/api/leads/response-statuses")
def get_response_status_options():
    """
    DEPRECATO: Usa /api/lead-tags invece.
    Restituisce le opzioni disponibili per lo stato di risposta del lead.
    """
    from models import RESPONSE_STATUS_OPTIONS
    
    status_labels = {
        "pending": "In Attesa",
        "no_show": "No-Show",
        "show": "Show",
        "followup": "Follow-up",
        "qualified": "Qualificato",
        "not_interested": "Non Interessato",
        "callback": "Richiamata"
    }
    
    return [
        {"value": status, "label": status_labels.get(status, status.title())}
        for status in RESPONSE_STATUS_OPTIONS
    ]

# --- LEAD TAGS (CRUD) ---
@app.get("/api/lead-tags", response_model=List[LeadTag])
def get_lead_tags(db: Session = Depends(get_db)):
    """
    Restituisce tutti i tag disponibili per i lead, ordinati per index.
    """
    tags = db.query(LeadTagModel).order_by(LeadTagModel.index).all()
    return tags

@app.post("/api/lead-tags", response_model=LeadTag)
def create_lead_tag(tag_in: LeadTagCreate, db: Session = Depends(get_db)):
    """
    Crea un nuovo tag per i lead.
    """
    # Trova il prossimo index disponibile
    max_index = db.query(LeadTagModel).order_by(LeadTagModel.index.desc()).first()
    next_index = (max_index.index + 1) if max_index else 0
    
    new_tag = LeadTagModel(
        label=tag_in.label,
        color=tag_in.color or "base",
        hex_color=getattr(tag_in, 'hex_color', None),
        index=tag_in.index if tag_in.index is not None else next_index,
        is_system=False
    )
    
    db.add(new_tag)
    db.commit()
    db.refresh(new_tag)
    
    return new_tag

@app.put("/api/lead-tags/{tag_id}", response_model=LeadTag)
def update_lead_tag(tag_id: int, tag_in: LeadTagUpdate, db: Session = Depends(get_db)):
    """
    Aggiorna un tag esistente.
    """
    tag = db.query(LeadTagModel).filter(LeadTagModel.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag non trovato")
    
    if tag_in.label is not None:
        tag.label = tag_in.label
    if tag_in.color is not None:
        tag.color = tag_in.color
    if tag_in.hex_color is not None:
        tag.hex_color = tag_in.hex_color
    if tag_in.index is not None:
        tag.index = tag_in.index
    
    db.commit()
    db.refresh(tag)
    
    return tag

@app.delete("/api/lead-tags/{tag_id}")
def delete_lead_tag(tag_id: int, db: Session = Depends(get_db)):
    """
    Elimina un tag. Se ci sono lead con questo tag, il tag verrà rimosso da essi.
    """
    tag = db.query(LeadTagModel).filter(LeadTagModel.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag non trovato")
    
    # Rimuovi il tag da tutti i lead che lo usano
    db.query(LeadModel).filter(LeadModel.lead_tag_id == tag_id).update({"lead_tag_id": None})
    
    # Elimina il tag
    db.delete(tag)
    db.commit()
    
    return {"status": "deleted", "tag_id": tag_id}

@app.post("/api/lead-tags/reorder")
def reorder_lead_tags(order: List[int], db: Session = Depends(get_db)):
    """
    Riordina i tag. Riceve una lista di ID nell'ordine desiderato.
    """
    for new_index, tag_id in enumerate(order):
        db.query(LeadTagModel).filter(LeadTagModel.id == tag_id).update({"index": new_index})
    
    db.commit()
    return {"status": "reordered"}

# ========================
# V2: ANALYTICS - Monthly Value Tracker
# ========================

@app.get("/api/pipeline/analytics/monthly-value")
def get_monthly_value(year: int = None, db: Session = Depends(get_db)):
    """
    Tracker valore mensile: somma deal_value per mese con delta percentuale.
    """
    import calendar
    if not year:
        year = datetime.datetime.utcnow().year
    
    month_labels = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
                    "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
    
    months = []
    year_total = 0
    prev_value = None
    
    for m in range(1, 13):
        rows = db.execute(
            text("""
                SELECT COALESCE(SUM(deal_value), 0) as total, COUNT(*) as cnt
                FROM leads
                WHERE EXTRACT(YEAR FROM created_at) = :y
                  AND EXTRACT(MONTH FROM created_at) = :m
            """),
            {"y": year, "m": m}
        ).fetchone()
        
        total_value = float(rows[0]) if rows else 0
        leads_count = int(rows[1]) if rows else 0
        
        delta_pct = None
        if prev_value is not None and prev_value > 0:
            delta_pct = round(((total_value - prev_value) / prev_value) * 100, 1)
        
        months.append({
            "month": m,
            "label": month_labels[m - 1],
            "total_value": total_value,
            "leads_count": leads_count,
            "delta_pct": delta_pct,
        })
        
        year_total += total_value
        if total_value > 0:
            prev_value = total_value
    
    return {
        "year": year,
        "months": months,
        "year_total": year_total,
    }


# ========================
# V2: SERVICES LIST (dal preventivatore)
# ========================

@app.get("/api/pipeline/services")
def get_available_services():
    """
    Lista servizi disponibili per associare a un deal.
    Categorie dal preventivatore.
    """
    return {
        "categories": [
            {
                "id": "ecommerce",
                "label": "E-Commerce",
                "services": [
                    {"id": "sito_web", "name": "Sito Web / E-Commerce", "default_price": 0},
                    {"id": "restyling", "name": "Restyling Sito", "default_price": 0},
                    {"id": "landing_page", "name": "Landing Page", "default_price": 0},
                ]
            },
            {
                "id": "emailMarketing",
                "label": "Email Marketing",
                "services": [
                    {"id": "email_setup", "name": "Setup Email Marketing", "default_price": 0},
                    {"id": "email_gestione", "name": "Gestione Email Marketing", "default_price": 0},
                ]
            },
            {
                "id": "videoPost",
                "label": "Video & Post",
                "services": [
                    {"id": "video_produzione", "name": "Produzione Video", "default_price": 0},
                    {"id": "social_management", "name": "Social Media Management", "default_price": 0},
                    {"id": "content_creation", "name": "Content Creation", "default_price": 0},
                ]
            },
            {
                "id": "metaAds",
                "label": "Meta Ads",
                "services": [
                    {"id": "meta_setup", "name": "Setup Campagne Meta", "default_price": 0},
                    {"id": "meta_gestione", "name": "Gestione Meta Ads", "default_price": 0},
                ]
            },
            {
                "id": "googleAds",
                "label": "Google Ads",
                "services": [
                    {"id": "google_setup", "name": "Setup Campagne Google", "default_price": 0},
                    {"id": "google_gestione", "name": "Gestione Google Ads", "default_price": 0},
                ]
            },
            {
                "id": "seo",
                "label": "SEO",
                "services": [
                    {"id": "seo_audit", "name": "SEO Audit", "default_price": 0},
                    {"id": "seo_gestione", "name": "Gestione SEO", "default_price": 0},
                ]
            },
        ]
    }


# ========================
# V2: SOURCE CHANNELS LIST
# ========================

@app.get("/api/pipeline/source-channels")
def get_source_channels():
    """Lista canali fonte disponibili."""
    channels = [
        "Meta Ads", "Google Ads", "TikTok Ads", "LinkedIn Ads",
        "Referral", "Passaparola", "Sito Web", "Organico",
        "ClickFunnels", "Email Marketing", "Evento", "Altro",
    ]
    return {"channels": channels}


# ========================
# V2: USERS LIST (per assegnazione)
# ========================

@app.get("/api/pipeline/users")
def get_pipeline_users(db: Session = Depends(get_db)):
    """Lista utenti per assegnazione lead."""
    try:
        rows = db.execute(
            text("SELECT id, username, nome, cognome, role FROM users WHERE is_active = true ORDER BY username")
        ).fetchall()
        return [
            {"id": str(r[0]), "username": r[1], "nome": r[2], "cognome": r[3], "role": r[4]}
            for r in rows
        ]
    except Exception as e:
        print(f"⚠️ Errore recupero utenti pipeline: {e}")
        return []


# ========================
# V2: EXPORT CSV OPPORTUNITÀ
# ========================

def _format_ts(dt):
    """Formatta datetime per CSV (ISO o vuoto)."""
    if dt is None:
        return ""
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)

@app.get("/api/leads/export/csv")
def export_leads_csv(db: Session = Depends(get_db)):
    """
    Export di tutte le opportunità in Pipeline in CSV.
    Colonne: Nome, Cognome, Nome Azienda, Canale fonte, Source, Stage, Stage label,
    Data opt-in, Data ultima modifica, Email, Telefono, Valore deal, Valuta, Servizi deal,
    ID preventivo, ID contratto, Assegnato a, Tag, Response status, Note, ID.
    """
    leads = db.query(LeadModel).order_by(LeadModel.created_at.desc()).all()
    stages = {s.key: s.label for s in db.query(PipelineStageModel).all()}
    tags_by_id = {t.id: t.label for t in db.query(LeadTagModel).all()}
    user_cache = {}
    for lead in leads:
        uid = getattr(lead, "assigned_to_user_id", None)
        if uid and uid not in user_cache:
            try:
                row = db.execute(
                    text("SELECT id, nome, cognome FROM users WHERE id = :uid"),
                    {"uid": uid},
                ).fetchone()
                user_cache[uid] = f"{row[1] or ''} {row[2] or ''}".strip() if row else ""
            except Exception:
                user_cache[uid] = ""
        if uid and uid not in user_cache:
            user_cache[uid] = ""

    headers = [
        "Nome", "Cognome", "Nome Azienda", "Canale della fonte", "Source",
        "Stage", "Stage label", "Data opt-in", "Data ultima modifica",
        "Email", "Telefono", "Valore deal (EUR)", "Valuta", "Servizi deal",
        "ID preventivo", "ID contratto", "Assegnato a", "Tag", "Response status",
        "Note", "ID",
    ]

    def row_for(lead):
        stage_label = stages.get(lead.stage, lead.stage or "")
        tag_label = tags_by_id.get(lead.lead_tag_id, "") if lead.lead_tag_id else ""
        assigned = user_cache.get(getattr(lead, "assigned_to_user_id", None) or "", "")
        deal_val = getattr(lead, "deal_value", None)
        if deal_val is not None and isinstance(deal_val, int):
            deal_val = round(deal_val / 100.0, 2)
        deal_services = getattr(lead, "deal_services", None) or []
        if isinstance(deal_services, str):
            try:
                deal_services = json.loads(deal_services) if deal_services else []
            except Exception:
                deal_services = []
        services_str = "; ".join(
            f"{s.get('name', '')}: {s.get('price', 0)}€" for s in deal_services
        ) if isinstance(deal_services, list) else ""
        source_channel = getattr(lead, "source_channel", None) or ""
        return [
            (lead.first_name or ""),
            (lead.last_name or ""),
            (lead.azienda or ""),
            source_channel,
            (lead.source or ""),
            (lead.stage or ""),
            stage_label,
            _format_ts(lead.created_at),
            _format_ts(lead.updated_at),
            (lead.email or ""),
            (lead.phone or ""),
            str(deal_val) if deal_val is not None else "",
            (getattr(lead, "deal_currency", None) or "EUR"),
            services_str,
            (getattr(lead, "linked_preventivo_id", None) or ""),
            (getattr(lead, "linked_contratto_id", None) or ""),
            assigned,
            tag_label,
            (lead.response_status or ""),
            (lead.notes or "").replace("\r\n", " ").replace("\n", " "),
            (lead.id or ""),
        ]

    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=",", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(headers)
    for lead in leads:
        writer.writerow(row_for(lead))

    buf.seek(0)
    filename = f"pipeline-opportunita-{datetime.datetime.utcnow().strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# Health check
@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "sales-service"}

@app.get("/api/events/triggers")
def get_trigger_events(db: Session = Depends(get_db)):
    """
    Restituisce informazioni sugli eventi trigger configurati per gli stage changes.
    Utile per verificare quali workflow vengono attivati quando un lead cambia stage.
    """
    try:
        PRODUCTIVITY_SERVICE_URL = os.getenv("PRODUCTIVITY_SERVICE_URL") or os.getenv("BASE_URL") or os.getenv("GATEWAY_URL")
        
        # Recupera tutti gli stage
        stages = db.query(PipelineStageModel).order_by(PipelineStageModel.index).all()
        
        trigger_info = {
            "service_url": PRODUCTIVITY_SERVICE_URL or "Non configurato",
            "endpoint": "/api/hooks/lead-stage-changed",
            "stages": []
        }
        
        for stage in stages:
            trigger_info["stages"].append({
                "key": stage.key,
                "label": stage.label,
                "workflow_endpoint": f"{PRODUCTIVITY_SERVICE_URL}/api/hooks/lead-stage-changed" if PRODUCTIVITY_SERVICE_URL else None,
                "description": f"Quando un lead passa allo stage '{stage.label}', vengono triggerati i workflow configurati con trigger_pipeline_stage='{stage.key}'"
            })
        
        return trigger_info
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore recupero trigger events: {str(e)}")

# Diagnostic endpoint per verificare persistenza dati
@app.get("/api/diagnostics")
def diagnostics(db: Session = Depends(get_db)):
    """Endpoint di diagnostica per verificare lo stato del database e la persistenza dei dati"""
    try:
        leads_count = db.query(LeadModel).count()
        stages_count = db.query(PipelineStageModel).count()
        
        # Conta lead per stage
        leads_by_stage = {}
        for stage in db.query(PipelineStageModel).all():
            count = db.query(LeadModel).filter(LeadModel.stage == stage.key).count()
            leads_by_stage[stage.key] = count
        
        # Informazioni database
        db_info = {
            "database_url": DATABASE_URL.split("@")[-1] if "@" in DATABASE_URL else "local",
            "is_sqlite": DATABASE_URL.startswith("sqlite"),
            "is_production": IS_REAL_PRODUCTION
        }
        
        return {
            "status": "ok",
            "database": db_info,
            "counts": {
                "total_leads": leads_count,
                "total_stages": stages_count,
                "leads_by_stage": leads_by_stage
            },
            "message": "Database operativo, dati persistenti" if leads_count > 0 or stages_count > 0 else "Database vuoto (normale se appena inizializzato)"
        }
    except Exception as e:
        return {"status": "error", "detail": str(e)}
