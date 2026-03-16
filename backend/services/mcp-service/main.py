import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
import os
import sys
import json

# Assicura che la directory del mcp-service sia in sys.path anche a runtime
# (il api-gateway rimuove le path dei servizi dopo il caricamento)
_MCP_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
if _MCP_SERVICE_DIR not in sys.path:
    sys.path.insert(0, _MCP_SERVICE_DIR)

import mcp.types as types
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from starlette.routing import Mount, Route
from starlette.endpoints import HTTPEndpoint
from fastapi import FastAPI, Request, HTTPException, Depends, BackgroundTasks
from pydantic import BaseModel
from openai import AsyncOpenAI
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, cast, String, text
from datetime import datetime, timedelta
from data import SERVIZI_CATALOG, PREVENTIVO_SCHEMA, EXPENSE_CATEGORIES
from database import SessionLocal, engine, Base
from models import ChatSession, ChatMessage, Assessment, AgentConversation as _AgentConversation
import httpx

# Import EvoAgent a livello di modulo (il path è già garantito da _MCP_SERVICE_DIR)
try:
    from evo_agent import EvoAgentOrchestrator as _EvoAgentOrchestrator
except ImportError as _e:
    print(f"⚠️ evo_agent non importabile: {_e}")
    _EvoAgentOrchestrator = None
from bs4 import BeautifulSoup
# Aggiungi il path del sibill-service per importare il categorizzatore
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'sibill-service'))
try:
    from categorizer import categorize_transaction, get_category_info
except ImportError:
    # Fallback se non disponibile
    def categorize_transaction(description: str, amount: float, counterpart_name: str = None):
        return "altro", "Da verificare"
    def get_category_info(key: str):
        return {"label": "Altro", "deductibility": "Da verificare", "type": "Deducibilità", "description": ""}

# Inizializzazione tabelle DB - Lazy con retry per gestire database in sleep mode
def init_database_with_retry(max_retries=5, delay=3):
    """Inizializza il database con retry per gestire connessioni fallite"""
    import time
    from sqlalchemy.exc import OperationalError, TimeoutError
    
    for attempt in range(max_retries):
        try:
            # Prova a connettere e creare le tabelle
            Base.metadata.create_all(bind=engine)
            print(f"✅ Database MCP inizializzato con successo (tentativo {attempt + 1})")
            return True
        except (OperationalError, TimeoutError) as e:
            error_msg = str(e)
            if attempt < max_retries - 1:
                wait_time = delay * (attempt + 1)  # Backoff esponenziale: 3s, 6s, 9s, 12s, 15s
                print(f"⚠️ Errore connessione database (tentativo {attempt + 1}/{max_retries})")
                print(f"   Errore: {error_msg[:200]}...")  # Limita lunghezza messaggio
                print(f"🔄 Retry tra {wait_time} secondi...")
                time.sleep(wait_time)
            else:
                print(f"❌ Impossibile connettersi al database dopo {max_retries} tentativi")
                print(f"   Ultimo errore: {error_msg[:200]}...")
                print(f"⚠️ Le tabelle verranno create al primo accesso.")
                return False
        except Exception as e:
            error_msg = str(e)
            print(f"❌ Errore inizializzazione database: {error_msg[:200]}...")
            if attempt < max_retries - 1:
                wait_time = delay * (attempt + 1)
                print(f"🔄 Retry tra {wait_time} secondi...")
                time.sleep(wait_time)
            else:
                print(f"⚠️ Le tabelle verranno create al primo accesso.")
                return False
    
    return False

# NON inizializzare il database durante l'import - verrà fatto al primo accesso
# Questo evita di bloccare l'avvio dell'applicazione se il database non è disponibile

# Flag per tracciare se il database è stato inizializzato
_db_initialized = False

def get_db():
    global _db_initialized
    db = SessionLocal()
    try:
        if not _db_initialized:
            try:
                # Crea tutte le tabelle (inclusa agent_conversations)
                Base.metadata.create_all(bind=engine)
                # Migrazione sicura: crea agent_conversations se non esiste già (DB pre-esistente)
                try:
                    db.execute(text("""
                        CREATE TABLE IF NOT EXISTS agent_conversations (
                            id VARCHAR(50) PRIMARY KEY,
                            user_id VARCHAR(50),
                            session_id VARCHAR(100),
                            channel VARCHAR(20) DEFAULT 'evometrics',
                            messages JSONB DEFAULT '[]',
                            title VARCHAR(200),
                            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                        )
                    """))
                    db.commit()
                except Exception:
                    db.rollback()
                _db_initialized = True
                print("✅ Database MCP inizializzato al primo accesso (incl. agent_conversations)")
            except Exception as e:
                print(f"⚠️ Errore inizializzazione database al primo accesso: {e}")
        yield db
    finally:
        db.close()

# Configurazione Server MCP
mcp_server = Server("evoluzione-imprese-preventivi")

# --- TOOL IMPLEMENTATIONS ---

