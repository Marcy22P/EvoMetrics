"""
Productivity Service - Microservizio per gestione Task, Produttività e Workflow
"""

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Any, Optional
import os
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Database
from database import database, init_database, close_database

# Models
from models import Task, TaskCreate, TaskUpdate, WorkflowTemplate, Attachment, TaskCategory, TaskCategoryBase
from pydantic import BaseModel
from calendar_sync import sync_task_to_calendar

app = FastAPI(title="Productivity Service")

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lifecycle events
@app.on_event("startup")
async def startup():
    await init_database()

@app.on_event("shutdown")
async def shutdown():
    await close_database()

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "productivity-service"}


# --- CATEGORY API (NUOVA) ---

@app.get("/api/task-categories", response_model=List[TaskCategory])
async def get_task_categories():
    query = "SELECT * FROM task_categories ORDER BY order_index ASC"
    rows = await database.fetch_all(query)
    results = []
    for row in rows:
        item = dict(row)
        if isinstance(item.get("keywords"), str):
            item["keywords"] = json.loads(item["keywords"])
        results.append(item)
    return results

@app.post("/api/task-categories", response_model=TaskCategory)
async def create_task_category(cat: TaskCategoryBase):
    max_order = await database.fetch_val("SELECT MAX(order_index) FROM task_categories")
    order = (max_order or 0) + 1
    
    new_id = str(uuid.uuid4())
    
    query = """
    INSERT INTO task_categories (id, label, tone, keywords, icon, order_index, is_system)
    VALUES (:id, :label, :tone, :keywords, :icon, :order, FALSE)
    """
    await database.execute(query, {
        "id": new_id,
        "label": cat.label,
        "tone": cat.tone,
        "keywords": json.dumps(cat.keywords),
        "icon": cat.icon,
        "order": order
    })
    
    return {
        "id": new_id, 
        "label": cat.label, 
        "tone": cat.tone, 
        "keywords": cat.keywords, 
        "icon": cat.icon,
        "order_index": order,
        "is_system": False
    }

@app.put("/api/task-categories/{cat_id}")
async def update_task_category(cat_id: str, cat: TaskCategoryBase):
    exists = await database.fetch_one("SELECT * FROM task_categories WHERE id=:id", {"id": cat_id})
    if not exists:
        raise HTTPException(status_code=404, detail="Category not found")
        
    query = """
    UPDATE task_categories 
    SET label=:label, tone=:tone, keywords=:keywords, icon=:icon
    WHERE id=:id
    """
    await database.execute(query, {
        "id": cat_id,
        "label": cat.label,
        "tone": cat.tone,
        "keywords": json.dumps(cat.keywords),
        "icon": cat.icon
    })
    
    return {**cat.dict(), "id": cat_id, "order_index": exists["order_index"], "is_system": exists["is_system"]}

@app.delete("/api/task-categories/{cat_id}")
async def delete_task_category(cat_id: str):
    row = await database.fetch_one("SELECT is_system FROM task_categories WHERE id=:id", {"id": cat_id})
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    
    if row["is_system"]:
         raise HTTPException(status_code=400, detail="Cannot delete system category")
         
    await database.execute("DELETE FROM task_categories WHERE id=:id", {"id": cat_id})
    return {"status": "deleted"}


# --- MODELS AGGIUNTIVI ---
class TaskStatus(BaseModel):
    id: str
    label: str
    color: str
    is_default: bool = False
    position: int = 0

class CreateStatusRequest(BaseModel):
    id: str
    label: str
    color: str # 'new', 'attention', 'warning', 'success', 'critical' o hex

# --- CORE LOGIC: Workflow Engine ---

