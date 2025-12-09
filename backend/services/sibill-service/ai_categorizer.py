import os
import json
import asyncio
import math
import time
from typing import List, Dict, Any, Tuple
from datetime import datetime
from pydantic import BaseModel, Field
from openai import AsyncOpenAI
from database import database

# Configurazione
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
MODEL_NAME = "gpt-4o" 
MAX_CONCURRENT_REQUESTS = 5

# Import categorie e knowledge base fiscale
from categorizer import EXPENSE_CATEGORIES, categorize_transaction
from fiscal_knowledge import get_fiscal_context, get_all_fiscal_rules_summary

# --- AGENTIC DATA MODELS (Pydantic) ---
class AuditResult(BaseModel):
    passed: bool = Field(description="Se la categorizzazione è approvata")
    correction_needed: bool = Field(description="Se l'auditor suggerisce una correzione")
    audit_note: str = Field(description="Note dell'auditor")
    accounting_entry_type: str = Field(description="Tipo di registrazione contabile (COSTO o PATRIMONIO)")

class CategorizedTransaction(BaseModel):
    id: str
    triage_classification: str = Field(description="Classificazione alto livello (es. 'Servizio', 'Bene', 'Utenza')")
    final_category_key: str = Field(description="Chiave categoria fiscale scelta")
    confidence: float = Field(description="Percentuale di confidenza finale (0-100)")
    reasoning: str = Field(description="Spiegazione completa del processo di categorizzazione")
    accounting_entry: str = Field(description="Come va registrato contabilmente (es. 'COSTO' o 'PATRIMONIO -> Ammortamento')")
    audit: AuditResult

class AgenticResponse(BaseModel):
    cluster_analysis: str = Field(description="Analisi del cluster (pattern comuni, fornitore ricorrente, etc.)")
    transactions: List[CategorizedTransaction]

async def get_openai_client():
    if not OPENAI_API_KEY:
        print("⚠️ OPENAI_API_KEY non trovata. AI Categorization disabilitata.")
        return None
    return AsyncOpenAI(api_key=OPENAI_API_KEY)

def intelligent_clustering(items: List[Dict]) -> List[List[Dict]]:
    """
    Clustering intelligente per ottimizzare le chiamate API.
    Raggruppa per:
    1. Fornitore (counterpart_name) - Priorità massima
    2. Categoria euristica proposta
    3. Range di importo
    """
    clusters = {}
    
    for item in items:
        # Chiave di clustering: fornitore > categoria > range importo
        counterpart = (item.get('counterpart') or '').lower().strip()
        cat = item.get('current_category', 'altro')
        amount = abs(item.get('amount', 0))
        
        # Range importo (per pattern simili)
        if amount < 50:
            amount_range = "micro"
        elif amount < 200:
            amount_range = "piccolo"
        elif amount < 1000:
            amount_range = "medio"
        else:
            amount_range = "grande"
        
        # Chiave cluster: priorità fornitore, poi categoria
        if counterpart and len(counterpart) > 3:
            cluster_key = f"fornitore_{counterpart[:30]}"
        else:
            cluster_key = f"cat_{cat}_range_{amount_range}"
        
        if cluster_key not in clusters:
            clusters[cluster_key] = []
        clusters[cluster_key].append(item)
    
    # Converti in lista di cluster
    cluster_list = list(clusters.values())
    
    # Log clustering
    print(f"🧩 Clustering: {len(items)} items -> {len(cluster_list)} clusters")
    for i, cluster in enumerate(cluster_list):
        if len(cluster) > 1:
            sample = cluster[0]
            print(f"   Cluster {i+1}: {len(cluster)} items (Key: {sample.get('counterpart', sample.get('current_category', 'unknown'))})")
    
    return cluster_list

async def process_uncategorized_transactions(batch_size: int = 50, reprocess_all: bool = False):
    """
    Processo Agentic con RAG Fiscale e Clustering Intelligente.
    """
    task_start_time = time.time()
    print(f"🤖 [Finance Agents + RAG] Starting Ledger Optimization (Reprocess All: {reprocess_all})...")
    
    # --- FASE 1: Recupero Dati dal Ledger ---
    print("⚡ [Phase 1] Reading Finance Ledger...")
    
    query = """
        SELECT l.id, l.description, l.amount, t.raw_data, l.category_key
        FROM finance_ledger l
        JOIN sibill_transactions t ON l.source_id = t.id
        WHERE 1=1
    """
    if not reprocess_all:
        query += " AND (l.verification_status = 'NEW' OR l.confidence_score < 80)"
        
    rows = await database.fetch_all(query)
    
    if not rows:
        print("✅ Nessuna transazione da processare nel Ledger.")
        return

    # Preparazione dati con Euristica Locale
    pre_processed_data = []
    for row in rows:
        r = dict(row)
        desc = r['description'] or ""
        amount = float(r['amount'])
        
        counterpart = ""
        try:
            if r.get('raw_data'):
                raw = json.loads(r['raw_data']) if isinstance(r['raw_data'], str) else r['raw_data']
                counterpart = raw.get('counterpart_name', '')
        except:
            pass
            
        local_cat_key, _ = categorize_transaction(desc, abs(amount), counterpart)
        
        pre_processed_data.append({
            "id": r['id'],
            "description": desc,
            "amount": amount,
            "counterpart": counterpart,
            "current_category": local_cat_key,
        })
        
    print(f"⚡ [Phase 1] Loaded {len(pre_processed_data)} items.")
    
    # --- FASE 2: Clustering Intelligente ---
    clusters = intelligent_clustering(pre_processed_data)
    print(f"🧩 [Phase 2] Intelligent Clustering: {len(clusters)} clusters created.")

    # --- FASE 3: AI Agent Swarm con RAG ---
    print(f"🧠 [Phase 3] Launching Commercialista Agents with RAG...")
    
    sem = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)
    
    async def safe_process_cluster(cluster_items, cluster_idx):
        async with sem:
            try:
                await process_agentic_cluster(cluster_items, cluster_idx, len(clusters))
            except Exception as e:
                print(f"⚠️ [Cluster {cluster_idx+1}] Error: {e}")

    tasks = [safe_process_cluster(cluster, i) for i, cluster in enumerate(clusters)]
    await asyncio.gather(*tasks)

    total_duration = time.time() - task_start_time
    print(f"✅ [Finance Agents + RAG] Ledger Optimization Completed in {total_duration:.2f}s.")

