"""
EvoAgent — Piattaforma multi-agente per EvoMetrics.

Architettura:
  EvoAgentOrchestrator   ←─ riceve il messaggio, sceglie l'agente
        │
        ├── SalesAgent      (Pipeline, lead, opportunità)
        ├── OpsAgent        (Task, workflow, assegnazioni)
        ├── FinanceAgent    (Pagamenti, fatture, SIBill)
        └── ClientsAgent    (Anagrafica, contratti, drive)

Ogni agente ha:
  - system_prompt verticale
  - tool set dedicato
  - istanza Claude propria

L'orchestratore sceglie l'agente giusto (o usa tutti) e aggrega le risposte.
Tutti i tool call usano il JWT dell'utente → auth + permessi preservati.
"""

import asyncio
import json
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

try:
    import anthropic as _anthropic_lib
    _ANTHROPIC_AVAILABLE = True
except ImportError:
    _anthropic_lib = None  # type: ignore
    _ANTHROPIC_AVAILABLE = False

# ─── Configurazione ────────────────────────────────────────────────────────────
# Letti a call-time per evitare problemi di import-order con load_dotenv
def _anthropic_key() -> Optional[str]:
    return (
        os.environ.get("ANTHROPIC_API_KEY")
        or os.environ.get("CLAUDE_API_KEY")
    )

def _model() -> str:
    return (
        os.environ.get("CLAUDE_ORCHESTRATOR_MODEL")
        or os.environ.get("CLAUDE_MODEL")
        or "claude-sonnet-4-6"
    )

def _fast_model() -> str:
    """Model ultraleggero per task semplici (classificazione, riepilogo breve)."""
    return os.environ.get("CLAUDE_FAST_MODEL") or "claude-haiku-4-5"

MAX_TOOL_ITERATIONS = 5

# ─── Tool Definitions ──────────────────────────────────────────────────────────

SALES_TOOLS: List[Dict] = [
    {
        "name": "get_pipeline_stages",
        "description": "Recupera la lista degli stage della pipeline (chiavi e label). Utile prima di operazioni sugli stage.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_pipeline_overview",
        "description": "Stato completo della sales pipeline: tutti i lead raggruppati per stage, con valore deal e canale fonte.",
        "input_schema": {
            "type": "object",
            "properties": {"stage": {"type": "string", "description": "Filtra per stage specifico (opzionale)"}},
            "required": [],
        },
    },
    {
        "name": "get_lead_details",
        "description": "Dettaglio completo di un lead: dati anagrafici, stage, note, deal value, servizi, assegnatario.",
        "input_schema": {
            "type": "object",
            "properties": {"lead_id": {"type": "string", "description": "ID del lead (anche parziale)"}},
            "required": ["lead_id"],
        },
    },
    {
        "name": "update_lead_stage",
        "description": "Sposta un lead a un nuovo stage della pipeline.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string"},
                "new_stage": {"type": "string", "description": "Chiave dello stage (es. 'optin', 'qualified', 'proposta', 'contratto', 'chiuso')"},
                "note": {"type": "string", "description": "Nota opzionale da aggiungere al lead"},
            },
            "required": ["lead_id", "new_stage"],
        },
    },
    {
        "name": "create_lead",
        "description": "Crea un nuovo lead nella pipeline.",
        "input_schema": {
            "type": "object",
            "properties": {
                "email": {"type": "string"},
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "azienda": {"type": "string"},
                "phone": {"type": "string"},
                "source_channel": {"type": "string", "description": "Es. Meta Ads, Google Ads, Referral, ClickFunnels"},
                "stage": {"type": "string"},
                "notes": {"type": "string"},
            },
            "required": ["email"],
        },
    },
    {
        "name": "get_pipeline_analytics",
        "description": "Analisi mensile del valore della pipeline: totale deal per mese con variazione percentuale.",
        "input_schema": {
            "type": "object",
            "properties": {"year": {"type": "integer", "description": "Anno (default anno corrente)"}},
            "required": [],
        },
    },
    {
        "name": "get_pipeline_metrics",
        "description": "KPI completi della pipeline in una sola chiamata: lead per stage, alert urgenti (optin >24h non contattati, zombie >7gg), appuntamenti oggi, tasso di conversione, lead per fonte.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_zombie_leads",
        "description": "Lead fermi nello stesso stage attivo da troppi giorni (default >7gg). Identifica pipeline bloccata e lead da riattivare.",
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {"type": "integer", "description": "Soglia giorni (default 7)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_priority_queue",
        "description": "Coda lead prioritizzata per il setter: lead in optin/contattato ordinati per lead_score e urgenza. Include ore da optin, consapevolezza, budget.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_appointments_today",
        "description": "Appuntamenti fissati oggi e nei prossimi 2 giorni, con dettaglio lead, pacchetto consigliato e venditore assegnato.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "search_fireflies_transcripts",
        "description": "Cerca trascrizioni di chiamate in Fireflies per nome, azienda o parola chiave. Restituisce id, titolo, data, summary e partecipanti delle trascrizioni trovate.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Nome, azienda o parola chiave da cercare nelle trascrizioni"},
                "limit": {"type": "integer", "description": "Numero massimo di risultati (default 5)"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_fireflies_transcript",
        "description": "Recupera il dettaglio completo di una trascrizione Fireflies: summary, action items, key topics, sentiment, durata.",
        "input_schema": {
            "type": "object",
            "properties": {
                "transcript_id": {"type": "string", "description": "ID univoco della trascrizione Fireflies"},
            },
            "required": ["transcript_id"],
        },
    },
    {
        "name": "match_lead_to_transcripts",
        "description": "Cerca in Fireflies le trascrizioni correlate a uno specifico lead della pipeline (per nome, cognome, azienda ed email). Restituisce le trascrizioni candidate con un punteggio di match.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string", "description": "ID del lead nella pipeline"},
            },
            "required": ["lead_id"],
        },
    },
    {
        "name": "bulk_fetch_for_enrichment",
        "description": "Recupera in parallelo le ultime trascrizioni Fireflies e tutti i lead della pipeline per permettere il matching bulk. Usare quando l'utente chiede di arricchire i lead con le trascrizioni esistenti.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "description": "Numero massimo di trascrizioni da recuperare (default 20)"},
            },
            "required": [],
        },
    },
    {
        "name": "update_lead_notes",
        "description": "Aggiunge una nota strutturata a un lead, tipicamente con i dati estratti da una trascrizione Fireflies.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string", "description": "ID del lead"},
                "note_content": {"type": "string", "description": "Testo della nota da aggiungere"},
            },
            "required": ["lead_id", "note_content"],
        },
    },
    # ── AirCall tools ────────────────────────────────────────────────────────────
    {
        "name": "aircall_create_contact",
        "description": "Crea o aggiorna un contatto in AirCall a partire da un lead della pipeline. Salva l'aircall_contact_id nel lead per il collegamento automatico delle chiamate future. Da usare prima di chiamare un lead.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string", "description": "ID del lead da sincronizzare in AirCall"},
            },
            "required": ["lead_id"],
        },
    },
    {
        "name": "aircall_get_contact_calls",
        "description": "Recupera le chiamate AirCall di un lead già sincronizzato (richiede aircall_contact_id). Mostra data, durata, direzione, status e se esiste una registrazione.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string", "description": "ID del lead (deve avere aircall_contact_id)"},
                "limit": {"type": "integer", "description": "Numero massimo di chiamate (default 10)"},
            },
            "required": ["lead_id"],
        },
    },
    {
        "name": "aircall_get_call_details",
        "description": "Dettaglio completo di una specifica chiamata AirCall: URL registrazione, durata, commenti, agente che ha chiamato.",
        "input_schema": {
            "type": "object",
            "properties": {
                "call_id": {"type": "string", "description": "ID numerico della chiamata AirCall"},
            },
            "required": ["call_id"],
        },
    },
    {
        "name": "aircall_match_lead_to_calls",
        "description": "Cerca in AirCall le chiamate correlate a un lead (per numero di telefono o contatto collegato). Utile per trovare registrazioni di chiamate passate.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string", "description": "ID del lead"},
            },
            "required": ["lead_id"],
        },
    },
]

OPS_TOOLS: List[Dict] = [
    {
        "name": "get_overdue_tasks",
        "description": "Tutti i task scaduti del team, ordinati per urgenza (giorni di ritardo). Fondamentale per il briefing operativo.",
        "input_schema": {
            "type": "object",
            "properties": {
                "assignee_id": {"type": "string", "description": "Filtra per utente specifico (opzionale)"},
                "limit": {"type": "integer", "description": "Max risultati (default 20)"},
            },
            "required": [],
        },
    },
    {
        "name": "get_tasks",
        "description": "Lista task con filtri per utente, status, progetto o cliente.",
        "input_schema": {
            "type": "object",
            "properties": {
                "assignee_id": {"type": "string"},
                "status": {"type": "string", "enum": ["todo", "in_progress", "done", "blocked"]},
                "project_id": {"type": "string", "description": "ID cliente/progetto"},
                "limit": {"type": "integer"},
            },
            "required": [],
        },
    },
    {
        "name": "update_task_status",
        "description": "Aggiorna lo status di un task.",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "string"},
                "status": {"type": "string", "enum": ["todo", "in_progress", "done", "blocked"]},
            },
            "required": ["task_id", "status"],
        },
    },
    {
        "name": "get_users_list",
        "description": "Lista utenti/team members attivi con ruoli e job_title.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_workflow_templates",
        "description": "Lista dei template workflow disponibili (onboarding, sviluppo ecommerce, campagne ADV, ecc.).",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "update_lead_assignee",
        "description": "Assegna o riassegna un'opportunità di vendita a un membro del team. Prima usa get_users_list per ottenere gli ID utente disponibili.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string", "description": "ID del lead (anche parziale)"},
                "user_id": {"type": "string", "description": "ID dell'utente a cui assegnare il lead"},
                "note": {"type": "string", "description": "Nota opzionale sulla riassegnazione"},
            },
            "required": ["lead_id", "user_id"],
        },
    },
    {
        "name": "delete_lead",
        "description": "Elimina definitivamente un lead dalla pipeline. Usare SOLO su richiesta esplicita dell'utente. Operazione irreversibile.",
        "input_schema": {
            "type": "object",
            "properties": {
                "lead_id": {"type": "string", "description": "ID del lead da eliminare"},
                "confirm": {"type": "boolean", "description": "Deve essere true per confermare l'eliminazione"},
            },
            "required": ["lead_id", "confirm"],
        },
    },
    {
        "name": "send_slack_message",
        "description": "Invia un messaggio in un canale Slack o in DM. Usa per notifiche urgenti su lead, follow-up o aggiornamenti pipeline.",
        "input_schema": {
            "type": "object",
            "properties": {
                "channel": {"type": "string", "description": "Nome canale (es. #sales, #team) o username (es. @marcello)"},
                "message": {"type": "string", "description": "Testo del messaggio"},
            },
            "required": ["channel", "message"],
        },
    },
    {
        "name": "create_clickup_task",
        "description": "Crea un task in ClickUp per un follow-up o azione commerciale da tracciare.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Titolo del task"},
                "description": {"type": "string", "description": "Dettagli del task"},
                "due_date": {"type": "string", "description": "Data scadenza ISO (es. 2026-03-20)"},
                "assignee_name": {"type": "string", "description": "Nome del membro team"},
            },
            "required": ["title"],
        },
    },
]