async def analyze_website(url: str) -> str:
    """
    Analisi avanzata di un sito web: contenuto, tecnologia, SEO e contatti.
    """
    try:
        # Aggiungi schema se mancante
        if not url.startswith('http'):
            url = 'https://' + url
            
        async with httpx.AsyncClient(follow_redirects=True, timeout=15.0, headers={"User-Agent": "Mozilla/5.0 (compatible; EvoluzioneImpreseBot/1.0)"}) as client:
            response = await client.get(url)
            response.raise_for_status()
            
            html_content = response.text
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # 1. Rilevamento Tecnologie (CMS Detector)
            technologies = []
            if "shopify" in html_content.lower():
                technologies.append("Shopify")
            if "wp-content" in html_content.lower() or "wordpress" in html_content.lower():
                technologies.append("WordPress")
            if "wix" in html_content.lower():
                technologies.append("Wix")
            if "squarespace" in html_content.lower():
                technologies.append("Squarespace")
            if "magento" in html_content.lower():
                technologies.append("Magento")
            if "prestashop" in html_content.lower():
                technologies.append("PrestaShop")
            if not technologies:
                technologies.append("Custom/Sconosciuto")

            # 2. Estrazione SEO Base
            title = soup.title.string.strip() if soup.title else "Nessun titolo"
            meta_desc = soup.find("meta", attrs={"name": "description"})
            description = meta_desc["content"].strip() if meta_desc else "Nessuna descrizione"
            
            h1_tags = [h1.get_text(strip=True) for h1 in soup.find_all("h1")]
            
            # 3. Estrazione Social & Contatti
            social_links = []
            contacts = []
            for link in soup.find_all("a", href=True):
                href = link["href"].lower()
                if "facebook.com" in href: social_links.append("Facebook")
                if "instagram.com" in href: social_links.append("Instagram")
                if "linkedin.com" in href: social_links.append("LinkedIn")
                if "tiktok.com" in href: social_links.append("TikTok")
                if "mailto:" in href: contacts.append(href.replace("mailto:", ""))
                if "tel:" in href: contacts.append(href.replace("tel:", ""))
            
            social_links = list(set(social_links)) # Rimuovi duplicati
            contacts = list(set(contacts))

            # 4. Pulizia Contenuto Testuale
            for script in soup(["script", "style", "nav", "footer", "noscript", "iframe"]):
                script.decompose()
            
            text = soup.get_text()
            lines = (line.strip() for line in text.splitlines())
            chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
            clean_text = '\n'.join(chunk for chunk in chunks if chunk)
            
            # Costruzione Report
            report = f"""
ANALISI SITO: {url}
----------------------------------------
TECNOLOGIA RILEVATA: {', '.join(technologies)}
TITOLO: {title}
DESCRIZIONE: {description}
H1 PRINCIPALI: {', '.join(h1_tags[:3])}
SOCIAL TROVATI: {', '.join(social_links) if social_links else "Nessuno"}
CONTATTI TROVATI: {', '.join(contacts) if contacts else "Nessuno"}
----------------------------------------
CONTENUTO PRINCIPALE (estratto):
{clean_text[:3000]}...
"""
            return report
            
    except Exception as e:
        return f"Errore durante l'analisi del sito {url}: {str(e)}"

def calculate_prezzi_from_servizi(servizi: Dict[str, List[str]]) -> Dict[str, float]:
    """
    Calcola automaticamente i prezzi basandosi sui servizi selezionati e i prezzi base nel catalogo.
    """
    prezzi = {}
    
    # Crea una mappa rapida: categoria_id -> sottoservizi con prezzi
    catalog_map = {}
    for categoria in SERVIZI_CATALOG:
        catalog_map[categoria["id"]] = {
            sub["id"]: sub.get("prezzo_base", 0) 
            for sub in categoria.get("sottoservizi", [])
        }
    
    # Per ogni categoria di servizi selezionata
    for categoria_id, sottoservizi_ids in servizi.items():
        if categoria_id in catalog_map:
            # Per ogni sottoservizio selezionato
            for sottoservizio_id in sottoservizi_ids:
                prezzo_base = catalog_map[categoria_id].get(sottoservizio_id, 0)
                if prezzo_base > 0:
                    prezzi[sottoservizio_id] = float(prezzo_base)
    
    return prezzi

async def search_assessments_db(query: str) -> str:
    """Cerca assessment nel database per nome cliente o azienda"""
    db = SessionLocal()
    try:
        # Poiché client_info è JSON, usiamo cast a stringa per cercare
        assessments = db.query(Assessment).filter(
            cast(Assessment.client_info, String).ilike(f"%{query}%")
        ).order_by(desc(Assessment.created_at)).limit(5).all()
        
        if not assessments:
            return f"Nessun assessment trovato per '{query}'."
            
        results = []
        for a in assessments:
            # Decodifica client_info se è stringa
            client_info = a.client_info
            if isinstance(client_info, str):
                try:
                    client_info = json.loads(client_info)
                except:
                    pass
            
            nome = "Sconosciuto"
            azienda = "Sconosciuta"
            if isinstance(client_info, dict):
                nome = client_info.get('nome', client_info.get('full_name', 'Sconosciuto'))
                azienda = client_info.get('nomeAzienda', client_info.get('company', 'Sconosciuta'))
            
            results.append(f"- ID: {a.id}\n  Cliente: {nome} ({azienda})\n  Data: {a.created_at.strftime('%d/%m/%Y')}")
            
        return "Assessment trovati (usa l'ID per vedere i dettagli):\n" + "\n".join(results)
    except Exception as e:
        return f"Errore ricerca assessment: {str(e)}"
    finally:
        db.close()

async def get_assessment_details_db(assessment_id: str) -> str:
    """Recupera i dettagli completi di un assessment"""
    db = SessionLocal()
    try:
        assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
        
        if not assessment:
            return f"Assessment {assessment_id} non trovato."
            
        # Serializza tutto
        data = assessment.data
        if isinstance(data, str):
            try: data = json.loads(data)
            except: pass
            
        client_info = assessment.client_info
        if isinstance(client_info, str):
            try: client_info = json.loads(client_info)
            except: pass
            
        details = {
            "id": assessment.id,
            "data": data,
            "client_info": client_info,
            "notes": assessment.notes,
            "created_at": assessment.created_at.strftime('%Y-%m-%d %H:%M') if assessment.created_at else None
        }
        
        return json.dumps(details, indent=2, ensure_ascii=False)
    except Exception as e:
        return f"Errore recupero dettagli assessment: {str(e)}"
    finally:
        db.close()

# --- OPENAI CHAT LOGIC ---

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[int] = None
    history: List[Dict[str, str]] = []

# Client OpenAI
aclient = None

def get_openai_client():
    global aclient
    if aclient is None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if api_key:
            aclient = AsyncOpenAI(api_key=api_key)
        else:
            print("⚠️ OPENAI_API_KEY non trovata nelle variabili d'ambiente")
    return aclient

# --- RESOURCES ---
# Le risorse permettono all'AI di "leggere" dati statici o dinamici