async def execute_drive_action(action_type: str, action_config: Dict[str, Any], entity_id: str, entity_type: str):
    """
    Esegue un'azione Google Drive come parte di un workflow.
    action_type: 'create_folder', 'upload_file', 'share_folder'
    action_config: configurazione specifica per l'azione
    entity_id: ID del cliente o lead
    entity_type: 'client' o 'lead'
    """
    try:
        import requests
        CLIENTI_SERVICE_URL = os.getenv("CLIENTI_SERVICE_URL", "http://localhost:10000")
        token = os.getenv("INTERNAL_API_TOKEN", "")  # Token per chiamate interne
        
        if action_type == "create_folder":
            folder_name = action_config.get("folder_name", f"Cartella {entity_id}")
            parent_id = action_config.get("parent_folder_id")
            
            response = requests.post(
                f"{CLIENTI_SERVICE_URL}/api/drive/folder",
                data={"name": folder_name, "parent_id": parent_id or ""},
                headers={"Authorization": f"Bearer {token}"} if token else {}
            )
            if response.status_code == 200:
                folder_data = response.json()
                print(f"✅ Cartella Drive creata: {folder_data.get('id')}")
                return folder_data.get("id")
            else:
                print(f"⚠️ Errore creazione cartella Drive: {response.status_code}")
                return None
                
        elif action_type == "upload_file":
            # Per ora solo log, l'upload richiede file content
            print(f"ℹ️ Upload file Drive richiesto (non ancora implementato automaticamente)")
            return None
            
        elif action_type == "share_folder":
            folder_id = action_config.get("folder_id")
            email = action_config.get("email")
            role = action_config.get("role", "reader")
            # Per ora solo log, richiede API Drive dirette
            print(f"ℹ️ Condivisione cartella Drive richiesta (non ancora implementato automaticamente)")
            return None
            
    except Exception as e:
        print(f"❌ Errore esecuzione azione Drive {action_type}: {e}")
        return None

async def instantiate_workflow_logic(template_id: str, entity_id: str, start_date: datetime, entity_type: str = "client"):
    """
    Logica core per creare i task da un template.
    Supporta sia clienti che lead.
    """
    # 1. Recupera Template
    query = "SELECT * FROM workflow_templates WHERE id = :id"
    template = await database.fetch_one(query, {"id": template_id})
    if not template:
        print(f"❌ Template {template_id} non trovato")
        return

    tasks_def = json.loads(template["tasks_definition"])
    created_tasks_map = {} # Mappa indice -> task_id reale per risolvere dipendenze

    entity_label = "cliente" if entity_type == "client" else "lead"
    print(f"🔄 Avvio workflow '{template['name']}' per {entity_label} {entity_id}")

    # 2. Itera e crea Tasks
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

        # Esegui azioni Drive se presenti (prima di creare il task)
        drive_actions = t_def.get("drive_actions", [])
        drive_results = {}
        for drive_action in drive_actions:
            action_type = drive_action.get("type")
            action_config = drive_action.get("config", {})
            result = await execute_drive_action(action_type, action_config, entity_id, entity_type)
            if result:
                drive_results[action_type] = result

        # Query Inserimento Task
        insert_query = """
        INSERT INTO tasks (
            id, title, description, status, role_required, project_id, 
            estimated_minutes, due_date, icon, dependencies, metadata, created_at, updated_at
        ) VALUES (
            :id, :title, :description, 'todo', :role_required, :project_id,
            :estimated_minutes, :due_date, :icon, :dependencies, :metadata, :created_at, :created_at
        )
        """
        
        # Metadata include risultati azioni Drive
        metadata = t_def.get("metadata", {})
        if drive_results:
            metadata["drive_results"] = drive_results
        
        await database.execute(insert_query, {
            "id": task_id,
            "title": t_def["title"],
            "description": f"Generato da workflow: {template['name']}",
            "role_required": t_def.get("role_required"),
            "project_id": entity_id,  # Può essere client_id o lead_id
            "estimated_minutes": t_def.get("estimated_minutes", 0),
            "due_date": due_date,
            "icon": t_def.get("icon"),
            "dependencies": json.dumps(dependencies),
            "metadata": json.dumps(metadata),
            "created_at": datetime.now()
        })
        
        created_tasks_map[i] = task_id
    
    print(f"✅ Creati {len(created_tasks_map)} task per {entity_label} {entity_id}")