async def process_agentic_cluster(cluster_items: List[Dict], cluster_idx: int, total_clusters: int):
    """
    Processa un cluster con Agente Commercialista che usa RAG.
    """
    t0 = time.time()
    client = await get_openai_client()
    if not client:
        return

    # RAG: Recupera regole fiscali per le categorie proposte nel cluster
    proposed_categories = set([item.get('current_category', 'altro') for item in cluster_items])
    rag_context = ""
    for cat in proposed_categories:
        fiscal_rule = get_fiscal_context(cat)
        if fiscal_rule:
            rag_context += fiscal_rule + "\n"
    
    # Se il cluster è omogeneo (stesso fornitore), aggiungi contesto specifico
    counterpart = cluster_items[0].get('counterpart', '')
    if counterpart and all(item.get('counterpart', '') == counterpart for item in cluster_items):
        rag_context += f"\nNOTA CLUSTER: Tutte le {len(cluster_items)} transazioni provengono dallo stesso fornitore '{counterpart}'. Applica la stessa logica contabile a tutte.\n"
    
    # System Prompt con RAG integrato
    system_prompt = f"""
    Sei un Agente Commercialista AI specializzato in contabilità italiana.
    
    CONOSCENZA FISCALE (RAG):
    {get_all_fiscal_rules_summary()}
    
    REGOLE CONTABILI CRITICHE:
    - BENI STRUMENTALI vanno a PATRIMONIO, non sono costi diretti. Il costo si scarica tramite AMMORTAMENTO.
    - Tutti gli altri sono COSTI nel Conto Economico.
    
    IL TUO COMPITO:
    1. Analizza il cluster di transazioni (sono simili per fornitore/categoria).
    2. Applica le regole fiscali sopra per categorizzare correttamente.
    3. Determina se è COSTO o PATRIMONIO (con ammortamento).
    4. L'Auditor verifica la coerenza.
    
    CONTESTO CLUSTER SPECIFICO:
    {rag_context}
    """

    minimal_items = [{
        "id": x["id"],
        "desc": x["description"],
        "amt": x["amount"],
        "cp": x["counterpart"],
        "proposed_cat": x["current_category"]
    } for x in cluster_items]

    user_prompt = f"""
    Cluster di {len(cluster_items)} transazioni simili da categorizzare:
    {json.dumps(minimal_items)}
    
    IMPORTANTE: Se sono tutte dello stesso fornitore, applica la stessa categoria a tutte (coerenza contabile).
    """

    response = await client.beta.chat.completions.parse(
        model=MODEL_NAME,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        response_format=AgenticResponse,
    )
    
    agent_response = response.choices[0].message.parsed
    
    # DB Update su FINANCE_LEDGER
    for item in agent_response.transactions:
        t_id = item.id
        cat_key = item.final_category_key
        
        if cat_key not in EXPENSE_CATEGORIES: cat_key = "altro"
        
        # Reasoning completo
        full_reasoning = f"[Triage: {item.triage_classification}] {item.reasoning} [Audit: {item.audit.audit_note}] [Registrazione: {item.accounting_entry}]"
        
        status = "VERIFIED" if item.audit.passed and item.confidence > 90 else "PROCESSED"
        
        await database.execute("""
            UPDATE finance_ledger
            SET category_key = :cat, 
                confidence_score = :conf, 
                agent_reasoning = :reason,
                verification_status = :status,
                last_agent_update = :now
            WHERE id = :id
        """, {
            "cat": cat_key,
            "conf": item.confidence,
            "reason": full_reasoning,
            "status": status,
            "now": datetime.now(),
            "id": t_id
        })
    
    duration = time.time() - t0
    print(f"✅ [Cluster {cluster_idx+1}/{total_clusters}] Commercialista Processed {len(agent_response.transactions)} items in {duration:.2f}s")

if __name__ == "__main__":
    import asyncio
    from database import init_database, close_database
    async def main():
        await init_database()
        await process_uncategorized_transactions(50, reprocess_all=True)
        await close_database()
    asyncio.run(main())