@mcp_server.list_resources()
async def handle_list_resources() -> list[types.Resource]:
    return [
        types.Resource(
            uri=types.AnyUrl("preventivi://catalog"),
            name="Catalogo Servizi Evoluzione Imprese",
            description="Lista completa dei servizi offerti con descrizioni e ID",
            mimeType="application/json",
        ),
        types.Resource(
            uri=types.AnyUrl("preventivi://schema"),
            name="Schema JSON Preventivo",
            description="Struttura JSON richiesta per creare un preventivo valido",
            mimeType="application/json",
        ),
        types.Resource(
            uri=types.AnyUrl("spese://categorie"),
            name="Categorie di Spese Fiscali",
            description="Lista completa delle categorie di spese con regole di deducibilità secondo la normativa fiscale italiana",
            mimeType="application/json",
        ),
    ]

@mcp_server.read_resource()
async def handle_read_resource(uri: types.AnyUrl) -> str | bytes:
    if uri.path == "/catalog":
        import json
        return json.dumps(SERVIZI_CATALOG, indent=2)
    elif uri.path == "/schema":
        import json
        return json.dumps(PREVENTIVO_SCHEMA, indent=2)
    elif uri.path == "/categorie":
        import json
        return json.dumps(EXPENSE_CATEGORIES, indent=2)
    raise ValueError(f"Resource not found: {uri}")

# --- TOOLS DEFINITIONS (For MCP Protocol) ---

@mcp_server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="validate_preventivo_structure",
            description="Verifica se la struttura dati del preventivo è valida prima di salvarla",
            inputSchema={
                "type": "object",
                "properties": {
                    "preventivo_json": {"type": "object"}
                }
            },
        ),
        types.Tool(
            name="analyze_website",
            description="Analizza il contenuto di una pagina web per estrarre informazioni sul cliente",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {"type": "string", "description": "URL del sito da analizzare"}
                },
                "required": ["url"]
            },
        ),
        types.Tool(
            name="categorize_expense",
            description="Categorizza una spesa bancaria secondo le regole fiscali italiane. Analizza la descrizione, l'importo e il nome della controparte per determinare la categoria corretta e la percentuale di deducibilità.",
            inputSchema={
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "Descrizione del movimento bancario"},
                    "amount": {"type": "number", "description": "Importo della spesa (sempre positivo)"},
                    "counterpart_name": {"type": "string", "description": "Nome della controparte/fornitore (opzionale)"}
                },
                "required": ["description", "amount"]
            },
        ),
        types.Tool(
            name="search_assessments",
            description="Cerca assessment compilati nel database per nome cliente o azienda. Utile per trovare dati su cui basare un preventivo.",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Nome del cliente o dell'azienda da cercare"}
                },
                "required": ["query"]
            },
        ),
        types.Tool(
            name="get_assessment_details",
            description="Recupera i dettagli completi di un assessment specifico dato il suo ID. Usalo dopo aver trovato l'ID con search_assessments.",
            inputSchema={
                "type": "object",
                "properties": {
                    "assessment_id": {"type": "string", "description": "L'ID univoco dell'assessment"}
                },
                "required": ["assessment_id"]
            },
        )
    ]