# --- API Endpoints ---

@app.post("/api/hooks/lead-stage-changed")
async def lead_stage_changed_hook(payload: Dict[str, Any], background_tasks: BackgroundTasks):
    """
    Webhook chiamato dal Sales Service quando un lead cambia stage.
    Payload atteso: { "lead_id": "...", "new_stage": "optin", "previous_stage": "..." }
    """
    lead_id = payload.get("lead_id")
    new_stage = payload.get("new_stage")
    
    if not lead_id or not new_stage:
        raise HTTPException(status_code=400, detail="lead_id e new_stage richiesti")

    # Trova workflow templates che hanno trigger_pipeline_stage = new_stage
    templates = await database.fetch_all("SELECT * FROM workflow_templates WHERE trigger_type = 'pipeline_stage' AND trigger_pipeline_stage = :stage", {"stage": new_stage})
    
    if not templates:
        return {"status": "no_workflows_triggered", "message": f"Nessun workflow trovato per stage {new_stage}"}

    start_date = datetime.now()
    if start_date.tzinfo is not None:
        start_date = start_date.astimezone(timezone.utc).replace(tzinfo=None)

    triggered_templates = []
    for template in templates:
        template_id = template["id"]
        background_tasks.add_task(instantiate_workflow_logic, template_id, lead_id, start_date, "lead")
        triggered_templates.append(template_id)

    return {
        "status": "processing",
        "triggered_workflows": triggered_templates,
        "message": f"Avviati {len(triggered_templates)} workflow per lead {lead_id} in stage {new_stage}"
    }

@app.post("/api/hooks/contract-signed")
async def contract_signed_hook(payload: Dict[str, Any], background_tasks: BackgroundTasks):
    """
    Webhook chiamato dal Contratti Service quando un contratto passa a 'firmato'.
    Payload atteso: { "contract_id": "...", "client_id": "...", "services": ["Sito Web", "SEO"], "start_date": "..." }
    """
    client_id = payload.get("client_id")
    services = payload.get("services", [])
    start_date_str = payload.get("start_date")
    
    if not client_id:
        raise HTTPException(status_code=400, detail="client_id mancante")

    start_date = datetime.fromisoformat(start_date_str) if start_date_str else datetime.now()
    # Normalizza a naive UTC
    if start_date.tzinfo is not None:
        start_date = start_date.astimezone(timezone.utc).replace(tzinfo=None)

    # 1. Trova Workflow Templates che matchano i servizi
    # Recupera tutti i template
    templates = await database.fetch_all("SELECT * FROM workflow_templates")
    
    triggered_templates = []
    
    # Workflow universale "Onboarding" (se trigger_services contiene "ALL" o è sempre attivo per nuovi contratti)
    for t in templates:
        triggers = json.loads(t["trigger_services"])
        
        # Logica di match: se uno dei servizi del contratto è nella lista trigger del template
        # O se il template ha "ALL"
        if "ALL" in triggers:
             triggered_templates.append(t["id"])
             continue
             
        # Intersezione tra servizi contratto e trigger template
        if set(services) & set(triggers):
            triggered_templates.append(t["id"])

    if not triggered_templates:
        return {"status": "no_workflows_triggered", "message": "Nessun workflow automatico trovato per questi servizi"}

    # 2. Lancia Background Task per creazione
    for tmpl_id in triggered_templates:
        template = await database.fetch_one("SELECT entity_type FROM workflow_templates WHERE id = :id", {"id": tmpl_id})
        entity_type = template.get("entity_type", "client") if template else "client"
        background_tasks.add_task(instantiate_workflow_logic, tmpl_id, client_id, start_date, entity_type)

    return {
        "status": "processing", 
        "triggered_workflows": triggered_templates,
        "message": f"Avviata creazione task per {len(triggered_templates)} workflow"
    }


# --- WORKFLOW API ---

class InstantiateWorkflowRequest(BaseModel):
    template_id: str
    project_id: str
    start_date: Optional[str] = None # ISO format

