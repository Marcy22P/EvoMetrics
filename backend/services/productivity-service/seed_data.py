"""
Script per popolare il database con i Workflow Template standard definiti.
Da eseguire una tantum o all'avvio se la tabella è vuota.
"""
import uuid

WORKFLOW_TEMPLATES = [
    {
        "id": "onboarding-cliente",
        "name": "Onboarding Cliente",
        "description": "Workflow standard per l'avvio di un nuovo cliente",
        "trigger_services": ["ALL"],
        "tasks_definition": [
            {"title": "Organizzare incontro con il cliente", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 0},
            {"title": "Fare incontro con il cliente (raccogliere accessi, checklist)", "role_required": "Project manager", "estimated_minutes": 90, "relative_start_days": 1, "dependencies_on_prev": True},
            {"title": "Fissare call di team x presentazione progetto", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 1, "dependencies_on_prev": True},
            {"title": "Fare call di team x presentazione progetto", "role_required": "Project manager", "estimated_minutes": 45, "relative_start_days": 2, "dependencies_on_prev": True},
            {"title": "Scrivere linee guida progetto con date", "role_required": "Project manager", "estimated_minutes": 180, "relative_start_days": 3},
            {"title": "Check del business manager (se presente)", "role_required": "Media Buyer", "estimated_minutes": 120, "relative_start_days": 3},
            {"title": "Creare business manager (se non presente)", "role_required": "Media Buyer", "estimated_minutes": 60, "relative_start_days": 3},
            {"title": "Fissare data per creazione materiale fotografico", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 4},
            {"title": "Start creazione e-comm", "role_required": "Shopify Expert", "estimated_minutes": 0, "relative_start_days": 14},
            {"title": "Start contenuti", "role_required": "Social media manager", "estimated_minutes": 0, "relative_start_days": 7},
            {"title": "Start campagne", "role_required": "Media Buyer", "estimated_minutes": 0, "relative_start_days": 7}
        ]
    },
    {
        "id": "sviluppo-ecommerce",
        "name": "Sviluppo E-commerce",
        "description": "Workflow completo creazione negozio Shopify",
        "trigger_services": ["Sito Web", "E-commerce", "Shopify"],
        "tasks_definition": [
            {"title": "Creare negozio shopify partner", "role_required": "Shopify Expert", "estimated_minutes": 5, "relative_start_days": 0},
            {"title": "Scegliere il tema", "role_required": "Shopify Expert", "estimated_minutes": 120, "relative_start_days": 1},
            {"title": "Definire colori e font", "role_required": "Shopify Expert", "estimated_minutes": 60, "relative_start_days": 2},
            {"title": "Fare alberatura e-commerce", "role_required": "SEO Specialist", "estimated_minutes": 60, "relative_start_days": 2},
            {"title": "Organizzare shooting", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 3},
            {"title": "Fare shooting", "role_required": "Fotografo", "estimated_minutes": 240, "relative_start_days": 5},
            {"title": "Editare shooting", "role_required": "Fotografo", "estimated_minutes": 180, "relative_start_days": 7, "dependencies_on_prev": True},
            {"title": "Caricare prodotti", "role_required": "Social media manager", "estimated_minutes": 5, "relative_start_days": 8},
            {"title": "Ordinare prodotti", "role_required": "Social media manager", "estimated_minutes": 360, "relative_start_days": 9},
            {"title": "Assegnare prodotti alle collezioni", "role_required": "Social media manager", "estimated_minutes": 30, "relative_start_days": 10},
            {"title": "Fare prima bozza progetto (Home, Collezioni, Prodotti)", "role_required": "Shopify Expert", "estimated_minutes": 420, "relative_start_days": 12},
            {"title": "Fissare appuntamento con cliente", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 13},
            {"title": "Fare appuntamento con cliente (Revisione bozza)", "role_required": "Project manager", "estimated_minutes": 90, "relative_start_days": 15},
            {"title": "Comprare il tema", "role_required": "Shopify Expert", "estimated_minutes": 5, "relative_start_days": 16},
            {"title": "Implementare app", "role_required": "Shopify Expert", "estimated_minutes": 120, "relative_start_days": 17},
            {"title": "Completare Homepage", "role_required": "Shopify Expert", "estimated_minutes": 120, "relative_start_days": 18},
            {"title": "Completare pagine collezione", "role_required": "Shopify Expert", "estimated_minutes": 240, "relative_start_days": 19},
            {"title": "Completare pagine prodotto", "role_required": "Shopify Expert", "estimated_minutes": 240, "relative_start_days": 20},
            {"title": "Completare carrello", "role_required": "Shopify Expert", "estimated_minutes": 30, "relative_start_days": 21},
            {"title": "Completare checkout", "role_required": "Shopify Expert", "estimated_minutes": 30, "relative_start_days": 21},
            {"title": "Fare iubenda per privacy", "role_required": "Shopify Expert", "estimated_minutes": 120, "relative_start_days": 22},
            {"title": "Finire sito web (Footer, collegamenti)", "role_required": "Shopify Expert", "estimated_minutes": 420, "relative_start_days": 25},
            {"title": "Fissare appuntamento finale", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 26},
            {"title": "Fare appuntamento con cliente (Consegna)", "role_required": "Project manager", "estimated_minutes": 90, "relative_start_days": 28},
            {"title": "Comprare Abbonamento", "role_required": "Shopify Expert", "estimated_minutes": 5, "relative_start_days": 29},
            {"title": "Impostare DNS", "role_required": "Shopify Expert", "estimated_minutes": 45, "relative_start_days": 30},
            {"title": "Ottimizzazione SEO", "role_required": "SEO Specialist", "estimated_minutes": 240, "relative_start_days": 35}
        ]
    },
    {
        "id": "creazione-contenuti",
        "name": "Creazione Contenuti (Mensile)",
        "description": "Ciclo mensile produzione contenuti",
        "trigger_services": ["Social Media", "Contenuti", "Reels"],
        "tasks_definition": [
            {"title": "Fissare appuntamento", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 0},
            {"title": "Scrivere script", "role_required": "Content creator", "estimated_minutes": 120, "relative_start_days": 2},
            {"title": "Mandare al cliente", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 3, "dependencies_on_prev": True},
            {"title": "Registrare contenuti", "role_required": "Content creator", "estimated_minutes": 240, "relative_start_days": 5},
            {"title": "Caricare contenuti nel drive", "role_required": "Content creator", "estimated_minutes": 45, "relative_start_days": 6, "dependencies_on_prev": True},
            {"title": "Dare istruzioni all’editor", "role_required": "Content creator", "estimated_minutes": 45, "relative_start_days": 7},
            {"title": "Editare contenuti", "role_required": "Video editor", "estimated_minutes": 420, "relative_start_days": 10, "dependencies_on_prev": True},
            {"title": "Caricare contenuti editati nel drive", "role_required": "Video editor", "estimated_minutes": 45, "relative_start_days": 12, "dependencies_on_prev": True},
            {"title": "Mandare in approvazione al cliente", "role_required": "Social media manager", "estimated_minutes": 5, "relative_start_days": 13, "dependencies_on_prev": True},
            {"title": "Fare rework (se necessario)", "role_required": "Video editor", "estimated_minutes": 120, "relative_start_days": 15},
            {"title": "Programmare contenuti sulle piattaforme", "role_required": "Social media manager", "estimated_minutes": 30, "relative_start_days": 18}
        ]
    },
    {
        "id": "email-marketing",
        "name": "Email Marketing",
        "description": "Campagna email o newsletter",
        "trigger_services": ["Email Marketing", "Newsletter"],
        "tasks_definition": [
            {"title": "Definire l’offerta campagne o promozioni", "role_required": "Project manager", "estimated_minutes": 60, "relative_start_days": 0},
            {"title": "Decidere pubblicazione mensile (con date)", "role_required": "Project manager", "estimated_minutes": 30, "relative_start_days": 1},
            {"title": "Scrivere mail", "role_required": "Copywriter", "estimated_minutes": 180, "relative_start_days": 3},
            {"title": "Mandare in approvazione", "role_required": "Copywriter", "estimated_minutes": 5, "relative_start_days": 4, "dependencies_on_prev": True},
            {"title": "Programmare sequenza e-mail", "role_required": "Copywriter", "estimated_minutes": 30, "relative_start_days": 6}
        ]
    },
    {
        "id": "campagne-adv",
        "name": "Campagne Pubblicitarie (Mensile)",
        "description": "Ciclo gestione campagne ADV",
        "trigger_services": ["ADV", "Facebook Ads", "Google Ads"],
        "tasks_definition": [
            {"title": "Fissare obiettivo campagna, offerta e budget", "role_required": "Project manager", "estimated_minutes": 60, "relative_start_days": 0},
            {"title": "Scrivere report e angles della campagna", "role_required": "Media Buyer", "estimated_minutes": 60, "relative_start_days": 1},
            {"title": "Impostare campagne pubblicitarie", "role_required": "Media Buyer", "estimated_minutes": 120, "relative_start_days": 2},
            {"title": "Fare grafiche per adv", "role_required": "Content creator", "estimated_minutes": 340, "relative_start_days": 3},
            {"title": "Fissare registrazione creative", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 4},
            {"title": "Scrivere copy creative", "role_required": "Content creator", "estimated_minutes": 60, "relative_start_days": 5},
            {"title": "Mandare in approvazione al cliente", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 6},
            {"title": "Registrare creative", "role_required": "Content creator", "estimated_minutes": 180, "relative_start_days": 8},
            {"title": "Caricare creative nel drive", "role_required": "Content creator", "estimated_minutes": 45, "relative_start_days": 9},
            {"title": "Dare istruzioni all’editor", "role_required": "Content creator", "estimated_minutes": 60, "relative_start_days": 10},
            {"title": "Editare creative", "role_required": "Video editor", "estimated_minutes": 420, "relative_start_days": 13},
            {"title": "Caricare creative editate nel drive", "role_required": "Video editor", "estimated_minutes": 45, "relative_start_days": 14},
            {"title": "Far partire campagne", "role_required": "Media Buyer", "estimated_minutes": 60, "relative_start_days": 15}
        ]
    },
    {
        "id": "link-building",
        "name": "Link Building (Mensile)",
        "description": "Attività SEO off-site mensile",
        "trigger_services": ["SEO", "Link Building"],
        "tasks_definition": [
            {"title": "Comprare articoli", "role_required": "SEO Specialist", "estimated_minutes": 60, "relative_start_days": 0},
            {"title": "Apportare modifiche a pagine sul sito", "role_required": "SEO Specialist", "estimated_minutes": 180, "relative_start_days": 5},
            {"title": "Mandare link comprati mensilmente", "role_required": "SEO Specialist", "estimated_minutes": 20, "relative_start_days": 20},
            {"title": "Fare report", "role_required": "SEO Specialist", "estimated_minutes": 60, "relative_start_days": 28},
            {"title": "Mandare report al cliente", "role_required": "Project manager", "estimated_minutes": 5, "relative_start_days": 30}
        ]
    }
]

async def seed_templates(database):
    """Popola la tabella workflow_templates con reset forzato per aggiornamenti"""
    import json
    
    print("🌱 Seeding workflow templates (Overwriting)...")
    
    # Rimuovi vecchi per aggiornare le definizioni
    await database.execute("DELETE FROM workflow_templates")
    
    query = """
    INSERT INTO workflow_templates (id, name, description, tasks_definition, trigger_services)
    VALUES (:id, :name, :description, :tasks_definition, :trigger_services)
    """
    
    for tmpl in WORKFLOW_TEMPLATES:
        await database.execute(query, {
            "id": tmpl["id"],
            "name": tmpl["name"],
            "description": tmpl["description"],
            "tasks_definition": json.dumps(tmpl["tasks_definition"]),
            "trigger_services": json.dumps(tmpl.get("trigger_services", []))
        })
    
    print("✅ Workflow templates aggiornati.")