FINANCE_TOOLS: List[Dict] = [
    {
        "name": "get_pagamenti_status",
        "description": "Stato pagamenti: in attesa, scaduti, incassati. Panoramica finanziaria per cliente o globale.",
        "input_schema": {
            "type": "object",
            "properties": {
                "client_name": {"type": "string", "description": "Filtra per nome cliente (opzionale)"},
                "status": {"type": "string", "description": "Filtra per status: pending, overdue, paid"},
            },
            "required": [],
        },
    },
    {
        "name": "get_pipeline_analytics",
        "description": "Valore mensile della pipeline commerciale con trend e delta percentuale.",
        "input_schema": {
            "type": "object",
            "properties": {"year": {"type": "integer"}},
            "required": [],
        },
    },
    {
        "name": "get_preventivi_list",
        "description": "Lista preventivi emessi con stato e importo. Utile per analisi commerciale.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_contratti_list",
        "description": "Lista contratti firmati/in bozza con valore e date di decorrenza.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]

CLIENTS_TOOLS: List[Dict] = [
    {
        "name": "get_all_clients",
        "description": "Lista di tutti i clienti attivi con nome azienda, servizi, referente.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_client_overview",
        "description": "Panoramica completa di un cliente: contratti, preventivi, task attivi, note, Drive.",
        "input_schema": {
            "type": "object",
            "properties": {"client_id": {"type": "string"}},
            "required": ["client_id"],
        },
    },
    {
        "name": "get_servizi_catalog",
        "description": "Catalogo servizi di Evoluzione Imprese con categorie e prezzi base.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_contratti_list",
        "description": "Lista contratti: stato, cliente, valore, scadenza.",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
]

# Agente universale: tutti i tool
ALL_TOOLS = SALES_TOOLS + OPS_TOOLS + FINANCE_TOOLS + CLIENTS_TOOLS

# Deduplication per tool con stesso nome (FINANCE_TOOLS + CLIENTS_TOOLS condividono alcuni)
def _dedup_tools(tools: List[Dict]) -> List[Dict]:
    seen = set()
    out = []
    for t in tools:
        if t["name"] not in seen:
            seen.add(t["name"])
            out.append(t)
    return out

ALL_TOOLS = _dedup_tools(ALL_TOOLS)

# ─── Configurazione Agenti ─────────────────────────────────────────────────────

AGENT_CONFIGS: Dict[str, Dict] = {
    "orchestrator": {
        "id": "orchestrator",
        "name": "EvoAgent",
        "emoji": "🤖",
        "description": "Assistente operativo completo — accede a tutta la piattaforma",
        "tools": ALL_TOOLS,
        "system_prompt": """Sei EvoAgent, l'assistente AI operativo di Evoluzione Imprese.
Hai accesso all'intera piattaforma: pipeline, task, clienti, pagamenti, workflow, AirCall, Fireflies.
Sei preciso, diretto e operativo. Usa i tool per recuperare dati reali.
Nel dubbio su quale agente usare, gestisci tu direttamente.

Comportamento proattivo:
- Se hai CONTESTO ATTIVO (es. lead aperto), usalo immediatamente
- Se ti chiedono di una persona per nome, cercala con i tool — non chiedere l'ID
- Agisci in autonomia: list_leads → ottieni ID → esegui operazione""",
    },
    "sales": {
        "id": "sales",
        "name": "Sales Agent",
        "emoji": "📊",
        "description": "Esperto Pipeline — lead, opportunità, stage, analytics",
        "tools": SALES_TOOLS,
        "system_prompt": """Sei il Sales Agent di Evoluzione Imprese.
Il tuo dominio è la sales pipeline: lead, stage, deal value, fonti di acquisizione.

Fonti di dati disponibili:
1. **EvoMetrics** (tool interni): pipeline, stage, preventivi, contratti
2. **Fireflies** (se configurato): trascrizioni call di vendita e meeting
3. **AirCall** (tool interni): contatti, chiamate, sincronizzazione

Comportamento proattivo:
- Se hai già il CONTESTO ATTIVO con un lead, agisci subito senza chiedere ulteriori dati
- Se ti chiedono di un lead per nome (es. "Sincronizza Beatrice su AirCall"), usa list_leads per trovarlo, poi agisci
- Non chiedere mai l'ID a meno che non ci siano più lead con lo stesso nome
- Per creare un contatto AirCall: trova il lead con list_leads → usa aircall_create_contact con l'ID trovato

Quando analizzi lead o trattative, combina le fonti disponibili:
- Stato pipeline → tool EvoMetrics
- "Cosa è emerso nella call con X?" → cerca su Fireflies per nome/azienda
- "Lead contattati di recente?" → Fireflies trascrizioni + pipeline EvoMetrics

Sii analitico e orientato alla conversione. Usa i tool per dati reali, non inventare.""",
    },
    "ops": {
        "id": "ops",
        "name": "Ops Agent",
        "emoji": "⚙️",
        "description": "Responsabile Operativo — task, workflow, team, scadenze",
        "tools": OPS_TOOLS,
        "system_prompt": """Sei l'Ops Agent di Evoluzione Imprese.
Il tuo dominio è la gestione operativa: task del team, workflow, scadenze, assegnazioni.
Monitora i task in ritardo, gestisci le priorità, tieni traccia del lavoro del team.
Sii proattivo nell'identificare blocchi e ritardi.""",
    },
    "finance": {
        "id": "finance",
        "name": "Finance Agent",
        "emoji": "💰",
        "description": "Analista Finance — pagamenti, fatture, valore contratti",
        "tools": FINANCE_TOOLS,
        "system_prompt": """Sei il Finance Agent di Evoluzione Imprese.
Il tuo dominio è la situazione finanziaria: pagamenti in sospeso o scaduti, valore della pipeline, preventivi e contratti.
Fornisci analisi chiare del flusso di cassa e delle opportunità economiche.
Sii preciso con i numeri e proattivo sui pagamenti scaduti.""",
    },
    "clients": {
        "id": "clients",
        "name": "Client Agent",
        "emoji": "👥",
        "description": "Gestione Clienti — anagrafica, contratti, servizi attivi",
        "tools": CLIENTS_TOOLS,
        "system_prompt": """Sei il Client Agent di Evoluzione Imprese.
Il tuo dominio è l'anagrafica clienti: dati, contratti, servizi attivi, Drive, documenti.
Fornisci panoramiche complete sui clienti, identifica opportunità di upsell.
Sii orientato alla relazione e alla soddisfazione del cliente.""",
    },
}

# ─── Fireflies GraphQL ────────────────────────────────────────────────────────

_FIREFLIES_GQL_URL = "https://api.fireflies.ai/graphql"

def _fireflies_token() -> Optional[str]:
    return os.environ.get("FIREFLIES_API_KEY")

# ─── AirCall REST ─────────────────────────────────────────────────────────────

_AIRCALL_BASE = "https://api.aircall.io/v1"

def _aircall_auth_headers() -> Dict:
    """Header Basic Auth per AirCall.
    Supporta tre formati per AIRCALL_API:
      - 'api_id:api_token'  → Basic Auth già combinato
      - token singolo + AIRCALL_API_ID env var → Basic Auth
      - token singolo senza ID → Bearer (fallback)
    """
    import base64
    api_key = os.environ.get("AIRCALL_API", "")
    if not api_key:
        raise RuntimeError("AIRCALL_API non configurata nelle env var.")
    if ":" in api_key:
        encoded = base64.b64encode(api_key.encode()).decode()
    else:
        api_id = os.environ.get("AIRCALL_API_ID", "")
        if api_id:
            encoded = base64.b64encode(f"{api_id}:{api_key}".encode()).decode()
        else:
            return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "Accept": "application/json"}
    return {"Authorization": f"Basic {encoded}", "Content-Type": "application/json", "Accept": "application/json"}

async def _aircall_get(path: str, params: Optional[Dict] = None) -> Dict:
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.get(f"{_AIRCALL_BASE}{path}", headers=_aircall_auth_headers(), params=params or {})
        r.raise_for_status()
        return r.json()

async def _aircall_post(path: str, body: Dict) -> Dict:
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.post(f"{_AIRCALL_BASE}{path}", headers=_aircall_auth_headers(), json=body)
        r.raise_for_status()
        return r.json()

async def _aircall_patch(path: str, body: Dict) -> Dict:
    async with httpx.AsyncClient(timeout=20.0) as c:
        r = await c.patch(f"{_AIRCALL_BASE}{path}", headers=_aircall_auth_headers(), json=body)
        r.raise_for_status()
        return r.json()

# (MCP remoto Fireflies rimosso: https://api.fireflies.ai/mcp non esiste.
#  Usiamo direttamente la GraphQL API di Fireflies via tool interni.)


# ─── HTTP Tool Executor ────────────────────────────────────────────────────────

class ToolExecutor:
    """Esegue le chiamate API verso il Gateway preservando il JWT dell'utente."""

    def __init__(self, token: str, base_url: str):
        self.token = token
        self.base_url = base_url.rstrip("/")
        self._headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

    async def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.get(f"{self.base_url}{path}", headers=self._headers, params=params or {})
            r.raise_for_status()
            return r.json()

    async def _post(self, path: str, body: Dict) -> Any:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(f"{self.base_url}{path}", headers=self._headers, json=body)
            r.raise_for_status()
            return r.json()

    async def _put(self, path: str, body: Dict) -> Any:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.put(f"{self.base_url}{path}", headers=self._headers, json=body)
            r.raise_for_status()
            return r.json()

    async def _delete(self, path: str) -> Any:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.delete(f"{self.base_url}{path}", headers=self._headers)
            r.raise_for_status()
            return r.json() if r.text else {}

    # ── Tool implementations ────────────────────────────────────────────────

    async def get_pipeline_stages(self) -> str:
        try:
            stages = await self._get("/api/pipeline/stages")
            return "\n".join(f"- `{s['key']}`: {s['label']}" for s in stages) or "Nessuno stage trovato."
        except Exception as e:
            return f"Errore: {e}"

    async def get_pipeline_overview(self, stage: Optional[str] = None) -> str:
        try:
            leads = await self._get("/api/leads", {"stage": stage} if stage else {})
            if not leads:
                return "Nessun lead in pipeline."
            by_stage: Dict[str, List] = {}
            for l in leads:
                by_stage.setdefault(l.get("stage", "?"), []).append(l)

            # deal_value è in centesimi (es. 150000 = €1.500); divisione per 100
            raw_values = [l.get("deal_value", 0) or 0 for l in leads]
            raw_total = sum(raw_values)
            # euristica: se il massimo è > 10000 sono certamente centesimi
            divisor = 100 if (max(raw_values, default=0) > 10000 or raw_total > 10000) else 1
            total_val = raw_total / divisor
            value_warning = "\n_Deal value non ancora popolato — i valori economici non sono disponibili._" if raw_total == 0 else ""

            lines = [f"**Pipeline — {len(leads)} lead | valore totale €{total_val:,.0f}**{value_warning}\n"]
            for stage_key, stage_leads in sorted(by_stage.items()):
                stage_val = sum(l.get("deal_value", 0) or 0 for l in stage_leads) / divisor
                lines.append(f"\n### {stage_key.upper()} ({len(stage_leads)}) — €{stage_val:,.0f}")
                for l in stage_leads[:6]:
                    name = f"{l.get('first_name','')} {l.get('last_name','')}".strip() or l.get("email","?")
                    az = f" | {l['azienda']}" if l.get("azienda") else ""
                    raw_dv = l.get("deal_value") or 0
                    val = f" | €{raw_dv/divisor:,.0f}" if raw_dv else ""
                    src = f" | {l['source_channel']}" if l.get("source_channel") else ""
                    ch = (l.get("lead_tag") or {}).get("label", "")
                    tag = f" [{ch}]" if ch else ""
                    lines.append(f"- **{name}**{az}{val}{src}{tag} `{l['id'][:8]}`")
                if len(stage_leads) > 6:
                    lines.append(f"  _...e altri {len(stage_leads)-6}_")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore recupero pipeline: {e}"

    async def get_lead_details(self, lead_id: str) -> str:
        try:
            leads = await self._get("/api/leads")
            lead = next((l for l in leads if l["id"] == lead_id or l["id"].startswith(lead_id)), None)
            if not lead:
                return f"Lead `{lead_id}` non trovato."
            raw_dv = lead.get("deal_value") or 0
            val = f"€{raw_dv/100:,.2f}" if raw_dv > 0 else "non impostato"
            assigned = ""
            if lead.get("assigned_to_user"):
                u = lead["assigned_to_user"]
                assigned = f"{u.get('nome','')} {u.get('cognome','')}".strip() or u.get("username","?")
            svcs = ""
            if lead.get("deal_services"):
                svcs = "\n**Servizi:** " + ", ".join(f"{s['name']} (€{s['price']:,.0f})" for s in lead["deal_services"])
            notes = (lead.get("notes") or "nessuna")[:200]
            return (
                f"**{(lead.get('first_name','') + ' ' + lead.get('last_name','')).strip() or lead['email']}**\n"
                f"Email: {lead.get('email','N/D')} | Tel: {lead.get('phone','N/D')}\n"
                f"Azienda: {lead.get('azienda','N/D')}\n"
                f"Stage: **{lead.get('stage','?')}** | Source: {lead.get('source_channel', lead.get('source','N/D'))}\n"
                f"Deal: {val} | Assegnato a: {assigned or 'nessuno'}\n"
                f"Tag: {(lead.get('lead_tag') or {}).get('label','nessuno')} | Status: {lead.get('response_status','?')}\n"
                f"Note: {notes}"
                f"{svcs}\n"
                f"Creato: {(lead.get('created_at',''))[:10]} | ID: `{lead['id']}`"
            )
        except Exception as e:
            return f"Errore dettaglio lead: {e}"

    async def update_lead_stage(self, lead_id: str, new_stage: str, note: Optional[str] = None) -> str:
        try:
            body: Dict[str, Any] = {"stage": new_stage}
            if note:
                body["notes"] = note
            await self._put(f"/api/leads/{lead_id}", body)
            return f"✅ Lead `{lead_id[:8]}...` spostato allo stage **{new_stage}**."
        except Exception as e:
            return f"❌ Errore aggiornamento stage: {e}"

    async def create_lead(self, email: str, **kwargs) -> str:
        try:
            body = {"email": email, **{k: v for k, v in kwargs.items() if v is not None}}
            r = await self._post("/api/leads", body)
            return f"✅ Lead creato: {email} | ID: `{(r.get('id','?'))[:8]}`"
        except Exception as e:
            return f"❌ Errore creazione lead: {e}"

    async def get_pipeline_analytics(self, year: Optional[int] = None) -> str:
        try:
            params = {"year": year or datetime.now().year}
            data = await self._get("/api/pipeline/analytics/monthly-value", params)
            months = data.get("months", [])
            year_total = data.get("year_total", 0)
            lines = [f"**Pipeline {data.get('year','?')} — Totale annuo: €{year_total:,.0f}**\n"]
            for m in months:
                if m["leads_count"] == 0 and m["total_value"] == 0:
                    continue
                delta = f" ({'+' if (m['delta_pct'] or 0) >= 0 else ''}{m['delta_pct']:.1f}%)" if m.get("delta_pct") is not None else ""
                lines.append(f"- **{m['label']}**: €{m['total_value']:,.0f} | {m['leads_count']} lead{delta}")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore analytics: {e}"

    async def get_overdue_tasks(self, assignee_id: Optional[str] = None, limit: int = 20) -> str:
        try:
            params: Dict = {}
            if assignee_id:
                params["assignee"] = assignee_id
            tasks = await self._get("/api/tasks", params)
            if isinstance(tasks, dict):
                tasks = tasks.get("tasks", tasks.get("data", []))
            now = datetime.utcnow().date()

            overdue = []
            for t in tasks:
                due = t.get("due_date") or t.get("scadenza") or t.get("deadline")
                status = t.get("status", "")
                if due and status not in ("done", "completed", "fatto"):
                    try:
                        due_date = datetime.fromisoformat(due[:10]).date()
                        if due_date < now:
                            overdue.append(((now - due_date).days, t, due_date))
                    except Exception:
                        pass
            overdue.sort(reverse=True, key=lambda x: x[0])
            if not overdue:
                return "Nessun task scaduto nel team."
            lines = [f"**{len(overdue)} task scaduti**\n"]
            for days_late, t, due_date in overdue[:limit]:
                title = t.get("title") or t.get("titolo") or "Task senza titolo"
                assignee_name = t.get("assignee_name") or t.get("assegnatario")
                assignee_id = t.get("assignee_id")
                if assignee_name:
                    assignee = assignee_name
                elif assignee_id:
                    assignee = f"ID:{str(assignee_id)[:8]}"
                else:
                    assignee = "non assegnato"
                role = t.get("role_required") or t.get("role") or ""
                if role and not assignee_name:
                    assignee = f"{assignee} ({role})"
                proj = t.get("project_name") or t.get("cliente") or ""
                lines.append(f"- **{title}** — {days_late}g ritardo | {assignee}{' | ' + proj if proj else ''} | scad: {due_date}")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore task scaduti: {e}"

    async def get_tasks(self, assignee_id: Optional[str] = None, status: Optional[str] = None,
                        project_id: Optional[str] = None, limit: int = 30) -> str:
        try:
            params: Dict = {}
            if assignee_id:
                params["assignee_id"] = assignee_id
            if status:
                params["status"] = status
            if project_id:
                params["project_id"] = project_id
            params["limit"] = limit
            tasks = await self._get("/api/tasks", params)
            if isinstance(tasks, dict):
                tasks = tasks.get("tasks", tasks.get("data", []))
            if not tasks:
                filter_desc = f" con status '{status}'" if status else ""
                return f"Nessun task trovato{filter_desc}."
            lines = [f"**{len(tasks)} task{' (' + status + ')' if status else ''}**\n"]
            for t in tasks[:limit]:
                task_id = str(t.get("id") or t.get("task_id") or "?")
                short_id = task_id[:8] if task_id != "?" else "?"
                title = t.get("title") or t.get("titolo") or "?"
                s = t.get("status", "?")
                assignee = t.get("assignee_name") or t.get("role_required") or "non assegnato"
                due = (t.get("due_date") or "")[:10] or "—"
                icon = {"todo": "⬜", "in_progress": "🔄", "done": "✅", "blocked": "🚫"}.get(s, "•")
                lines.append(f"{icon} `{short_id}` **{title}** | {assignee} | {due}")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore task: {e}"

    async def update_task_status(self, task_id: str, status: str) -> str:
        valid_statuses = ("todo", "in_progress", "done", "blocked")
        if status not in valid_statuses:
            return f"Status '{status}' non valido. Usa: {', '.join(valid_statuses)}."
        try:
            await self._put(f"/api/tasks/{task_id}", {"status": status})
            return f"Task `{task_id[:8]}` aggiornato a **{status}**."
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                return (
                    f"Task `{task_id[:8]}` non trovato. "
                    "Verifica che l'ID sia completo e corretto — usa get_tasks per ottenere gli ID validi."
                )
            return f"Errore aggiornamento task (HTTP {e.response.status_code}): {e}"
        except Exception as e:
            return f"Errore aggiornamento task: {e}"

    async def get_users_list(self) -> str:
        try:
            data = await self._get("/api/users")
            users = data if isinstance(data, list) else data.get("users", [])
            if not users:
                return "Nessun utente trovato."
            team = [u for u in users if u.get("role") not in ("superadmin",)]
            lines = [f"**Team — {len(team)} membri**\n"]
            for u in team:
                nome = f"{u.get('nome','') or ''} {u.get('cognome','') or ''}".strip() or u.get("username", "?")
                job = u.get("job_title") or "ruolo non impostato"
                email = u.get("email") or ""
                uid = str(u.get("id", ""))
                lines.append(f"- **{nome}** (ID:{uid}) — {job}{' | ' + email if email else ''}")
            return "\n".join(lines)
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 403:
                # Permesso users:read mancante — endpoint richiede ruolo admin o permesso esplicito
                return (
                    "Non ho il permesso di elencare gli utenti (richiesto: users:read). "
                    "Per assegnare un lead, specifica direttamente il nome dell'utente e "
                    "usa update_lead con il campo assigned_to."
                )
            return f"Errore utenti: {e}"
        except Exception as e:
            return f"Errore utenti: {e}"

    async def get_workflow_templates(self) -> str:
        try:
            # Path corretto: /api/workflows/templates (con alias /api/workflow-templates)
            data = await self._get("/api/workflows/templates")
            items = data if isinstance(data, list) else data.get("templates", [])
            if not items:
                return (
                    "Nessun workflow template trovato.\n"
                    "I template (Onboarding, E-commerce, Campagne ADV) dovrebbero essere presenti — "
                    "verifica la configurazione del productivity-service."
                )
            lines = [f"**{len(items)} workflow template disponibili**\n"]
            for t in items:
                name = t.get("name") or t.get("nome") or "?"
                trigger_type = t.get("trigger_type") or "?"
                trigger_services = t.get("trigger_services") or []
                if isinstance(trigger_services, list):
                    services_str = ", ".join(str(s) for s in trigger_services[:3]) or "tutti"
                else:
                    services_str = str(trigger_services)
                lines.append(
                    f"- **{name}** | trigger: {trigger_type} | servizi: {services_str} | ID: `{t.get('id','')}`"
                )
            return "\n".join(lines)
        except Exception as e:
            return (
                f"Workflow template non disponibili ({e}). "
                "L'endpoint esiste nel sistema ma potrebbe non essere raggiungibile. "
                "Contatta il team tecnico."
            )

    async def get_pagamenti_status(self, client_name: Optional[str] = None, status: Optional[str] = None) -> str:
        try:
            data = await self._get("/api/pagamenti")
            items = data if isinstance(data, list) else data.get("pagamenti", data.get("data", []))
            if not items:
                return "Nessun pagamento trovato."
            now = datetime.utcnow().date()
            totals = {"attesa": 0.0, "scaduto": 0.0, "incassato": 0.0}
            lines = []
            for p in items:
                if client_name and client_name.lower() not in (p.get("cliente_nome") or p.get("cliente") or "").lower():
                    continue
                pstatus = (p.get("status") or p.get("stato") or "").lower()
                if status and status.lower() not in pstatus:
                    continue
                importo = float(p.get("importo") or p.get("amount") or 0)
                scadenza = (p.get("scadenza") or p.get("due_date") or "")[:10]
                cliente = p.get("cliente_nome") or p.get("cliente") or "N/D"
                flag = ""
                if pstatus in ("pending", "in_attesa"):
                    if scadenza:
                        try:
                            if datetime.fromisoformat(scadenza).date() < now:
                                flag = " ⚠️ **SCADUTO**"
                                totals["scaduto"] += importo
                            else:
                                totals["attesa"] += importo
                        except Exception:
                            totals["attesa"] += importo
                    else:
                        totals["attesa"] += importo
                elif pstatus in ("paid", "pagato", "incassato"):
                    totals["incassato"] += importo
                lines.append(f"- {cliente} | **€{importo:,.2f}** | {pstatus}{flag} | {scadenza}")
            summary = (
                f"**Pagamenti** — ✅ Incassati: €{totals['incassato']:,.0f} | "
                f"⏳ In attesa: €{totals['attesa']:,.0f} | "
                f"⚠️ Scaduti: €{totals['scaduto']:,.0f}\n"
            )
            return summary + "\n".join(lines[:30])
        except Exception as e:
            return f"Errore pagamenti: {e}"

    async def get_preventivi_list(self) -> str:
        try:
            data = await self._get("/api/preventivi")
            items = data if isinstance(data, list) else data.get("preventivi", [])
            if not items:
                return "Nessun preventivo trovato."
            lines = [f"**{len(items)} preventivi**\n"]
            for p in items[:20]:
                num = p.get("numero") or p.get("id", "?")[:8]
                cliente = p.get("cliente") or "N/D"
                totale = p.get("totale") or p.get("importo_totale") or 0
                status = p.get("status") or "?"
                lines.append(f"- **{num}** | {cliente} | €{totale:,.0f} | {status}")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore preventivi: {e}"

    async def get_contratti_list(self) -> str:
        try:
            data = await self._get("/api/contratti")
            items = data if isinstance(data, list) else data.get("contratti", [])
            if not items:
                return "Nessun contratto trovato."
            lines = [f"**{len(items)} contratti**\n"]
            for c in items[:20]:
                num = c.get("numero") or "?"
                cliente = c.get("datiCommittente", {}).get("ragioneSociale") if isinstance(c.get("datiCommittente"), dict) else c.get("ragione_sociale") or c.get("nome_cliente") or "N/D"
                status = c.get("status") or "?"
                durata = c.get("durata") or {}
                if isinstance(durata, dict):
                    dec = durata.get("dataDecorrenza", "")[:10]
                    scad = durata.get("dataScadenza", "")[:10]
                    periodo = f"{dec} → {scad}" if dec else ""
                else:
                    periodo = ""
                lines.append(f"- **{num}** | {cliente} | {status} | {periodo}")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore contratti: {e}"

    async def get_all_clients(self) -> str:
        try:
            clients = await self._get("/api/clienti")
            if not clients:
                return "Nessun cliente trovato."
            lines = [f"**{len(clients)} clienti attivi**\n"]
            for c in clients:
                name = c.get("nome_azienda", "N/D")
                dettagli = c.get("dettagli") or {}
                ref = dettagli.get("referente") or {}
                ref_name = f"{ref.get('nome','')} {ref.get('cognome','')}".strip() if ref else ""
                svcs = c.get("servizi_attivi") or []
                srv = ", ".join(svcs[:3]) if isinstance(svcs, list) else "N/D"
                lines.append(f"- **{name}** | {ref_name or 'N/D'} | {srv} | `{c['id'][:8]}`")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore clienti: {e}"

    async def get_client_overview(self, client_id: str) -> str:
        try:
            c = await self._get(f"/api/clienti/{client_id}")
            name = c.get("nome_azienda", "N/D")
            cont = c.get("contatti") or {}
            dettagli = c.get("dettagli") or {}
            svcs = c.get("servizi_attivi") or []
            drive_id = dettagli.get("drive_folder_id", "")
            drive_url = f"https://drive.google.com/drive/folders/{drive_id}" if drive_id else "N/D"
            out = (
                f"**{name}**\n"
                f"Email: {cont.get('email','N/D')} | Tel: {cont.get('telefono','N/D')} | P.IVA: {cont.get('cfPiva','N/D')}\n"
                f"Servizi: {', '.join(svcs) if svcs else 'N/D'}\n"
                f"Drive: {drive_url}\n"
                f"Inizio: {dettagli.get('data_inizio','N/D')} | Note: {(c.get('note','') or '')[:150]}"
            )
            # documenti collegati
            try:
                docs = await self._get(f"/api/clienti/{client_id}/documents")
                if docs:
                    out += f"\n\n**Documenti ({len(docs)})**:"
                    for d in docs[:5]:
                        out += f"\n- {d.get('type','?')}: {d.get('numero','')} | {d.get('status','')} | €{d.get('importo_totale', d.get('totale',''))}"
            except Exception:
                pass
            return out
        except Exception as e:
            return f"Errore cliente {client_id}: {e}"

    async def get_servizi_catalog(self) -> str:
        try:
            _dir = os.path.dirname(os.path.abspath(__file__))
            if _dir not in sys.path:
                sys.path.insert(0, _dir)
            from data import SERVIZI_CATALOG
            lines = ["**Catalogo Servizi Evoluzione Imprese**\n"]
            for cat in SERVIZI_CATALOG:
                lines.append(f"\n### {cat['nome']}")
                for sub in cat.get("sottoservizi", []):
                    prezzo = f" — €{sub['prezzo_base']:,.0f}" if sub.get("prezzo_base") else ""
                    lines.append(f"- {sub['nome']}{prezzo} `{sub['id']}`")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore catalogo: {e}"

    async def get_pipeline_metrics(self) -> str:
        try:
            data = await self._get("/api/pipeline/metrics")
            snap = data.get("snapshot", {})
            alerts = data.get("alerts", {})

            lines = ["## Pipeline Metrics\n"]

            optin_u = alerts.get("optin_urgenti_24h", 0)
            zombie = alerts.get("lead_zombie_7d", 0)
            appt = alerts.get("appuntamenti_oggi", 0)

            if optin_u > 0:
                lines.append(f"**{optin_u} lead in optin da >24h non contattati** — priorità setter oggi")
            if zombie > 0:
                lines.append(f"**{zombie} lead zombie** (fermi >7gg in stage attivo)")
            if appt > 0:
                lines.append(f"**{appt} appuntamenti oggi**")
            if not any([optin_u, zombie, appt]):
                lines.append("Nessun alert critico.")

            lines.append(f"\n**Lead totali**: {snap.get('total_leads', 0)}")
            clienti = snap.get('clienti_totali', 0)
            cr = snap.get('conversion_rate_pct', 0)
            lines.append(f"**Clienti**: {clienti} ({cr}% conversion rate)")

            by_stage = snap.get("by_stage", {})
            if by_stage:
                lines.append("\n**Per stage:**")
                stage_order = ["optin","contattato","prima_chiamata","appuntamento_vivo_1",
                               "seconda_chiamata","appuntamento_vivo_2","preventivo_consegnato",
                               "cliente","trattativa_persa","scartato"]
                for s in stage_order:
                    if s in by_stage:
                        lines.append(f"  - {s}: **{by_stage[s]}**")
                for s, c in by_stage.items():
                    if s not in stage_order:
                        lines.append(f"  - {s}: **{c}**")

            by_source = snap.get("by_source", {})
            if by_source:
                lines.append("\n**Per fonte (top 5):**")
                for src, cnt in sorted(by_source.items(), key=lambda x: -x[1])[:5]:
                    lines.append(f"  - {src}: {cnt}")

            return "\n".join(lines)
        except Exception as e:
            return f"Errore metriche pipeline: {e}"

    async def get_zombie_leads(self, days: int = 7) -> str:
        try:
            data = await self._get("/api/leads/zombie", {"days": days})
            leads = data.get("zombie_leads", [])
            if not leads:
                return f"Nessun lead zombie (fermi >{days} giorni). Pipeline fluida."
            lines = [f"**{len(leads)} lead zombie** (fermi >{days}gg in stage attivo)\n"]
            for l in leads[:15]:
                nome = l.get("nome") or "?"
                stage = l.get("stage", "?")
                giorni = l.get("giorni_nello_stage", "?")
                score = l.get("lead_score", 0)
                lines.append(f"- **{nome}** | stage: {stage} | {giorni}gg | score: {score} `{l['id'][:8]}`")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore zombie leads: {e}"

    async def get_priority_queue(self) -> str:
        try:
            data = await self._get("/api/leads/priority-queue")
            queue = data.get("queue", [])
            if not queue:
                return "Nessun lead in coda setter (optin/contattato vuoti)."
            lines = [f"**Coda setter — {len(queue)} lead da gestire**\n"]
            for l in queue[:10]:
                urgente = "[URGENTE] " if l.get("urgente") else ""
                nome = l.get("nome") or l.get("email") or "?"
                ore = l.get("ore_da_optin")
                ore_str = f"{ore}h fa" if ore is not None else "?"
                score = l.get("lead_score", 0)
                budget = l.get("budget_indicativo") or "N/D"
                fonte = l.get("source_channel") or "N/D"
                lines.append(
                    f"- {urgente}**{nome}** | score: {score} | {ore_str} | "
                    f"fonte: {fonte} | budget: {budget} `{l['id'][:8]}`"
                )
            return "\n".join(lines)
        except Exception as e:
            return f"Errore priority queue: {e}"

    async def get_appointments_today(self) -> str:
        try:
            data = await self._get("/api/leads/appointments-today")
            appts = data.get("appointments", [])
            if not appts:
                return "Nessun appuntamento nelle prossime 48 ore."
            lines = [f"**{len(appts)} appuntamenti nelle prossime 48h**\n"]
            for a in appts:
                nome = a.get("nome") or "?"
                dt = str(a.get("appointment_date", ""))[:16].replace("T", " ")
                pacchetto = a.get("pacchetto_consigliato") or "da definire"
                lines.append(f"- **{nome}** | {dt} | pacchetto: {pacchetto} `{a['id'][:8]}`")
            return "\n".join(lines)
        except Exception as e:
            return f"Errore appuntamenti: {e}"

    # ─── Fireflies GraphQL tools ───────────────────────────────────────────────

    async def _fireflies_gql(self, query: str, variables: Optional[Dict] = None) -> Dict:
        """Chiama la GraphQL API di Fireflies con il token configurato."""
        token = _fireflies_token()
        if not token:
            raise RuntimeError("FIREFLIES_API_KEY non configurata nelle env var.")
        payload: Dict[str, Any] = {"query": query}
        if variables:
            payload["variables"] = variables
        async with httpx.AsyncClient(timeout=30.0) as c:
            resp = await c.post(
                _FIREFLIES_GQL_URL,
                json=payload,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
        resp.raise_for_status()
        data = resp.json()
        if "errors" in data:
            raise RuntimeError(f"Fireflies GraphQL errors: {data['errors']}")
        return data.get("data", {})

    async def search_fireflies_transcripts(self, query: str, limit: int = 5) -> str:
        try:
            gql = """
            query SearchTranscripts($title: String, $limit: Int) {
              transcripts(title: $title, limit: $limit) {
                id
                title
                date
                duration
                organizer_email
                participants
                meeting_attendees { displayName email }
                summary { overview action_items keywords }
              }
            }
            """
            data = await self._fireflies_gql(gql, {"title": query, "limit": limit})
            transcripts = data.get("transcripts") or []
            if not transcripts:
                return f"Nessuna trascrizione trovata per la ricerca: '{query}'."
            lines = [f"**{len(transcripts)} trascrizioni trovate per '{query}'**\n"]
            for t in transcripts:
                date_str = ""
                if t.get("date"):
                    try:
                        from datetime import datetime as _dt
                        date_str = _dt.fromtimestamp(int(t["date"]) / 1000).strftime("%d/%m/%Y") if str(t["date"]).isdigit() else str(t["date"])[:10]
                    except Exception:
                        date_str = str(t.get("date", ""))[:10]
                attendees = t.get("meeting_attendees") or []
                participants_str = ", ".join(
                    a.get("displayName") or a.get("email", "?") for a in attendees
                ) if attendees else ", ".join(t.get("participants") or []) or "N/D"
                summary = (t.get("summary") or {}).get("overview") or ""
                lines.append(
                    f"- **{t.get('title','?')}** | {date_str} | ID: `{t['id']}`\n"
                    f"  Partecipanti: {participants_str}\n"
                    + (f"  Sintesi: {summary[:200]}..." if len(summary) > 200 else f"  Sintesi: {summary}" if summary else "")
                )
            return "\n".join(lines)
        except RuntimeError as e:
            return f"Fireflies non disponibile: {e}"
        except Exception as e:
            return f"Errore ricerca trascrizioni Fireflies: {e}"

    async def get_fireflies_transcript(self, transcript_id: str) -> str:
        try:
            gql = """
            query GetTranscript($id: String!) {
              transcript(id: $id) {
                id
                title
                date
                duration
                organizer_email
                participants
                meeting_attendees { displayName email }
                summary { overview action_items keywords outline }
                sentences { text speaker_id speaker_name start_time }
              }
            }
            """
            data = await self._fireflies_gql(gql, {"id": transcript_id})
            t = data.get("transcript")
            if not t:
                return f"Trascrizione `{transcript_id}` non trovata."
            summary = t.get("summary") or {}
            overview   = summary.get("overview") or "N/D"
            action_items = summary.get("action_items") or "Nessuno"
            keywords   = ", ".join(summary.get("keywords") or []) or "N/D"
            attendees = t.get("meeting_attendees") or []
            participants = ", ".join(
                a.get("displayName") or a.get("email", "?") for a in attendees
            ) if attendees else ", ".join(t.get("participants") or []) or "N/D"
            duration_min = int(t.get("duration") or 0) // 60
            date_str = ""
            if t.get("date"):
                try:
                    from datetime import datetime as _dt
                    date_str = _dt.fromtimestamp(int(t["date"]) / 1000).strftime("%d/%m/%Y %H:%M") if str(t["date"]).isdigit() else str(t["date"])[:16]
                except Exception:
                    date_str = str(t.get("date", ""))[:16]
            return (
                f"## Trascrizione: {t.get('title','?')}\n"
                f"**Data**: {date_str} | **Durata**: {duration_min} min\n"
                f"**Partecipanti**: {participants}\n\n"
                f"**Sintesi**:\n{overview}\n\n"
                f"**Action items**:\n{action_items}\n\n"
                f"**Keywords**: {keywords}"
            )
        except RuntimeError as e:
            return f"Fireflies non disponibile: {e}"
        except Exception as e:
            return f"Errore dettaglio trascrizione Fireflies: {e}"

    async def match_lead_to_transcripts(self, lead_id: str) -> str:
        try:
            # Recupera il lead dalla pipeline
            all_leads = await self._get("/api/leads")
            lead = None
            for l in (all_leads if isinstance(all_leads, list) else []):
                if l.get("id", "").startswith(lead_id) or l.get("id") == lead_id:
                    lead = l
                    break
            if not lead:
                return f"Lead `{lead_id[:8]}` non trovato nella pipeline."

            nome      = [lead.get("first_name"), lead.get("last_name")]
            azienda   = lead.get("azienda") or ""
            email_dom = (lead.get("email") or "").split("@")[0]
            nome_str  = " ".join(n for n in nome if n)

            # Cerca per nome completo e poi per azienda
            results = []
            for search_term in [s for s in [nome_str, azienda, email_dom] if s]:
                gql = """
                query SearchTranscripts($title: String, $limit: Int) {
                  transcripts(title: $title, limit: $limit) {
                    id title date duration
                    participants
                    meeting_attendees { displayName email }
                    summary { overview }
                  }
                }
                """
                data = await self._fireflies_gql(gql, {"title": search_term, "limit": 10})
                for t in (data.get("transcripts") or []):
                    if t["id"] not in {r["id"] for r in results}:
                        results.append(t)

            if not results:
                return (
                    f"Nessuna trascrizione trovata per il lead **{nome_str or lead.get('email')}** "
                    f"({azienda or 'azienda N/D'}). "
                    f"Termini cercati: {', '.join(s for s in [nome_str, azienda, email_dom] if s)}"
                )

            lines = [
                f"**{len(results)} trascrizioni correlate a {nome_str or lead.get('email')} ({azienda})**\n",
                f"Lead ID: `{lead['id'][:8]}` | Stage: {lead.get('stage')} | Score: {lead.get('lead_score', 0)}\n",
            ]
            for t in results[:8]:
                date_str = ""
                if t.get("date"):
                    try:
                        from datetime import datetime as _dt
                        date_str = _dt.fromtimestamp(int(t["date"]) / 1000).strftime("%d/%m/%Y") if str(t["date"]).isdigit() else str(t["date"])[:10]
                    except Exception:
                        date_str = str(t.get("date", ""))[:10]
                attendees = t.get("meeting_attendees") or []
                participants = ", ".join(
                    a.get("displayName") or a.get("email", "?") for a in attendees
                ) if attendees else ", ".join(t.get("participants") or []) or "N/D"
                overview = (t.get("summary") or {}).get("overview") or ""
                lines.append(
                    f"- **{t.get('title','?')}** | {date_str} | ID: `{t['id']}`\n"
                    f"  Partecipanti: {participants}\n"
                    + (f"  {overview[:150]}..." if len(overview) > 150 else f"  {overview}" if overview else "")
                )
            lines.append(f"\nUsa `get_fireflies_transcript` con l'ID per il dettaglio completo.")
            return "\n".join(lines)
        except RuntimeError as e:
            return f"Fireflies non disponibile: {e}"
        except Exception as e:
            return f"Errore match lead-trascrizioni: {e}"

    # ─── AirCall tools ────────────────────────────────────────────────────────

    async def aircall_create_contact(self, lead_id: str) -> str:
        """Crea o aggiorna un contatto AirCall a partire da un lead della pipeline."""
        try:
            all_leads = await self._get("/api/leads")
            lead = next(
                (l for l in (all_leads if isinstance(all_leads, list) else [])
                 if l.get("id", "").startswith(lead_id) or l.get("id") == lead_id),
                None,
            )
            if not lead:
                return f"Lead `{lead_id[:8]}` non trovato nella pipeline."

            fn = (lead.get("first_name") or "").strip()
            ln = (lead.get("last_name") or "").strip()
            nome = f"{fn} {ln}".strip() or lead.get("azienda") or lead.get("email", "")
            phone = (lead.get("phone") or "").strip()
            email = (lead.get("email") or "").strip()
            info  = (
                f"Azienda: {lead.get('azienda') or 'N/D'} | "
                f"Stage: {lead.get('stage')} | "
                f"Fonte: {lead.get('source_channel') or 'N/D'} | "
                f"Lead EvoMetrics ID: {lead['id'][:8]}"
            )

            existing_id = lead.get("aircall_contact_id")
            if existing_id:
                patch_body: Dict = {"information": info}
                if phone:
                    patch_body["phone_numbers"] = [{"label": "Work", "value": phone}]
                resp = await _aircall_patch(f"/contacts/{existing_id}", patch_body)
                c = resp.get("contact", {})
                return (
                    f"✅ Contatto AirCall aggiornato: **{nome}** (ID: {c.get('id', existing_id)})\n"
                    f"Link: https://dashboard.aircall.io/contacts/{c.get('id', existing_id)}"
                )

            # Cerca contatto esistente per telefono o email
            found_id: Optional[str] = None
            for search_val in [v for v in [phone, email] if v]:
                try:
                    r = await _aircall_get("/contacts/search", {"term": search_val})
                    hits = r.get("contacts", [])
                    if hits:
                        found_id = str(hits[0]["id"])
                        break
                except Exception:
                    pass

            if found_id:
                await self._put(f"/api/leads/{lead['id']}", {"aircall_contact_id": found_id})
                return (
                    f"✅ Contatto AirCall già esistente collegato al lead: **{nome}** (ID: {found_id})\n"
                    f"Link: https://dashboard.aircall.io/contacts/{found_id}"
                )

            # Crea nuovo contatto
            body: Dict = {
                "first_name": fn or nome.split()[0],
                "last_name": ln or (" ".join(nome.split()[1:]) if len(nome.split()) > 1 else ""),
                "information": info,
            }
            if phone:
                body["phone_numbers"] = [{"label": "Work", "value": phone}]
            if email:
                body["emails"] = [{"label": "Work", "value": email}]

            resp = await _aircall_post("/contacts", body)
            c = resp.get("contact", {})
            new_id = str(c.get("id", ""))
            if new_id:
                await self._put(f"/api/leads/{lead['id']}", {"aircall_contact_id": new_id})

            return (
                f"✅ Contatto AirCall creato: **{nome}** (ID: {new_id})\n"
                f"- Telefono: {phone or 'N/D'}\n"
                f"- Email: {email or 'N/D'}\n"
                f"- Collegato al lead: `{lead['id'][:8]}`\n"
                f"Link: https://dashboard.aircall.io/contacts/{new_id}"
            )
        except RuntimeError as e:
            return f"AirCall non disponibile: {e}"
        except Exception as e:
            return f"Errore creazione contatto AirCall: {e}"

    async def aircall_get_contact_calls(self, lead_id: str, limit: int = 10) -> str:
        """Recupera le chiamate AirCall associate a un lead sincronizzato."""
        try:
            all_leads = await self._get("/api/leads")
            lead = next(
                (l for l in (all_leads if isinstance(all_leads, list) else [])
                 if l.get("id", "").startswith(lead_id) or l.get("id") == lead_id),
                None,
            )
            if not lead:
                return f"Lead `{lead_id[:8]}` non trovato."

            aircall_id = lead.get("aircall_contact_id")
            if not aircall_id:
                return (
                    f"Lead **{lead.get('azienda') or lead.get('email')}** non ancora sincronizzato con AirCall.\n"
                    f"Usa `aircall_create_contact` con lead_id=`{lead['id'][:8]}` per collegarlo."
                )

            r = await _aircall_get(f"/contacts/{aircall_id}/calls", {"per_page": limit, "order": "desc"})
            calls = r.get("calls", [])

            nome = f"{lead.get('first_name','') or ''} {lead.get('last_name','') or ''}".strip() or lead.get("azienda") or lead.get("email", "")
            if not calls:
                return f"Nessuna chiamata AirCall trovata per il contatto **{nome}** (ID: {aircall_id})."

            lines = [f"**{len(calls)} chiamate AirCall per {nome}**\n"]
            for c in calls:
                started = c.get("started_at")
                date_str = datetime.fromtimestamp(started).strftime("%d/%m/%Y %H:%M") if started else "N/D"
                dur = int(c.get("duration") or 0)
                dur_str = f"{dur // 60}m {dur % 60}s" if dur > 0 else "N/D"
                rec = "🎙️ Sì" if c.get("recording") else "No"
                agent = (c.get("user") or {}).get("name") or "N/D"
                lines.append(
                    f"- **{date_str}** | {c.get('direction','?')} | {dur_str} | "
                    f"Status: {c.get('status','?')} | Recording: {rec} | Agente: {agent} | ID: `{c.get('id')}`"
                )
            lines.append("\nUsa `aircall_get_call_details` con l'ID per recording URL e commenti.")
            return "\n".join(lines)
        except RuntimeError as e:
            return f"AirCall non disponibile: {e}"
        except Exception as e:
            return f"Errore recupero chiamate AirCall: {e}"

    async def aircall_get_call_details(self, call_id: str) -> str:
        """Recupera dettaglio completo di una chiamata AirCall."""
        try:
            r = await _aircall_get(f"/calls/{call_id}")
            call = r.get("call", {})
            if not call:
                return f"Chiamata `{call_id}` non trovata in AirCall."

            started = call.get("started_at")
            date_str = datetime.fromtimestamp(started).strftime("%d/%m/%Y %H:%M") if started else "N/D"
            dur = int(call.get("duration") or 0)
            dur_str = f"{dur // 60}m {dur % 60}s" if dur > 0 else "N/D"
            contact = call.get("contact") or {}
            agent   = call.get("user") or {}
            number  = call.get("number") or {}
            comments = call.get("comments") or []
            recording_url = call.get("recording") or ""
            voicemail_url = call.get("voicemail") or ""

            lines = [
                f"## Chiamata AirCall #{call_id}",
                f"**Data**: {date_str} | **Durata**: {dur_str}",
                f"**Direzione**: {call.get('direction','?')} | **Status**: {call.get('status','?')}",
                f"**Contatto**: {contact.get('name') or 'N/D'} (ID: {contact.get('id','N/D')})",
                f"**Agente**: {agent.get('name') or 'N/D'}",
                f"**Numero AirCall**: {number.get('name') or number.get('digits') or 'N/D'}",
            ]
            if recording_url:
                lines.append(f"**Recording**: {recording_url}")
            elif voicemail_url:
                lines.append(f"**Voicemail**: {voicemail_url}")
            else:
                lines.append("**Recording**: Non disponibile")
            if comments:
                lines.append("\n**Note/Commenti**:")
                for cm in comments:
                    auth_name = (cm.get("author") or {}).get("name", "?")
                    lines.append(f"  - {auth_name}: {cm.get('content','')}")
            return "\n".join(lines)
        except RuntimeError as e:
            return f"AirCall non disponibile: {e}"
        except Exception as e:
            return f"Errore dettaglio chiamata AirCall: {e}"

    async def aircall_match_lead_to_calls(self, lead_id: str) -> str:
        """Cerca in AirCall le chiamate correlate a un lead (per telefono o contatto collegato)."""
        try:
            all_leads = await self._get("/api/leads")
            lead = next(
                (l for l in (all_leads if isinstance(all_leads, list) else [])
                 if l.get("id", "").startswith(lead_id) or l.get("id") == lead_id),
                None,
            )
            if not lead:
                return f"Lead `{lead_id[:8]}` non trovato."

            nome  = f"{lead.get('first_name','') or ''} {lead.get('last_name','') or ''}".strip() or lead.get("azienda") or lead.get("email", "")
            phone = (lead.get("phone") or "").strip()

            # Se il lead è già collegato ad AirCall, usa il metodo diretto
            if lead.get("aircall_contact_id"):
                return await self.aircall_get_contact_calls(lead_id)

            if not phone:
                return (
                    f"Lead **{nome}** non ha numero di telefono e non è ancora sincronizzato con AirCall.\n"
                    f"Usa `aircall_create_contact` per sincronizzarlo e poi ritorna su questo tool."
                )

            # Cerca per numero nelle chiamate recenti
            clean_phone = phone.replace(" ", "").replace("-", "")
            try:
                r = await _aircall_get("/calls", {"per_page": 50, "order": "desc"})
                calls_all = r.get("calls", [])
                calls = [
                    c for c in calls_all
                    if (c.get("contact") or {}).get("phone_number", "").replace(" ", "").endswith(clean_phone[-8:])
                ]
            except Exception:
                calls = []

            if not calls:
                return (
                    f"Nessuna chiamata trovata per **{nome}** ({phone}).\n"
                    f"Suggerimento: usa `aircall_create_contact` con lead_id=`{lead['id'][:8]}` "
                    f"per sincronizzare il lead e tracciare le chiamate automaticamente."
                )

            lines = [f"**{len(calls)} chiamate trovate per {nome}** (tel: {phone})\n"]
            for c in calls:
                started = c.get("started_at")
                date_str = datetime.fromtimestamp(started).strftime("%d/%m/%Y %H:%M") if started else "N/D"
                dur = int(c.get("duration") or 0)
                dur_str = f"{dur // 60}m {dur % 60}s" if dur > 0 else "N/D"
                rec = "🎙️" if c.get("recording") else ""
                lines.append(
                    f"- **{date_str}** | {c.get('direction','?')} | {dur_str} {rec} | ID: `{c.get('id')}`"
                )
            lines.append("\nUsa `aircall_get_call_details` con l'ID per il dettaglio e il recording.")
            return "\n".join(lines)
        except RuntimeError as e:
            return f"AirCall non disponibile: {e}"
        except Exception as e:
            return f"Errore match lead-chiamate AirCall: {e}"

    async def bulk_fetch_for_enrichment(self, limit: int = 20) -> str:
        try:
            # Fetch parallelo: trascrizioni Fireflies + lead pipeline
            gql = """
            query GetTranscripts($limit: Int) {
              transcripts(limit: $limit) {
                id title date duration
                organizer_email
                participants
                meeting_attendees { displayName email }
                summary { overview action_items }
              }
            }
            """
            transcripts_task = self._fireflies_gql(gql, {"limit": limit})
            leads_task = self._get("/api/leads")

            transcripts_data, leads_data = await asyncio.gather(
                transcripts_task, leads_task, return_exceptions=True
            )

            if isinstance(transcripts_data, Exception):
                return f"Errore fetch trascrizioni Fireflies: {transcripts_data}"

            transcripts = (transcripts_data.get("transcripts") or []) if isinstance(transcripts_data, dict) else []
            leads = leads_data if isinstance(leads_data, list) else []

            # Compatta i dati per ridurre token
            compact_transcripts = []
            for t in transcripts:
                date_str = ""
                if t.get("date"):
                    try:
                        from datetime import datetime as _dt
                        date_str = _dt.fromtimestamp(int(t["date"]) / 1000).strftime("%d/%m/%Y") if str(t["date"]).isdigit() else str(t["date"])[:10]
                    except Exception:
                        date_str = str(t.get("date", ""))[:10]
                attendees = t.get("meeting_attendees") or []
                participants = [
                    a.get("displayName") or a.get("email", "?") for a in attendees
                ] if attendees else list(t.get("participants") or [])
                compact_transcripts.append({
                    "id": t["id"],
                    "title": t.get("title", "?"),
                    "date": date_str,
                    "participants": participants,
                    "overview": ((t.get("summary") or {}).get("overview") or "")[:200],
                })

            compact_leads = [
                {
                    "id": l["id"],
                    "nome": f"{l.get('first_name', '')} {l.get('last_name', '')}".strip() or l.get("email", "?"),
                    "azienda": l.get("azienda") or "",
                    "email": l.get("email", ""),
                    "stage": l.get("stage", ""),
                    "score": l.get("lead_score", 0),
                }
                for l in leads
                if l.get("stage") not in ("trattativa_persa", "scartato", "archiviato")
            ]

            output = json.dumps({
                "transcripts_count": len(compact_transcripts),
                "leads_count": len(compact_leads),
                "transcripts": compact_transcripts,
                "leads": compact_leads,
            }, ensure_ascii=False, indent=2)

            return (
                f"**Dati per enrichment bulk**\n"
                f"- Trascrizioni Fireflies: {len(compact_transcripts)}\n"
                f"- Lead attivi in pipeline: {len(compact_leads)}\n\n"
                f"Analizza i dati seguenti e identifica i match per nome/azienda/email. "
                f"Poi presenta all'utente i match trovati prima di aggiornare i lead.\n\n"
                f"```json\n{output}\n```"
            )
        except RuntimeError as e:
            return f"Fireflies non disponibile: {e}"
        except Exception as e:
            return f"Errore bulk fetch: {e}"

    async def update_lead_notes(self, lead_id: str, note_content: str) -> str:
        """Aggiunge una nota strutturata a un lead (usato dopo match Fireflies)."""
        try:
            result = await self._post(f"/api/leads/{lead_id}/notes", {"content": note_content})
            return f"Nota aggiunta al lead `{lead_id[:8]}`. Total note: {result.get('total_notes', '?')}."
        except Exception as e:
            return f"Errore aggiunta nota al lead `{lead_id[:8]}`: {e}"

    async def update_lead_assignee(self, lead_id: str, user_id: str, note: Optional[str] = None) -> str:
        try:
            body: Dict[str, Any] = {"assigned_to_user_id": user_id}
            await self._put(f"/api/leads/{lead_id}", body)
            if note:
                await self._post(f"/api/leads/{lead_id}/notes", {"content": note})
            return f"Lead `{lead_id[:8]}` assegnato all'utente ID `{user_id}`."
        except Exception as e:
            return f"Errore assegnazione lead: {e}"

    async def delete_lead(self, lead_id: str, confirm: bool = False) -> str:
        if not confirm:
            return "Per eliminare il lead devi confermare esplicitamente (confirm: true). Operazione irreversibile."
        try:
            leads = await self._get("/api/leads")
            lead = next((l for l in leads if l["id"].startswith(lead_id) or l["id"] == lead_id), None)
            nome = (lead.get("azienda") or lead.get("email") or lead_id[:8]) if lead else lead_id[:8]
            target_id = lead["id"] if lead else lead_id
            await self._delete(f"/api/leads/{target_id}")
            return f"Lead **{nome}** eliminato definitivamente dalla pipeline."
        except Exception as e:
            return f"Errore eliminazione lead: {e}"

    async def send_slack_message(self, channel: str, message: str) -> str:
        slack_token = os.environ.get("SLACK_BOT_TOKEN")
        if not slack_token:
            return "Slack non configurato (SLACK_BOT_TOKEN mancante). Messaggio non inviato."
        try:
            ch = channel if channel.startswith(('#', '@')) else f"#{channel}"
            async with httpx.AsyncClient(timeout=10.0) as c:
                resp = await c.post(
                    "https://slack.com/api/chat.postMessage",
                    headers={"Authorization": f"Bearer {slack_token}", "Content-Type": "application/json"},
                    json={"channel": ch, "text": message, "unfurl_links": False},
                )
                data = resp.json()
                if data.get("ok"):
                    return f"Messaggio inviato su {ch}."
                return f"Errore Slack: {data.get('error', 'unknown')}"
        except Exception as e:
            return f"Errore invio Slack: {e}"

    async def create_clickup_task(self, title: str, description: str = "", due_date: str = "", assignee_name: str = "") -> str:
        clickup_key = os.environ.get("CLICKUP_API_KEY")
        clickup_list_id = os.environ.get("CLICKUP_DEFAULT_LIST_ID", "")
        if not clickup_key:
            return "ClickUp non configurato (CLICKUP_API_KEY mancante). Task non creato."
        if not clickup_list_id:
            return "CLICKUP_DEFAULT_LIST_ID non configurato. Impostare l'ID della lista di default."
        try:
            payload: Dict[str, Any] = {"name": title}
            if description:
                payload["description"] = description
            if due_date:
                try:
                    from datetime import datetime as _dt
                    ts = int(_dt.fromisoformat(due_date).timestamp() * 1000)
                    payload["due_date"] = ts
                except Exception:
                    pass
            async with httpx.AsyncClient(timeout=15.0) as c:
                resp = await c.post(
                    f"https://api.clickup.com/api/v2/list/{clickup_list_id}/task",
                    headers={"Authorization": clickup_key, "Content-Type": "application/json"},
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                task_url = data.get("url", "")
                return f"Task ClickUp creato: **{title}**{' — ' + task_url if task_url else ''}"
        except Exception as e:
            return f"Errore creazione task ClickUp: {e}"

    async def execute(self, name: str, args: Dict) -> str:
        """Dispatch universale: chiama il metodo corrispondente al tool name."""
        dispatch = {
            "get_pipeline_stages": lambda: self.get_pipeline_stages(),
            "get_pipeline_overview": lambda: self.get_pipeline_overview(args.get("stage")),
            "get_lead_details": lambda: self.get_lead_details(args["lead_id"]),
            "update_lead_stage": lambda: self.update_lead_stage(args["lead_id"], args["new_stage"], args.get("note")),
            "create_lead": lambda: self.create_lead(**args),
            "get_pipeline_analytics": lambda: self.get_pipeline_analytics(args.get("year")),
            "get_overdue_tasks": lambda: self.get_overdue_tasks(args.get("assignee_id"), args.get("limit", 20)),
            "get_tasks": lambda: self.get_tasks(args.get("assignee_id"), args.get("status"), args.get("project_id"), args.get("limit", 30)),
            "update_task_status": lambda: self.update_task_status(args["task_id"], args["status"]),
            "get_users_list": lambda: self.get_users_list(),
            "get_workflow_templates": lambda: self.get_workflow_templates(),
            "get_pagamenti_status": lambda: self.get_pagamenti_status(args.get("client_name"), args.get("status")),
            "get_preventivi_list": lambda: self.get_preventivi_list(),
            "get_contratti_list": lambda: self.get_contratti_list(),
            "get_all_clients": lambda: self.get_all_clients(),
            "get_client_overview": lambda: self.get_client_overview(args["client_id"]),
            "get_servizi_catalog": lambda: self.get_servizi_catalog(),
            "get_pipeline_metrics": lambda: self.get_pipeline_metrics(),
            "get_zombie_leads": lambda: self.get_zombie_leads(args.get("days", 7)),
            "get_priority_queue": lambda: self.get_priority_queue(),
            "get_appointments_today": lambda: self.get_appointments_today(),
            # Fireflies tools
            "search_fireflies_transcripts": lambda: self.search_fireflies_transcripts(args["query"], args.get("limit", 5)),
            "get_fireflies_transcript":     lambda: self.get_fireflies_transcript(args["transcript_id"]),
            "match_lead_to_transcripts":    lambda: self.match_lead_to_transcripts(args["lead_id"]),
            "bulk_fetch_for_enrichment":    lambda: self.bulk_fetch_for_enrichment(args.get("limit", 20)),
            "update_lead_notes":            lambda: self.update_lead_notes(args["lead_id"], args["note_content"]),
            # AirCall tools
            "aircall_create_contact":    lambda: self.aircall_create_contact(args["lead_id"]),
            "aircall_get_contact_calls": lambda: self.aircall_get_contact_calls(args["lead_id"], args.get("limit", 10)),
            "aircall_get_call_details":  lambda: self.aircall_get_call_details(args["call_id"]),
            "aircall_match_lead_to_calls": lambda: self.aircall_match_lead_to_calls(args["lead_id"]),
            "update_lead_assignee":         lambda: self.update_lead_assignee(args["lead_id"], args["user_id"], args.get("note")),
            "delete_lead":                  lambda: self.delete_lead(args["lead_id"], args.get("confirm", False)),
            "send_slack_message":           lambda: self.send_slack_message(args["channel"], args["message"]),
            "create_clickup_task":          lambda: self.create_clickup_task(
                args["title"],
                args.get("description", ""),
                args.get("due_date", ""),
                args.get("assignee_name", ""),
            ),
        }
        fn = dispatch.get(name)
        if fn is None:
            return f"Tool '{name}' non implementato."
        try:
            return await fn()
        except Exception as e:
            return f"Errore tool '{name}': {e}"


# ─── Singolo Agente ────────────────────────────────────────────────────────────

class Agent:
    """
    Un singolo agente specializzato con il suo Claude + tool set + system prompt.
    """

    def __init__(self, agent_id: str, token: str, user: Dict[str, Any]):
        self.config = AGENT_CONFIGS[agent_id]
        self.executor = ToolExecutor(
            token=token,
            base_url=_base_url(),
        )
        self.user = user

    def _system_prompt(self, context: Optional[str] = None) -> str:
        now = datetime.now().strftime("%A %d %B %Y, %H:%M")
        nome = f"{self.user.get('nome','')}{' ' + self.user.get('cognome','') if self.user.get('cognome') else ''}".strip() or self.user.get("username", "utente")
        role = self.user.get("role") or self.user.get("job_title") or "team member"
        context_block = f"\n\n📌 **CONTESTO ATTIVO** (dati già disponibili, usali direttamente senza riscaricarli):\n{context}" if context else ""
        return (
            f"{self.config['system_prompt']}\n\n"
            f"Stai parlando con {nome} ({role}).\n"
            f"Data/ora: {now} (Europa/Roma).\n"
            "Regole operative:\n"
            "- Risposte brevi e dirette\n"
            "- Se hai il CONTESTO ATTIVO, usalo immediatamente — non chiedere dati già forniti\n"
            "- Se ti chiedono di un lead per nome, usa il tool list_leads o search per trovarlo — NON chiedere l'ID all'utente\n"
            "- Per operazioni AirCall su un lead specifico, prima recupera il lead con list_leads cercando per nome\n"
            "- Usa SOLO i tool per dati reali, non inventare\n"
            "- Formatta con markdown (grassetto per urgenze, liste per elenchi)\n"
            "- Lingua: italiano"
            f"{context_block}"
        )

    async def _call_with_retry(
        self,
        client: Any,
        call_params: Dict[str, Any],
        retry: int = 3,
    ) -> Any:
        """Chiama l'API Anthropic (async) con retry esponenziale su rate limit."""
        for attempt in range(retry):
            try:
                return await client.messages.create(**call_params)
            except _anthropic_lib.RateLimitError as e:
                if attempt < retry - 1:
                    wait = 2 ** (attempt + 1)
                    print(f"Rate limit, retry {attempt+1}/{retry-1} tra {wait}s…")
                    await asyncio.sleep(wait)
                else:
                    raise e
        raise RuntimeError("Unreachable")

    async def chat(self, message: str, history: List[Dict], agent_id: Optional[str] = None, context: Optional[str] = None) -> Dict[str, Any]:
        api_key = _anthropic_key()
        if not _ANTHROPIC_AVAILABLE or not api_key:
            return {
                "response": "ANTHROPIC_API_KEY non configurata. Aggiungila nelle variabili d'ambiente.",
                "tools_used": [],
                "agent_id": self.config["id"],
                "error": "no_api_key",
            }

        client = _anthropic_lib.AsyncAnthropic(api_key=api_key)
        # Prendi solo role/content (compatibilità Anthropic) e limita a 20 messaggi recenti
        # per ridurre i token e velocizzare la risposta
        clean_history = [
            {"role": m["role"], "content": m["content"]}
            for m in history
            if m.get("role") in ("user", "assistant") and m.get("content")
        ][-20:]
        messages = clean_history + [{"role": "user", "content": message}]
        tools_used: List[str] = []

        try:
            for _ in range(MAX_TOOL_ITERATIONS):
                call_params: Dict[str, Any] = {
                    "model": _model(),
                    "max_tokens": 2000,
                    "system": self._system_prompt(context=context),
                    "tools": self.config["tools"],
                    "messages": messages,
                }

                response = await self._call_with_retry(client, call_params)

                if response.stop_reason == "tool_use":
                    tool_results = []
                    for block in response.content:
                        if block.type == "tool_use":
                            tools_used.append(block.name)
                            result_text = await self.executor.execute(block.name, block.input)
                            tool_results.append({
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result_text,
                            })
                    messages.append({"role": "assistant", "content": response.content})
                    messages.append({"role": "user", "content": tool_results})
                else:
                    text = "".join(b.text for b in response.content if hasattr(b, "text"))
                    return {
                        "response": text,
                        "tools_used": tools_used,
                        "agent_id": self.config["id"],
                        "error": None,
                    }

            return {
                "response": "Troppe iterazioni di tool calling. Riprova con una richiesta più specifica.",
                "tools_used": tools_used,
                "agent_id": self.config["id"],
                "error": "max_iterations",
            }

        except _anthropic_lib.RateLimitError:
            return {
                "response": (
                    "Limite di token per minuto raggiunto (30k tokens/min). "
                    "La richiesta era troppo grande.\n\n"
                    "**Suggerimenti:**\n"
                    "- Spezza la richiesta in parti più piccole\n"
                    "- Aspetta 60 secondi e riprova\n"
                    "- Per operazioni massive usa frasi come: "
                    "_\"Analizza i primi 10 lead con trascrizioni Fireflies\"_"
                ),
                "tools_used": tools_used,
                "agent_id": self.config["id"],
                "error": "rate_limit",
            }
        except _anthropic_lib.BadRequestError as e:
            return {
                "response": f"Richiesta non valida: {e}",
                "tools_used": tools_used,
                "agent_id": self.config["id"],
                "error": "bad_request",
            }
        except Exception as e:
            return {
                "response": f"Errore imprevisto: {e}",
                "tools_used": tools_used,
                "agent_id": self.config["id"],
                "error": "unexpected",
            }


# ─── Orchestratore ─────────────────────────────────────────────────────────────

class EvoAgentOrchestrator:
    """
    Orchestratore centrale. Smista i messaggi all'agente corretto,
    o gestisce direttamente con accesso a tutti i tool.
    """

    def __init__(self, token: str, user: Dict[str, Any]):
        self.token = token
        self.user = user

    def _get_agent(self, agent_id: str) -> Agent:
        agent_id = agent_id if agent_id in AGENT_CONFIGS else "orchestrator"
        return Agent(agent_id=agent_id, token=self.token, user=self.user)

    async def chat(
        self,
        message: str,
        history: List[Dict],
        agent_id: str = "orchestrator",
    ) -> Dict[str, Any]:
        agent = self._get_agent(agent_id)
        return await agent.chat(message=message, history=history)

    async def morning_briefing(self, agent_id: str = "orchestrator") -> Dict[str, Any]:
        prompt = (
            "Genera un briefing mattutino operativo per il team. "
            "Usa i tool per raccogliere: (1) task scaduti, (2) stato pipeline con lead critici, "
            "(3) pagamenti in sospeso o scaduti. "
            "Poi sintetizza in max 6 punti chiave con emoji. "
            "🔴 = critico/urgente, 🟡 = attenzione, ✅ = ok. "
            "Massimo 250 parole. Sii molto diretto."
        )
        return await self.chat(message=prompt, history=[], agent_id=agent_id)

    @staticmethod
    def get_agents_info() -> List[Dict]:
        return [
            {
                "id": cfg["id"],
                "name": cfg["name"],
                "emoji": cfg["emoji"],
                "description": cfg["description"],
                "tools_count": len(cfg["tools"]),
            }
            for cfg in AGENT_CONFIGS.values()
        ]


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _base_url() -> str:
    # Usa SEMPRE localhost per le chiamate interne del gateway unificato.
    # Chiamare l'URL esterno (GATEWAY_URL) causa 403 su Render perché il proxy
    # blocca richieste self-referenziali come potenziale SSRF.
    # INTERNAL_API_URL permette di sovrascrivere esplicitamente solo se necessario.
    if os.environ.get("INTERNAL_API_URL"):
        return os.environ["INTERNAL_API_URL"].rstrip("/")
    port = os.environ.get("PORT", "10000")
    return f"http://localhost:{port}"
