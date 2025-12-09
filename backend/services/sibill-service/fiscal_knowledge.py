"""
Knowledge Base Fiscale Italiana per RAG (Retrieval-Augmented Generation).
Carica le regole dal file Markdown master.
"""
import os

KNOWLEDGE_FILE_PATH = os.path.join(os.path.dirname(__file__), "knowledge", "rules_italy_master.md")

# Cache del contenuto per evitare I/O continui
_FISCAL_KNOWLEDGE_CACHE = None

def load_fiscal_knowledge() -> str:
    """Carica l'intero contenuto del manuale fiscale."""
    global _FISCAL_KNOWLEDGE_CACHE
    if _FISCAL_KNOWLEDGE_CACHE:
        return _FISCAL_KNOWLEDGE_CACHE
    
    try:
        if os.path.exists(KNOWLEDGE_FILE_PATH):
            with open(KNOWLEDGE_FILE_PATH, "r", encoding="utf-8") as f:
                _FISCAL_KNOWLEDGE_CACHE = f.read()
            return _FISCAL_KNOWLEDGE_CACHE
        else:
            return "ERRORE: File knowledge base non trovato."
    except Exception as e:
        return f"ERRORE nel caricamento knowledge base: {str(e)}"

def get_fiscal_context(category_key: str) -> str:
    """
    Restituisce il contesto fiscale pertinente. 
    Attualmente restituisce l'intero manuale poiché è compatto e utile per il contesto generale.
    In futuro può essere implementato con ricerca semantica vettoriale.
    """
    full_knowledge = load_fiscal_knowledge()
    
    # Qui potremmo implementare una logica per estrarre solo paragrafi specifici
    # basati sulla category_key, ma dato che il manuale è denso,
    # per GPT-4o è meglio avere tutto il contesto per ragionare per analogia.
    
    return full_knowledge

def get_all_fiscal_rules_summary() -> str:
    """Restituisce il manuale completo per il System Prompt."""
    return load_fiscal_knowledge()