class CreateWorkflowTemplateRequest(BaseModel):
    name: str
    description: Optional[str] = ""
    trigger_services: List[str] = []
    trigger_type: Optional[str] = "manual"
    trigger_event: Optional[str] = None
    entity_type: Optional[str] = "client"
    trigger_pipeline_stage: Optional[str] = None
    tasks_definition: List[Dict[str, Any]] = []

class UpdateWorkflowTemplateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_services: Optional[List[str]] = None
    trigger_type: Optional[str] = None
    trigger_event: Optional[str] = None
    entity_type: Optional[str] = None
    trigger_pipeline_stage: Optional[str] = None
    tasks_definition: Optional[List[Dict[str, Any]]] = None

@app.get("/api/workflows/templates", response_model=List[WorkflowTemplate])
async def get_workflow_templates():
    """Restituisce tutti i template di workflow disponibili"""
    query = "SELECT * FROM workflow_templates"
    rows = await database.fetch_all(query)
    
    results = []
    for row in rows:
        item = dict(row)
        # Parse JSON
        if isinstance(item.get("tasks_definition"), str):
            item["tasks_definition"] = json.loads(item["tasks_definition"])
        if isinstance(item.get("trigger_services"), str):
            item["trigger_services"] = json.loads(item["trigger_services"])
        # Set default values for new fields if missing
        if "trigger_type" not in item:
            item["trigger_type"] = "manual"
        if "entity_type" not in item:
            item["entity_type"] = "client"
        results.append(item)
    return results

@app.post("/api/workflows/instantiate")
async def instantiate_workflow(req: InstantiateWorkflowRequest, background_tasks: BackgroundTasks):
    """
    Avvia manualmente un workflow per un progetto.
    """
    start_date = datetime.now()
    if req.start_date:
        try:
            dt = datetime.fromisoformat(req.start_date)
            # Normalizza a naive UTC per compatibilità con asyncpg e TIMESTAMP column
            if dt.tzinfo is not None:
                dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
            start_date = dt
        except:
            pass
            
    # Verifica esistenza template
    query = "SELECT id FROM workflow_templates WHERE id = :id"
    tmpl = await database.fetch_one(query, {"id": req.template_id})
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
        
    # Determina entity_type dal template
    template = await database.fetch_one("SELECT entity_type FROM workflow_templates WHERE id = :id", {"id": req.template_id})
    entity_type = template.get("entity_type", "client") if template else "client"
    
    background_tasks.add_task(instantiate_workflow_logic, req.template_id, req.project_id, start_date, entity_type)
    
    return {"status": "processing", "message": f"Workflow {req.template_id} started for {entity_type} {req.project_id}"}


@app.post("/api/workflows/templates", response_model=WorkflowTemplate)
async def create_workflow_template(req: CreateWorkflowTemplateRequest):
    """Crea un nuovo workflow template"""
    template_id = str(uuid.uuid4())
    
    query = """
    INSERT INTO workflow_templates (id, name, description, tasks_definition, trigger_services, trigger_type, trigger_event, entity_type, trigger_pipeline_stage)
    VALUES (:id, :name, :description, :tasks_definition, :trigger_services, :trigger_type, :trigger_event, :entity_type, :trigger_pipeline_stage)
    """
    await database.execute(query, {
        "id": template_id,
        "name": req.name,
        "description": req.description or "",
        "tasks_definition": json.dumps(req.tasks_definition),
        "trigger_services": json.dumps(req.trigger_services),
        "trigger_type": req.trigger_type or "manual",
        "trigger_event": req.trigger_event,
        "entity_type": req.entity_type or "client",
        "trigger_pipeline_stage": req.trigger_pipeline_stage
    })
    
    return {
        "id": template_id,
        "name": req.name,
        "description": req.description or "",
        "tasks_definition": req.tasks_definition,
        "trigger_services": req.trigger_services,
        "trigger_type": req.trigger_type or "manual",
        "trigger_event": req.trigger_event,
        "entity_type": req.entity_type or "client",
        "trigger_pipeline_stage": req.trigger_pipeline_stage
    }