@mcp_server.call_tool()
async def handle_call_tool(
    name: str, arguments: dict | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    if name == "validate_preventivo_structure":
        data = arguments.get("preventivo_json", {})
        missing = []
        for field in ["cliente", "oggetto", "servizi", "prezzi"]:
            if field not in data:
                missing.append(field)
        
        if missing:
            return [types.TextContent(type="text", text=f"Errore: Mancano i campi obbligatori: {', '.join(missing)}")]
        return [types.TextContent(type="text", text="Struttura valida!")]
    
    elif name == "analyze_website":
        url = arguments.get("url")
        if not url:
            return [types.TextContent(type="text", text="Errore: URL mancante")]
        content = await analyze_website(url)
        return [types.TextContent(type="text", text=content)]
    
    elif name == "categorize_expense":
        description = arguments.get("description", "")
        amount = arguments.get("amount", 0.0)
        counterpart_name = arguments.get("counterpart_name")
        
        if not description:
            return [types.TextContent(type="text", text="Errore: Descrizione mancante")]
        
        # Usa il categorizzatore euristico
        cat_key, deductibility = categorize_transaction(description, abs(amount), counterpart_name)
        cat_info = get_category_info(cat_key)
        
        result = {
            "category_key": cat_key,
            "category_label": cat_info["label"],
            "deductibility": cat_info["deductibility"],
            "type": cat_info["type"],
            "description": cat_info["description"],
            "confidence": "high" if cat_key != "altro" else "low",
            "reasoning": f"La spesa è stata categorizzata come '{cat_info['label']}' basandosi sulla descrizione '{description}'" + (f" e sul fornitore '{counterpart_name}'" if counterpart_name else "")
        }
        
        import json
        return [types.TextContent(type="text", text=json.dumps(result, indent=2, ensure_ascii=False))]
        
    elif name == "search_assessments":
        query = arguments.get("query")
        if not query:
            return [types.TextContent(type="text", text="Errore: Query mancante")]
        content = await search_assessments_db(query)
        return [types.TextContent(type="text", text=content)]

    elif name == "get_assessment_details":
        assessment_id = arguments.get("assessment_id")
        if not assessment_id:
            return [types.TextContent(type="text", text="Errore: ID assessment mancante")]
        content = await get_assessment_details_db(assessment_id)
        return [types.TextContent(type="text", text=content)]

    raise ValueError(f"Tool not found: {name}")

# --- FASTAPI APP ---

app = FastAPI()

@app.post("/api/mcp/chat")
async def chat_endpoint(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Endpoint per la chat con l'AI nel preventivatore.
    Supporta Function Calling Loop per navigazione web e generazione preventivi.
    """
    client = get_openai_client()
    if not client:
        return {
            "message": "Configurazione OpenAI mancante. Per favore imposta OPENAI_API_KEY.",
            "is_preventivo": False,
            "preventivo": None
        }
    
    # Gestione Sessione con retry su errori di connessione
    session_id = request.session_id
    try:
        if not session_id:
            new_session = ChatSession(title=f"Chat del {datetime.now().strftime('%Y-%m-%d %H:%M')}")
            db.add(new_session)
            db.commit()
            db.refresh(new_session)
            session_id = new_session.id
        
        # Salva messaggio utente
        user_msg_db = ChatMessage(session_id=session_id, role="user", content=request.message)
        db.add(user_msg_db)
        db.commit()

        # Recupera contesto storico dal DB
        past_messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at).all()
    except Exception as db_error:
        # Se la connessione è scaduta, ricrea la sessione
        print(f"Errore DB, retry: {db_error}")
        db.rollback()
        db.close()
        db = SessionLocal()
        try:
            if not session_id:
                new_session = ChatSession(title=f"Chat del {datetime.now().strftime('%Y-%m-%d %H:%M')}")
                db.add(new_session)
                db.commit()
                db.refresh(new_session)
                session_id = new_session.id
            
            user_msg_db = ChatMessage(session_id=session_id, role="user", content=request.message)
            db.add(user_msg_db)
            db.commit()
            past_messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at).all()
        except Exception as e2:
            print(f"Errore DB anche dopo retry: {e2}")
            raise HTTPException(status_code=500, detail="Errore database")
    
    # Costruisci array messaggi per OpenAI
    # Nota: OpenAI si aspetta che le risposte ai tool siano messaggi di tipo 'tool'
    # Per semplicità in questa implementazione, rigeneriamo il contesto come system + user/assistant
    # Una gestione perfetta dello storico tool calls richiederebbe di salvare nel DB anche i tool_calls e tool_outputs
    # Qui semplifichiamo salvando solo il testo visibile, ma per il loop corrente manteniamo lo stato in memoria
    
    system_prompt = f"""
    Sei un consulente esperto di 'Evoluzione Imprese'.
    
    CATALOGO SERVIZI (con prezzi base indicativi):
    {json.dumps(SERVIZI_CATALOG, indent=2)}
    
    STRUMENTI A DISPOSIZIONE:
    1. analyze_website(url): USA QUESTO TOOL per visitare i siti dei clienti. Analizza homepage, chi siamo, servizi. Fai più ricerche se serve.
    2. search_assessments(query): Cerca assessment compilati per nome cliente/azienda.
    3. get_assessment_details(id): Leggi i dettagli di un assessment per creare un preventivo basato sui dati reali.
    4. generate_preventivo(json): Usa questo SOLO quando hai tutte le info (Cliente, Obiettivo, Servizi selezionati).
    
    IMPORTANTE - GENERAZIONE PREVENTIVO:
    - Quando chiami generate_preventivo, fornisci SOLO: cliente, oggetto, servizi (array di ID sottoservizi), note (opzionale).
    - NON devi calcolare manualmente i prezzi: il sistema li calcolerà automaticamente basandosi sui prezzi base del catalogo.
    - Puoi comunque includere "prezzi" se vuoi personalizzarli, ma non è obbligatorio.
    
    REGOLE:
    - Usa Markdown (liste, grassetto).
    - Se il cliente ti dà un sito, ANALIZZALO PRIMA di proporre servizi.
    - Sii proattivo e commerciale.
    - Risposte BREVI e DIRETTE.
    """
    
    # Contesto base dai messaggi precedenti (solo testo per ora)
    messages_context = [{"role": "system", "content": system_prompt}]
    for m in past_messages:
        # Evita di duplicare l'ultimo messaggio appena inserito
        if m.id != user_msg_db.id:
            content = m.content
            # Se era un preventivo, aggiungiamo una nota nel testo per dare contesto all'AI
            if m.is_preventivo:
                content += "\n[SYSTEM: Un preventivo è stato generato in questo punto]"
            messages_context.append({"role": m.role, "content": content})
            
    # Aggiungi il messaggio corrente
    messages_context.append({"role": "user", "content": request.message})
    
    # Definizione Tools OpenAI
    tools = [
        {
            "type": "function",
            "function": {
                "name": "generate_preventivo",
                "description": "Genera il preventivo finale in formato JSON.",
                "parameters": PREVENTIVO_SCHEMA
            }
        },
        {
            "type": "function",
            "function": {
                "name": "analyze_website",
                "description": "Analisi completa sito web: tecnologia (CMS), SEO (meta tags), social, contatti e contenuto.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string", "description": "L'URL completo del sito da analizzare (es. https://example.com)"}
                    },
                    "required": ["url"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_assessments",
                "description": "Cerca assessment compilati nel database.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Nome del cliente o dell'azienda"}
                    },
                    "required": ["query"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_assessment_details",
                "description": "Recupera i dettagli di un assessment dato l'ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "assessment_id": {"type": "string", "description": "L'ID dell'assessment"}
                    },
                    "required": ["assessment_id"]
                }
            }
        }
    ]
    
    model_name = os.environ.get("OPENAI_MODEL", "gpt-5.1") # Fallback a gpt-4o se 5.1 non disp
    
    # --- LOOP DI ESECUZIONE TOOLS ---
    # Continua a chiamare l'AI finché non restituisce un messaggio finale (senza tool calls)
    # o finché non chiama generate_preventivo
    
    max_iterations = 5
    current_iteration = 0
    final_response = None
    is_preventivo = False
    preventivo_json = None
    
    while current_iteration < max_iterations:
        current_iteration += 1
        
        try:
            response = await client.chat.completions.create(
                model=model_name,
                messages=messages_context,
                tools=tools,
                tool_choice="auto"
            )
            
            assistant_msg = response.choices[0].message
            
            # Aggiungi il messaggio dell'assistente al contesto corrente (anche se è una tool call)
            messages_context.append(assistant_msg)
            
            # Se l'AI vuole chiamare un tool
            if assistant_msg.tool_calls:
                for tool_call in assistant_msg.tool_calls:
                    function_name = tool_call.function.name
                    arguments = json.loads(tool_call.function.arguments)
                    
                    tool_output = ""
                    
                    if function_name == "analyze_website":
                        # Esegui scraping
                        url = arguments.get("url")
                        tool_output = await analyze_website(url)
                        
                        # Aggiungi il risultato al contesto
                        messages_context.append({
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": "analyze_website",
                            "content": tool_output
                        })

                    elif function_name == "search_assessments":
                        query = arguments.get("query")
                        tool_output = await search_assessments_db(query)
                        messages_context.append({
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": "search_assessments",
                            "content": tool_output
                        })
                        
                    elif function_name == "get_assessment_details":
                        assessment_id = arguments.get("assessment_id")
                        tool_output = await get_assessment_details_db(assessment_id)
                        messages_context.append({
                            "tool_call_id": tool_call.id,
                            "role": "tool",
                            "name": "get_assessment_details",
                            "content": tool_output
                        })
                        
                    elif function_name == "generate_preventivo":
                        # Abbiamo il risultato finale!
                        preventivo_json = arguments
                        
                        # Calcola automaticamente i prezzi se mancanti o incompleti
                        if "servizi" in preventivo_json:
                            prezzi_calcolati = calculate_prezzi_from_servizi(preventivo_json["servizi"])
                            # Se l'AI ha già fornito alcuni prezzi, li manteniamo, altrimenti usiamo quelli calcolati
                            if "prezzi" not in preventivo_json or not preventivo_json["prezzi"]:
                                preventivo_json["prezzi"] = prezzi_calcolati
                            else:
                                # Merge: mantieni prezzi AI se presenti, altrimenti usa quelli calcolati
                                for key, value in prezzi_calcolati.items():
                                    if key not in preventivo_json["prezzi"]:
                                        preventivo_json["prezzi"][key] = value
                        
                        # Calcola totali automaticamente
                        subtotale = sum(preventivo_json.get("prezzi", {}).values())
                        iva = subtotale * 0.22
                        totale = subtotale + iva
                        preventivo_json["subtotale"] = round(subtotale, 2)
                        preventivo_json["iva"] = round(iva, 2)
                        preventivo_json["totale"] = round(totale, 2)
                        
                        # Aggiungi date se mancanti
                        if "data" not in preventivo_json or not preventivo_json["data"]:
                            preventivo_json["data"] = datetime.now().strftime("%Y-%m-%d")
                        if "validita" not in preventivo_json or not preventivo_json["validita"]:
                            validita_date = datetime.now() + timedelta(days=30)
                            preventivo_json["validita"] = validita_date.strftime("%Y-%m-%d")
                        
                        is_preventivo = True
                        final_response = "Ho preparato il preventivo basato sulle informazioni raccolte. I prezzi sono stati calcolati automaticamente. Puoi vederlo qui sotto."
                        # Interrompiamo il loop
                        current_iteration = max_iterations 
                        break
                
                # Se abbiamo generato il preventivo, usciamo dal while
                if is_preventivo:
                    break
                    
            else:
                # Risposta testuale normale, finiamo qui
                final_response = assistant_msg.content
                break
                
        except Exception as e:
            print(f"Errore loop OpenAI: {e}")
            final_response = f"Si è verificato un errore tecnico: {str(e)}"
            break
            
    # Salva la risposta finale nel DB
    if final_response:
        try:
            assistant_msg_db = ChatMessage(
                session_id=session_id,
                role="assistant",
                content=final_response,
                is_preventivo=is_preventivo,
                preventivo_data=preventivo_json
            )
            db.add(assistant_msg_db)
            db.commit()
        except Exception as db_error:
            # Retry con nuova sessione se la connessione è scaduta
            print(f"Errore salvataggio risposta, retry: {db_error}")
            db.rollback()
            db.close()
            db = SessionLocal()
            try:
                assistant_msg_db = ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=final_response,
                    is_preventivo=is_preventivo,
                    preventivo_data=preventivo_json
                )
                db.add(assistant_msg_db)
                db.commit()
            except Exception as e2:
                print(f"Errore salvataggio anche dopo retry: {e2}")
                # Non blocchiamo la risposta anche se il salvataggio fallisce

    return {
        "message": final_response,
        "is_preventivo": is_preventivo,
        "preventivo": preventivo_json,
        "session_id": session_id
    }

@app.get("/api/mcp/chat/history/{session_id}")
async def get_chat_history(session_id: int, db: Session = Depends(get_db)):
    """Recupera lo storico di una chat specifica"""
    try:
        messages = db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at).all()
        return [
            {
                "role": m.role,
                "content": m.content,
                "is_preventivo": m.is_preventivo,
                "preventivo": m.preventivo_data
            }
            for m in messages
        ]
    except Exception as e:
        # Se la connessione è scaduta, prova a ricreare la sessione
        db.rollback()
        db.close()
        # Riapri una nuova sessione
        new_db = SessionLocal()
        try:
            messages = new_db.query(ChatMessage).filter(ChatMessage.session_id == session_id).order_by(ChatMessage.created_at).all()
            return [
                {
                    "role": m.role,
                    "content": m.content,
                    "is_preventivo": m.is_preventivo,
                    "preventivo": m.preventivo_data
                }
                for m in messages
            ]
        finally:
            new_db.close()

@app.get("/api/mcp/chat/sessions")
async def get_chat_sessions(db: Session = Depends(get_db)):
    """Recupera tutte le sessioni di chat"""
    try:
        sessions = db.query(ChatSession).order_by(desc(ChatSession.updated_at)).limit(20).all()
        return [
            {
                "id": s.id,
                "title": s.title,
                "updated_at": s.updated_at.isoformat() if s.updated_at else None
            }
            for s in sessions
        ]
    except Exception as e:
        # Se la connessione è scaduta, prova a ricreare la sessione
        db.rollback()
        db.close()
        new_db = SessionLocal()
        try:
            sessions = new_db.query(ChatSession).order_by(desc(ChatSession.updated_at)).limit(20).all()
            return [
                {
                    "id": s.id,
                    "title": s.title,
                    "updated_at": s.updated_at.isoformat() if s.updated_at else None
                }
                for s in sessions
            ]
        finally:
            new_db.close()

@app.delete("/api/mcp/chat/sessions/{session_id}")
async def delete_chat_session(session_id: int, db: Session = Depends(get_db)):
    """Elimina una sessione di chat"""
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    db.delete(session)
    db.commit()
    return {"success": True}

@app.get("/api/mcp/sse")
async def handle_sse(request: Request):
    async with SseServerTransport("/api/mcp/messages") as transport:
        async with mcp_server.run_sse(transport) as streams:
            await transport.handle_sse(request)

@app.post("/api/mcp/messages")
async def handle_messages(request: Request):
    pass


# ═══════════════════════════════════════════════════════════════════════════
# EVO AGENT — Claude Orchestrator Endpoints
# ═══════════════════════════════════════════════════════════════════════════

# AgentConversation già importato a livello di modulo come _AgentConversation

class EvoAgentChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    channel: str = "evometrics"
    agent_id: str = "orchestrator"  # orchestrator | sales | ops | finance | clients


class EvoAgentChatResponse(BaseModel):
    response: str
    conversation_id: str
    tools_used: list
    error: Optional[str] = None


def _get_evo_agent_user(request: Request) -> dict:
    """Estrae l'utente dal JWT token nella request."""
    SECRET_KEY = os.environ.get("SECRET_KEY", "")
    ALGORITHM = "HS256"
    from jose import JWTError, jwt as jose_jwt
    auth = request.headers.get("Authorization", "")
    token = auth.replace("Bearer ", "") if auth.startswith("Bearer ") else ""
    if not token:
        return {"id": "anonymous", "nome": "Utente", "cognome": "", "role": "user", "username": ""}
    try:
        payload = jose_jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return {
            "id": str(payload.get("sub", payload.get("user_id", ""))),
            "nome": payload.get("nome", ""),
            "cognome": payload.get("cognome", ""),
            "username": payload.get("username", ""),
            "role": payload.get("role", ""),
            "job_title": payload.get("job_title", ""),
        }
    except JWTError:
        return {"id": "anonymous", "nome": "Utente", "cognome": "", "role": "user", "username": ""}


def _get_jwt_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    return auth.replace("Bearer ", "") if auth.startswith("Bearer ") else ""


@app.post("/api/mcp/evo-agent/chat", response_model=EvoAgentChatResponse)
async def evo_agent_chat(payload: EvoAgentChatRequest, request: Request, db: Session = Depends(get_db)):
    """
    Endpoint principale EvoAgent.
    Processa un messaggio utente con Claude + tool calling verso i microservizi.
    Mantiene la storia della conversazione in agent_conversations.
    """
    EvoAgentOrchestrator = _EvoAgentOrchestrator
    if not EvoAgentOrchestrator:
        if _MCP_SERVICE_DIR not in sys.path:
            sys.path.insert(0, _MCP_SERVICE_DIR)
        from evo_agent import EvoAgentOrchestrator

    user = _get_evo_agent_user(request)
    token = _get_jwt_token(request)

    # Usa AgentConversation importato a livello di modulo (evita conflitti sys.path)
    AgentConversation = _AgentConversation

    # Carica o crea la conversazione
    conversation = None
    history = []
    if payload.conversation_id:
        try:
            conversation = db.query(AgentConversation).filter(
                AgentConversation.id == payload.conversation_id
            ).first()
            if conversation:
                history = conversation.messages or []
        except Exception:
            pass

    if not conversation:
        import uuid as _uuid
        conversation = AgentConversation(
            id=str(_uuid.uuid4()),
            user_id=user.get("id"),
            channel=payload.agent_id or payload.channel,
            messages=[],
            title=payload.message[:60],
        )
        try:
            db.add(conversation)
            db.commit()
            db.refresh(conversation)
        except Exception as e:
            print(f"⚠️ Warning salvataggio nuova conversazione: {e}")
            db.rollback()

    # Processa con l'orchestratore
    orchestrator = EvoAgentOrchestrator(token=token, user=user)
    result = await orchestrator.chat(message=payload.message, history=history, agent_id=payload.agent_id)

    # Salva la conversazione aggiornata
    active_agent_id = payload.agent_id or "orchestrator"
    try:
        new_messages = list(history) + [
            {"role": "user",      "content": payload.message,      "agent_id": active_agent_id, "ts": datetime.now().isoformat()},
            {"role": "assistant", "content": result["response"],   "agent_id": active_agent_id, "ts": datetime.now().isoformat()},
        ]
        # Mantieni max 50 messaggi per conversazione
        if len(new_messages) > 50:
            new_messages = new_messages[-50:]
        conversation.messages = new_messages
        if not conversation.title or conversation.title == "":
            conversation.title = payload.message[:60]
        db.commit()
    except Exception as e:
        print(f"⚠️ Warning salvataggio conversazione: {e}")
        db.rollback()

    return EvoAgentChatResponse(
        response=result["response"],
        conversation_id=conversation.id,
        tools_used=result.get("tools_used", []),
        error=result.get("error"),
    )


@app.get("/api/mcp/evo-agent/briefing")
async def evo_agent_briefing(request: Request, db: Session = Depends(get_db)):
    """
    Morning briefing automatico: Claude raccoglie dati operativi e genera un
    riepilogo con task scaduti, pipeline critica, pagamenti in sospeso.
    """
    EvoAgentOrchestrator = _EvoAgentOrchestrator
    if not EvoAgentOrchestrator:
        if _MCP_SERVICE_DIR not in sys.path:
            sys.path.insert(0, _MCP_SERVICE_DIR)
        from evo_agent import EvoAgentOrchestrator

    user = _get_evo_agent_user(request)
    token = _get_jwt_token(request)

    orchestrator = EvoAgentOrchestrator(token=token, user=user)
    result = await orchestrator.morning_briefing()

    return {
        "briefing": result["response"],
        "tools_used": result.get("tools_used", []),
        "generated_at": datetime.now().isoformat(),
        "error": result.get("error"),
    }


@app.get("/api/mcp/evo-agent/conversations")
async def list_evo_agent_conversations(request: Request, db: Session = Depends(get_db)):
    """Lista le conversazioni EvoAgent dell'utente corrente."""
    user = _get_evo_agent_user(request)
    AgentConversation = _AgentConversation
    try:
        convs = db.query(AgentConversation).filter(
            AgentConversation.user_id == user["id"]
        ).order_by(AgentConversation.updated_at.desc()).limit(20).all()
        return [
            {
                "id": c.id,
                "title": c.title or "Conversazione",
                "channel": c.channel,
                "message_count": len(c.messages or []),
                "updated_at": c.updated_at.isoformat() if c.updated_at else None,
            }
            for c in convs
        ]
    except Exception:
        return []


@app.get("/api/mcp/evo-agent/conversations/{conv_id}")
async def get_evo_agent_conversation(conv_id: str, request: Request, db: Session = Depends(get_db)):
    """Restituisce i messaggi di una singola conversazione EvoAgent."""
    user = _get_evo_agent_user(request)
    AgentConversation = _AgentConversation
    try:
        conv = db.query(AgentConversation).filter(
            AgentConversation.id == conv_id,
            AgentConversation.user_id == user["id"],
        ).first()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversazione non trovata")
        return {
            "id": conv.id,
            "title": conv.title or "Conversazione",
            "channel": conv.channel,
            "agent_id": conv.channel or "orchestrator",
            "messages": conv.messages or [],
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/mcp/evo-agent/conversations/{conv_id}")
async def delete_evo_agent_conversation(conv_id: str, request: Request, db: Session = Depends(get_db)):
    """Elimina una conversazione EvoAgent."""
    user = _get_evo_agent_user(request)
    AgentConversation = _AgentConversation
    conv = db.query(AgentConversation).filter(
        AgentConversation.id == conv_id,
        AgentConversation.user_id == user["id"],
    ).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversazione non trovata")
    db.delete(conv)
    db.commit()
    return {"deleted": True}


@app.get("/api/mcp/evo-agent/agents")
async def list_agents():
    """Lista agenti disponibili con descrizione e tool count."""
    try:
        from evo_agent import EvoAgentOrchestrator as _EAO
        return {"agents": _EAO.get_agents_info()}
    except Exception as e:
        return {"agents": [], "error": str(e)}


@app.get("/api/mcp/evo-agent/status")
async def evo_agent_status():
    """Verifica se EvoAgent è configurato e operativo."""
    key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_API_KEY") or ""
    model = os.environ.get("CLAUDE_ORCHESTRATOR_MODEL") or os.environ.get("CLAUDE_MODEL") or "claude-sonnet-4-5"
    try:
        import anthropic as _a
        lib_ok = True
    except ImportError:
        lib_ok = False
    return {
        "configured": bool(key) and lib_ok,
        "anthropic_key": "presente" if key else "mancante (ANTHROPIC_API_KEY)",
        "library": "installata" if lib_ok else "mancante",
        "model": model,
    }


# ─── Fireflies Webhook ────────────────────────────────────────────────────────

_FIREFLIES_GQL_URL = "https://api.fireflies.ai/graphql"


async def _process_fireflies_webhook(transcript_id: str) -> None:
    """
    Processa una trascrizione Fireflies in background:
    1. Fetcha la trascrizione via GraphQL
    2. Claude la classifica (sales / ops / altro)
    3. Se sales: cerca il lead per nome/azienda/email, aggiorna le note
    4. Crea un task di follow-up se opportuno
    """
    import httpx as _httpx
    import anthropic as _anthropic

    ff_token = os.environ.get("FIREFLIES_API_KEY")
    claude_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_API_KEY")
    # Usa sempre localhost per le chiamate interne: evita 403 da proxy Render su richieste self-ref
    _port = os.environ.get("PORT", "10000")
    gateway_url = os.environ.get("INTERNAL_API_URL") or f"http://localhost:{_port}"
    # Usa un sistema token per le chiamate interne (admin-level)
    internal_token = os.environ.get("INTERNAL_SERVICE_TOKEN", "")

    if not ff_token:
        print("⚠️ Fireflies webhook: FIREFLIES_API_KEY mancante, skip.")
        return
    if not claude_key:
        print("⚠️ Fireflies webhook: ANTHROPIC_API_KEY mancante, skip classificazione.")
        return

    # ── Step 1: Fetch trascrizione ──────────────────────────────────────────
    gql = """
    query GetTranscript($id: String!) {
      transcript(id: $id) {
        id title date duration organizer_email
        participants { displayName email }
        summary { overview action_items keywords }
        sentences { raw_words speaker_name }
      }
    }
    """
    try:
        async with _httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(
                _FIREFLIES_GQL_URL,
                json={"query": gql, "variables": {"id": transcript_id}},
                headers={"Authorization": f"Bearer {ff_token}", "Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        print(f"⚠️ Fireflies webhook: errore fetch trascrizione {transcript_id}: {e}")
        return

    t = (data.get("data") or {}).get("transcript")
    if not t:
        print(f"⚠️ Fireflies webhook: trascrizione {transcript_id} non trovata in Fireflies.")
        return

    title        = t.get("title", "?")
    overview     = (t.get("summary") or {}).get("overview") or ""
    action_items = (t.get("summary") or {}).get("action_items") or ""
    participants = [p.get("displayName") or p.get("email", "?") for p in (t.get("participants") or [])]
    duration_min = int(t.get("duration") or 0) // 60
    print(f"📝 Fireflies webhook: trascrizione ricevuta → '{title}' ({duration_min} min)")

    # ── Step 2: Classifica con Claude ───────────────────────────────────────
    try:
        claude = _anthropic.Anthropic(api_key=claude_key)
        classification_prompt = (
            f"Classifica questa chiamata come 'sales', 'ops' o 'altro'.\n"
            f"Titolo: {title}\n"
            f"Partecipanti: {', '.join(participants)}\n"
            f"Sintesi: {overview[:500]}\n\n"
            f"Rispondi con UNA sola parola: sales, ops, o altro."
        )
        cr = claude.messages.create(
            model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5"),
            max_tokens=20,
            messages=[{"role": "user", "content": classification_prompt}],
        )
        classification = cr.content[0].text.strip().lower() if cr.content else "altro"
    except Exception as e:
        print(f"⚠️ Fireflies webhook: errore classificazione: {e}")
        classification = "altro"

    print(f"📊 Fireflies webhook: classificazione '{title}' → {classification}")

    if classification != "sales":
        print(f"ℹ️ Fireflies webhook: chiamata non sales ({classification}), skip aggiornamento lead.")
        return

    # ── Step 3: Cerca lead correlato ────────────────────────────────────────
    # Estrai nomi dai partecipanti per il matching
    try:
        headers = {"Content-Type": "application/json"}
        if internal_token:
            headers["Authorization"] = f"Bearer {internal_token}"
        async with _httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{gateway_url}/api/leads", headers=headers)
            all_leads = r.json() if r.status_code == 200 else []
    except Exception as e:
        print(f"⚠️ Fireflies webhook: errore fetch leads: {e}")
        all_leads = []

    if not all_leads:
        print("⚠️ Fireflies webhook: nessun lead disponibile per il matching.")
        return

    # Matching euristico: controlla se nome/azienda del lead appare nel titolo o nei partecipanti
    matched_lead = None
    match_score  = 0
    title_lower  = title.lower()
    participants_str = " ".join(participants).lower()

    for lead in all_leads:
        score = 0
        nome_lead = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip().lower()
        azienda   = (lead.get("azienda") or "").lower()
        email_dom = (lead.get("email") or "").split("@")[0].lower()

        if nome_lead and nome_lead in title_lower:       score += 40
        if nome_lead and nome_lead in participants_str:  score += 40
        if azienda   and azienda   in title_lower:       score += 30
        if azienda   and azienda   in participants_str:  score += 30
        if email_dom and email_dom in title_lower:       score += 20

        if score > match_score:
            match_score  = score
            matched_lead = lead

    # Soglia minima 30 per procedere
    if not matched_lead or match_score < 30:
        print(f"ℹ️ Fireflies webhook: nessun lead con score sufficiente per '{title}' (best: {match_score})")
        return

    print(f"✅ Fireflies webhook: lead '{matched_lead.get('azienda') or matched_lead.get('email')}' matchato (score {match_score})")

    # ── Step 4: Genera nota strutturata con Claude ──────────────────────────
    try:
        note_prompt = (
            f"Genera una nota operativa concisa per un CRM sales su questa chiamata.\n"
            f"Usa questo formato esatto:\n\n"
            f"[AUTO - Fireflies {datetime.now().strftime('%Y-%m-%d')}]\n"
            f"Tipo call: [Discovery/Demo/Follow-up/Closing]\n"
            f"Durata: {duration_min} min\n"
            f"Partecipanti: {', '.join(participants)}\n"
            f"Sintesi: [max 3 frasi]\n"
            f"Action items: [lista puntata]\n"
            f"Sentiment: [positivo/neutro/negativo]\n\n"
            f"Dati della chiamata:\n"
            f"Sintesi Fireflies: {overview[:600]}\n"
            f"Action items Fireflies: {action_items[:400]}"
        )
        nr = claude.messages.create(
            model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5"),
            max_tokens=400,
            messages=[{"role": "user", "content": note_prompt}],
        )
        note_text = nr.content[0].text.strip() if nr.content else (
            f"[AUTO - Fireflies {datetime.now().strftime('%Y-%m-%d')}]\n"
            f"Tipo call: Sales\nDurata: {duration_min} min\n"
            f"Partecipanti: {', '.join(participants)}\n"
            f"Sintesi: {overview[:300]}"
        )
    except Exception as e:
        note_text = (
            f"[AUTO - Fireflies {datetime.now().strftime('%Y-%m-%d')}]\n"
            f"Chiamata: {title}\nDurata: {duration_min} min\n"
            f"Partecipanti: {', '.join(participants)}\n"
            f"Sintesi: {overview[:300]}\n"
            f"(Errore generazione nota dettagliata: {e})"
        )

    # ── Step 5: Salva la nota sul lead ──────────────────────────────────────
    try:
        headers = {"Content-Type": "application/json"}
        if internal_token:
            headers["Authorization"] = f"Bearer {internal_token}"
        async with _httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{gateway_url}/api/leads/{matched_lead['id']}/notes",
                json={"content": note_text},
                headers=headers,
            )
            if r.status_code in (200, 201):
                print(f"✅ Fireflies webhook: nota aggiunta al lead {matched_lead['id'][:8]}")
            else:
                print(f"⚠️ Fireflies webhook: errore aggiunta nota ({r.status_code}): {r.text[:200]}")
    except Exception as e:
        print(f"⚠️ Fireflies webhook: errore salvataggio nota: {e}")

    print(f"✅ Fireflies webhook completato per trascrizione '{title}'")


@app.post("/api/mcp/fireflies-webhook")
async def fireflies_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Riceve notifiche da Fireflies al completamento di una trascrizione.
    Verifica la firma HMAC (se FIREFLIES_WEBHOOK_SECRET è configurato),
    poi processa in background: classifica → match lead → aggiorna note.
    Risponde subito 200 per evitare retry da parte di Fireflies.
    """
    import hmac
    import hashlib

    # Verifica HMAC se il secret è configurato
    webhook_secret = os.environ.get("FIREFLIES_WEBHOOK_SECRET")
    if webhook_secret:
        signature_header = request.headers.get("X-Hub-Signature-256") or request.headers.get("X-Fireflies-Signature", "")
        body = await request.body()
        expected = "sha256=" + hmac.new(
            webhook_secret.encode(), body, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected, signature_header or ""):
            raise HTTPException(status_code=401, detail="Firma webhook non valida")
        payload = json.loads(body)
    else:
        payload = await request.json()

    transcript_id = (
        payload.get("transcriptId")
        or payload.get("transcript_id")
        or (payload.get("data") or {}).get("transcriptId")
    )

    if not transcript_id:
        return {"status": "ignored", "reason": "transcriptId mancante nel payload"}

    print(f"📨 Fireflies webhook ricevuto: transcriptId={transcript_id}")
    background_tasks.add_task(_process_fireflies_webhook, transcript_id)

    return {"status": "accepted", "transcriptId": transcript_id}

