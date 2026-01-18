from fastapi import FastAPI, Depends, HTTPException, Request, Body, BackgroundTasks
from sqlalchemy.orm import Session
from database import SessionLocal, init_db, Lead as LeadModel, PipelineStage as PipelineStageModel
from models import Lead, LeadCreate, LeadUpdate, PipelineStage, PipelineStageCreate, PipelineStageUpdate
import uuid
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import requests
import os

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
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Inizializza il database quando il modulo viene caricato
print("🚀 Sales Service: Inizializzazione DB...")
init_db()

# --- WEBHOOK CLICKFUNNELS ---
@app.post("/webhook/clickfunnels")
async def clickfunnels_webhook(request: Request, db: Session = Depends(get_db)):
    """Endpoint pubblico per ricevere dati da ClickFunnels."""
    try:
        content_type = request.headers.get('content-type', '')
        
        data = {}
        if "application/json" in content_type:
            data = await request.json()
        else:
            form_data = await request.form()
            data = dict(form_data)
            
        print(f"📥 Webhook ClickFunnels ricevuto: {data}")

        email = data.get("email") or data.get("contact[email]")
        
        if not email:
            contact = data.get("contact", {})
            if isinstance(contact, dict):
                email = contact.get("email")

        if not email:
            print("⚠️ Nessuna email trovata nel webhook, ignoro.")
            return {"status": "ignored", "reason": "no_email"}

        existing = db.query(LeadModel).filter(LeadModel.email == email).first()
        if existing:
            print(f"🔄 Lead già esistente: {email}. Aggiorno dati.")
            existing.first_name = data.get("first_name") or existing.first_name
            existing.last_name = data.get("last_name") or existing.last_name
            existing.phone = data.get("phone") or existing.phone
            existing.clickfunnels_data = data
            db.commit()
            return {"status": "updated", "id": existing.id}

        initial_stage = "optin"
        first_stage = db.query(PipelineStageModel).order_by(PipelineStageModel.index).first()
        if first_stage:
            initial_stage = first_stage.key

        new_lead = LeadModel(
            id=str(uuid.uuid4()),
            email=email,
            first_name=data.get("first_name") or data.get("contact[first_name]"),
            last_name=data.get("last_name") or data.get("contact[last_name]"),
            phone=data.get("phone") or data.get("contact[phone]"),
            stage=initial_stage,
            source="clickfunnels",
            clickfunnels_data=data,
            notes="Importato da Webhook"
        )
        
        db.add(new_lead)
        db.commit()
        db.refresh(new_lead)
        print(f"✅ Nuovo Lead creato: {email} in stage {initial_stage}")
        
        return {"status": "created", "id": new_lead.id}

    except Exception as e:
        print(f"❌ Errore Webhook: {str(e)}")
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

@app.get("/api/leads", response_model=List[Lead])
def get_leads(stage: str = None, db: Session = Depends(get_db)):
    query = db.query(LeadModel)
    if stage:
        query = query.filter(LeadModel.stage == stage)
    return query.order_by(LeadModel.created_at.desc()).all()

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
    
    new_lead = LeadModel(
        id=str(uuid.uuid4()),
        email=lead_in.email,
        first_name=lead_in.first_name,
        last_name=lead_in.last_name,
        phone=lead_in.phone,
        stage=stage,
        source="manual",
        notes=lead_in.notes,
        clickfunnels_data=lead_in.clickfunnels_data
    )
    
    db.add(new_lead)
    db.commit()
    db.refresh(new_lead)
    print(f"✅ Lead creato manualmente: {lead_in.email}")
    return new_lead

def trigger_workflow_for_stage_change(lead_id: str, new_stage: str, previous_stage: str):
    """Chiama il webhook del productivity-service per triggerare workflow quando un lead cambia stage"""
    try:
        PRODUCTIVITY_SERVICE_URL = os.getenv("PRODUCTIVITY_SERVICE_URL", "http://localhost:10000")
        response = requests.post(
            f"{PRODUCTIVITY_SERVICE_URL}/api/hooks/lead-stage-changed",
            json={
                "lead_id": lead_id,
                "new_stage": new_stage,
                "previous_stage": previous_stage
            },
            timeout=5
        )
        if response.status_code == 200:
            print(f"✅ Workflow triggerato per lead {lead_id} in stage {new_stage}")
        else:
            print(f"⚠️ Errore trigger workflow: {response.status_code}")
    except Exception as e:
        print(f"⚠️ Errore chiamata webhook workflow: {e}")

@app.put("/api/leads/{lead_id}", response_model=Lead)
def update_lead(lead_id: str, lead_in: LeadUpdate, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
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
            setattr(lead, key, value)
        
    db.commit()
    db.refresh(lead)
    
    # Se lo stage è cambiato, triggera workflow
    if stage_changed and lead.stage:
        background_tasks.add_task(trigger_workflow_for_stage_change, lead_id, lead.stage, previous_stage)
    
    return lead

@app.delete("/api/leads/{lead_id}")
def delete_lead(lead_id: str, db: Session = Depends(get_db)):
    lead = db.query(LeadModel).filter(LeadModel.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    db.delete(lead)
    db.commit()
    return {"status": "deleted"}

# Health check
@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "sales-service"}