@app.put("/api/workflows/templates/{template_id}", response_model=WorkflowTemplate)
async def update_workflow_template(template_id: str, req: UpdateWorkflowTemplateRequest):
    """Aggiorna un workflow template esistente"""
    # Check exists
    existing = await database.fetch_one("SELECT * FROM workflow_templates WHERE id = :id", {"id": template_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Build update query dynamically
    updates = []
    params = {"id": template_id}
    
    if req.name is not None:
        updates.append("name = :name")
        params["name"] = req.name
    if req.description is not None:
        updates.append("description = :description")
        params["description"] = req.description
    if req.trigger_services is not None:
        updates.append("trigger_services = :trigger_services")
        params["trigger_services"] = json.dumps(req.trigger_services)
    if req.trigger_type is not None:
        updates.append("trigger_type = :trigger_type")
        params["trigger_type"] = req.trigger_type
    if req.trigger_event is not None:
        updates.append("trigger_event = :trigger_event")
        params["trigger_event"] = req.trigger_event
    if req.entity_type is not None:
        updates.append("entity_type = :entity_type")
        params["entity_type"] = req.entity_type
    if req.trigger_pipeline_stage is not None:
        updates.append("trigger_pipeline_stage = :trigger_pipeline_stage")
        params["trigger_pipeline_stage"] = req.trigger_pipeline_stage
    if req.tasks_definition is not None:
        updates.append("tasks_definition = :tasks_definition")
        params["tasks_definition"] = json.dumps(req.tasks_definition)
    
    if updates:
        query = f"UPDATE workflow_templates SET {', '.join(updates)} WHERE id = :id"
        await database.execute(query, params)
    
    # Fetch updated
    row = await database.fetch_one("SELECT * FROM workflow_templates WHERE id = :id", {"id": template_id})
    item = dict(row)
    if isinstance(item.get("tasks_definition"), str):
        item["tasks_definition"] = json.loads(item["tasks_definition"])
    if isinstance(item.get("trigger_services"), str):
        item["trigger_services"] = json.loads(item["trigger_services"])
    return item


@app.delete("/api/workflows/templates/{template_id}")
async def delete_workflow_template(template_id: str):
    """Elimina un workflow template"""
    existing = await database.fetch_one("SELECT id FROM workflow_templates WHERE id = :id", {"id": template_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Template not found")
    
    await database.execute("DELETE FROM workflow_templates WHERE id = :id", {"id": template_id})
    return {"status": "deleted", "id": template_id}


@app.get("/api/workflows/templates/{template_id}", response_model=WorkflowTemplate)
async def get_workflow_template(template_id: str):
    """Ottiene un singolo workflow template"""
    row = await database.fetch_one("SELECT * FROM workflow_templates WHERE id = :id", {"id": template_id})
    if not row:
        raise HTTPException(status_code=404, detail="Template not found")
    
    item = dict(row)
    if isinstance(item.get("tasks_definition"), str):
        item["tasks_definition"] = json.loads(item["tasks_definition"])
    if isinstance(item.get("trigger_services"), str):
        item["trigger_services"] = json.loads(item["trigger_services"])
    return item


# --- STATUS API ---

@app.get("/api/statuses", response_model=List[TaskStatus])
async def get_statuses():
    query = "SELECT * FROM task_statuses ORDER BY position ASC"
    rows = await database.fetch_all(query)
    return [dict(row) for row in rows]

@app.post("/api/statuses")
async def create_status(status: CreateStatusRequest):
    # Check if exists
    exists = await database.fetch_one("SELECT id FROM task_statuses WHERE id = :id", {"id": status.id})
    if exists:
        raise HTTPException(status_code=400, detail="Status ID already exists")
    
    # Get max position
    max_pos = await database.fetch_val("SELECT MAX(position) FROM task_statuses")
    new_pos = (max_pos or 0) + 1
    
    query = """
    INSERT INTO task_statuses (id, label, color, is_default, position)
    VALUES (:id, :label, :color, FALSE, :pos)
    """
    await database.execute(query, {
        "id": status.id,
        "label": status.label,
        "color": status.color,
        "pos": new_pos
    })
    return {"status": "created", "id": status.id}

@app.delete("/api/statuses/{status_id}")
async def delete_status(status_id: str):
    # Check if default
    row = await database.fetch_one("SELECT is_default FROM task_statuses WHERE id = :id", {"id": status_id})
    if not row:
        raise HTTPException(status_code=404, detail="Status not found")
    if row["is_default"]:
        raise HTTPException(status_code=400, detail="Cannot delete default status")
        
    # Check if used
    used = await database.fetch_val("SELECT COUNT(*) FROM tasks WHERE status = :id", {"id": status_id})
    if used > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete status used by {used} tasks")
        
    await database.execute("DELETE FROM task_statuses WHERE id = :id", {"id": status_id})
    return {"status": "deleted"}


# --- TASKS API ---

@app.get("/api/tasks", response_model=List[Task])
async def get_tasks(
    project_id: Optional[str] = None, 
    assignee_id: Optional[str] = None,
    role: Optional[str] = None,
    exclude_completed: bool = False
):
    query = "SELECT * FROM tasks WHERE 1=1"
    params = {}
    
    if project_id:
        query += " AND project_id = :project_id"
        params["project_id"] = project_id
    
    if assignee_id:
        query += " AND assignee_id = :assignee_id"
        params["assignee_id"] = assignee_id
        
    if role:
        query += " AND (role_required = :role OR role_required IS NULL)" # Semplificazione
        params["role"] = role

    if exclude_completed:
        query += " AND status != 'done'"

    query += " ORDER BY due_date ASC"
    
    rows = await database.fetch_all(query, params)
    
    results = []
    for row in rows:
        item = dict(row)
        
        # 1. Mapping name -> title (gestione schema legacy/ClickUp)
        if "name" in item and "title" not in item:
            item["title"] = item["name"]
        
        # 2. Gestione Priority (se None -> medium)
        if item.get("priority") is None:
            item["priority"] = "medium"

        # 3. Gestione JSON fields
        for json_field in ["dependencies", "metadata", "attachments"]:
            if isinstance(item.get(json_field), str):
                try:
                    item[json_field] = json.loads(item[json_field])
                except json.JSONDecodeError:
                    item[json_field] = [] if json_field != "metadata" else {}
            elif item.get(json_field) is None:
                item[json_field] = [] if json_field != "metadata" else {}

        # 4. Fallback Assignee (se assignee_id è vuoto ma c'è assignees JSON da ClickUp)
        if not item.get("assignee_id") and item.get("assignees"):
            try:
                assignees_data = item["assignees"]
                if isinstance(assignees_data, str):
                    assignees_data = json.loads(assignees_data)
                
                if isinstance(assignees_data, list) and len(assignees_data) > 0:
                    first_assignee = assignees_data[0]
                    if isinstance(first_assignee, dict) and "id" in first_assignee:
                        item["assignee_id"] = str(first_assignee["id"])
            except Exception:
                pass 

        # 5. Assicurati che description non sia None
        if item.get("description") is None:
            item["description"] = ""

        results.append(item)
        
    return results

@app.post("/api/tasks", response_model=Task)
async def create_task(task: TaskCreate, background_tasks: BackgroundTasks):
    """
    Crea un nuovo task.
    """
    task_id = str(uuid.uuid4())
    now = datetime.now()
    
    insert_query = """
    INSERT INTO tasks (
        id, title, description, status, assignee_id, role_required, project_id, 
        priority, estimated_minutes, due_date, icon, category_id, dependencies, metadata, attachments, created_at, updated_at
    ) VALUES (
        :id, :title, :description, :status, :assignee_id, :role_required, :project_id,
        :priority, :estimated_minutes, :due_date, :icon, :category_id, :dependencies, :metadata, :attachments, :created_at, :updated_at
    )
    """
    
    values = task.dict()
    values["id"] = task_id
    values["created_at"] = now
    values["updated_at"] = now
    
    # Normalize due_date to naive UTC if present
    if values.get("due_date") is not None and values["due_date"].tzinfo is not None:
        values["due_date"] = values["due_date"].astimezone(timezone.utc).replace(tzinfo=None)
        
    values["dependencies"] = json.dumps(values.get("dependencies", []))
    values["metadata"] = json.dumps(values.get("metadata", {}))
    values["attachments"] = json.dumps(values.get("attachments", []))
    
    await database.execute(insert_query, values)
    
    # Ritorna il task creato
    query = "SELECT * FROM tasks WHERE id = :id"
    row = await database.fetch_one(query, {"id": task_id})
    result = dict(row)
    
    # Parse JSON fields before returning to match Pydantic model
    if isinstance(result.get("dependencies"), str):
        result["dependencies"] = json.loads(result["dependencies"])
    if isinstance(result.get("metadata"), str):
        result["metadata"] = json.loads(result["metadata"])
    if isinstance(result.get("attachments"), str):
        result["attachments"] = json.loads(result["attachments"])
        
    return result

@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, task_update: TaskUpdate, background_tasks: BackgroundTasks):
    """
    Aggiorna un task esistente (status, assignee, ecc.)
    """
    # 1. Check if task exists
    query = "SELECT * FROM tasks WHERE id = :id"
    task_row = await database.fetch_one(query, {"id": task_id})
    if not task_row:
        raise HTTPException(status_code=404, detail="Task not found")
    
    # 2. Build update query dynamically
    update_data = task_update.dict(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
        
    update_data["updated_at"] = datetime.now()

    # Normalize due_date to naive UTC if present
    if "due_date" in update_data and update_data["due_date"] is not None:
         # Check if it has tzinfo before converting
         if getattr(update_data["due_date"], "tzinfo", None) is not None:
             update_data["due_date"] = update_data["due_date"].astimezone(timezone.utc).replace(tzinfo=None)
    
    # Handle completion timestamp
    if "status" in update_data:
        if update_data["status"] == "done":
            update_data["completed_at"] = datetime.now()
        else:
            update_data["completed_at"] = None

    # Handle JSON fields serialization if present
    if "attachments" in update_data:
        update_data["attachments"] = json.dumps(update_data["attachments"])
        
    set_clause = ", ".join([f"{key} = :{key}" for key in update_data.keys()])
    update_query = f"UPDATE tasks SET {set_clause} WHERE id = :id"
    
    values = update_data
    values["id"] = task_id
    
    await database.execute(update_query, values)
    
    # Return updated task
    updated_row = await database.fetch_one(query, {"id": task_id})
    result = dict(updated_row)
    
    # Parse JSON fields before returning to match Pydantic model
    if isinstance(result.get("dependencies"), str):
        result["dependencies"] = json.loads(result["dependencies"])
    if isinstance(result.get("metadata"), str):
        result["metadata"] = json.loads(result["metadata"])
    if isinstance(result.get("attachments"), str):
        result["attachments"] = json.loads(result["attachments"])
        
    # Sync Calendar (VC_OS)
    if result.get("assignee_id"):
        async def sync_and_save():
            current_event_id = result.get("google_event_id")
            evt_id = await sync_task_to_calendar(result["assignee_id"], result, "update", google_event_id=current_event_id)
            if evt_id and evt_id != current_event_id:
                await database.execute("UPDATE tasks SET google_event_id = :gid WHERE id = :tid", 
                    {"gid": evt_id, "tid": task_id})
        
        background_tasks.add_task(sync_and_save)

    return result

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str, background_tasks: BackgroundTasks):
    """
    Elimina un singolo task.
    """
    # Recupera task per sync delete
    task_row = await database.fetch_one("SELECT assignee_id, due_date, google_event_id, title, id FROM tasks WHERE id = :id", {"id": task_id})
    
    query = "DELETE FROM tasks WHERE id = :id"
    result = await database.execute(query, {"id": task_id})
    if not result:
         # Note: execute returns None usually for delete, checking via fetch_one before is safer but this is fine for now
         pass
         
    # Sync Calendar Delete (VC_OS)
    if task_row and task_row["assignee_id"] and task_row["google_event_id"]:
        async def sync_delete():
            await sync_task_to_calendar(task_row["assignee_id"], dict(task_row), "delete", google_event_id=task_row["google_event_id"])
        
        background_tasks.add_task(sync_delete)
        
    return {"status": "deleted", "id": task_id}

@app.post("/api/tasks/{task_id}/attachments", response_model=Task)
async def add_attachment(task_id: str, attachment: Attachment):
    """
    Aggiunge un allegato (link Drive o altro) a un task esistente.
    """
    # 1. Recupera task corrente
    query = "SELECT * FROM tasks WHERE id = :id"
    task_row = await database.fetch_one(query, {"id": task_id})
    if not task_row:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task_data = dict(task_row)
    
    # 2. Parse attachments esistenti
    current_attachments = task_data.get("attachments")
    if isinstance(current_attachments, str):
        try:
            current_attachments = json.loads(current_attachments)
        except:
            current_attachments = []
    elif current_attachments is None:
        current_attachments = []
        
    # 3. Aggiungi nuovo attachment
    current_attachments.append(attachment.dict())
    
    # 4. Aggiorna DB
    update_query = "UPDATE tasks SET attachments = :attachments WHERE id = :id"
    await database.execute(update_query, {
        "attachments": json.dumps(current_attachments),
        "id": task_id
    })
    
    updated_row = await database.fetch_one(query, {"id": task_id})
    updated_item = dict(updated_row)
    
    # Fix mapping for response model
    if "name" in updated_item and "title" not in updated_item: updated_item["title"] = updated_item["name"]
    
    # Parse JSON fields correctly before returning
    if isinstance(updated_item.get("attachments"), str): 
        updated_item["attachments"] = json.loads(updated_item["attachments"])
    if isinstance(updated_item.get("dependencies"), str):
        updated_item["dependencies"] = json.loads(updated_item["dependencies"])
    if isinstance(updated_item.get("metadata"), str):
        updated_item["metadata"] = json.loads(updated_item["metadata"])
    
    return updated_item

@app.delete("/api/tasks/all")
async def delete_all_tasks():
    """
    Endpoint di manutenzione per cancellare TUTTI i task.
    Da usare con cautela (es. fase di setup/pulizia).
    """
    await database.execute("DELETE FROM tasks")
    return {"status": "deleted", "message": "All tasks have been deleted."}

@app.post("/api/tasks/bulk/delete")
async def bulk_delete_tasks(task_ids: List[str]):
    """
    Elimina multipli task in una sola chiamata.
    """
    if not task_ids:
        return {"deleted_count": 0}
        
    query = "DELETE FROM tasks WHERE id = ANY(:ids)"
    await database.execute(query, {"ids": task_ids})
    
    return {"deleted_count": len(task_ids), "ids": task_ids}

@app.post("/api/tasks/bulk/update")
async def bulk_update_tasks(task_ids: List[str], update_data: TaskUpdate):
    """
    Aggiorna multipli task con gli stessi dati (es. cambia status a tutti).
    """
    if not task_ids:
        return {"updated_count": 0}
        
    data = update_data.dict(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
        
    data["updated_at"] = datetime.now()
    
    # Handle completion timestamp
    if "status" in data:
        if data["status"] == "done":
            data["completed_at"] = datetime.now()
        else:
            data["completed_at"] = None
            
    # Costruzione query dinamica
    set_clause = ", ".join([f"{key} = :{key}" for key in data.keys()])
    query = f"UPDATE tasks SET {set_clause} WHERE id = ANY(:ids)"
    
    values = data
    values["ids"] = task_ids
    
    await database.execute(query, values)
    
    return {"updated_count": len(task_ids), "updated_fields": list(data.keys())}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "8010"))
    uvicorn.run(app, host="0.0.0.0", port=port)
