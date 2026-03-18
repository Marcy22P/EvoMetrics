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
    context: Optional[str] = None   # contesto aggiuntivo (es. dati lead corrente, pagina aperta)


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
    try:
        result = await orchestrator.chat(
            message=payload.message,
            history=history,
            agent_id=payload.agent_id,
            context=payload.context,
        )
    except TypeError:
        # Fallback per versioni cached di EvoAgentOrchestrator senza i nuovi parametri
        result = await orchestrator.chat(
            message=payload.message,
            history=history,
        )

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


# ─── AI Insights (endpoint leggero — senza DB, senza conversazione) ──────────

@app.post("/api/mcp/ai-insights")
async def ai_insights(request: Request):
    """
    Endpoint dedicato agli AI Insight della Sales Pipeline.
    Chiama Claude direttamente — NON usa EvoAgentOrchestrator, NON crea
    record conversazione nel DB, NON inquina la lista chat di EvoAgent.
    """
    try:
        import anthropic as _anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="libreria anthropic non installata")

    api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("CLAUDE_API_KEY") or ""
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY non configurata")

    payload = await request.json()
    prompt = payload.get("prompt", "")
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt mancante")

    model = os.environ.get("CLAUDE_MODEL") or "claude-sonnet-4-6"

    client = _anthropic.AsyncAnthropic(api_key=api_key)
    response = await client.messages.create(
        model=model,
        max_tokens=1000,
        system=(
            "Sei un sales analyst esperto. Analizza i lead forniti e restituisci "
            "SOLO un JSON array (nessun testo prima o dopo) nel formato: "
            '[{"lead_id":"...","name":"...","text":"insight breve","action":"azione concreta"}]. '
            "Massimo 5 elementi. lead_id è i primi 8 caratteri dell'id. Lingua: italiano."
        ),
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text if response.content else ""
    return {"response": text}


# ─── AirCall REST helpers & endpoints ────────────────────────────────────────

_AIRCALL_BASE = "https://api.aircall.io/v1"


def _aircall_headers() -> dict:
    import base64
    api_key = os.environ.get("AIRCALL_API", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="AIRCALL_API non configurata")
    if ":" in api_key:
        encoded = base64.b64encode(api_key.encode()).decode()
    else:
        api_id = os.environ.get("AIRCALL_API_ID", "")
        if api_id:
            encoded = base64.b64encode(f"{api_id}:{api_key}".encode()).decode()
        else:
            return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "Accept": "application/json"}
    return {"Authorization": f"Basic {encoded}", "Content-Type": "application/json", "Accept": "application/json"}


async def _push_lead_to_aircall(lead: dict) -> dict:
    """Crea o aggiorna un contatto AirCall per il lead dato. Ritorna {'aircall_contact_id': str, 'action': 'created'|'linked'|'updated'}."""
    import httpx as _httpx
    _TIMEOUT = 8.0  # timeout ridotto per risposta rapida in caso di errori auth
    headers = _aircall_headers()
    fn    = (lead.get("first_name") or "").strip()
    ln    = (lead.get("last_name") or "").strip()
    nome  = f"{fn} {ln}".strip() or lead.get("azienda") or lead.get("email", "")
    phone = (lead.get("phone") or "").strip()
    email = (lead.get("email") or "").strip()
    lead_id = str(lead.get("id", ""))
    info  = (
        f"EvoMetrics-ID:{lead_id}\n"
        f"Azienda: {lead.get('azienda') or 'N/D'} | "
        f"Stage: {lead.get('stage')} | "
        f"Fonte: {lead.get('source_channel') or 'N/D'}"
    )

    async with _httpx.AsyncClient(timeout=_TIMEOUT) as c:
        # Il Bulk Sync chiama questa funzione solo per lead SENZA aircall_contact_id.
        # Per i lead già collegati usa Riconcilia.
        # Cerca prima un contatto esistente per telefono/email prima di crearne uno nuovo.
        found_id = None
        for val in [v for v in [phone, email] if v]:
            try:
                r = await c.get(f"{_AIRCALL_BASE}/contacts", headers=headers,
                                params={"search_query": val, "per_page": 1})
                if r.status_code == 200:
                    hits = r.json().get("contacts", [])
                    if hits:
                        found_id = str(hits[0]["id"])
                        break
            except Exception:
                pass

        if found_id:
            # Esiste già — collega e aggiorna information con EvoMetrics-ID
            try:
                await c.patch(f"{_AIRCALL_BASE}/contacts/{found_id}", headers=headers,
                              json={"information": info})
            except Exception:
                pass
            return {"aircall_contact_id": found_id, "action": "linked", "name": nome}

        # Nessun contatto trovato — crea nuovo contatto condiviso
        body: dict = {
            "first_name": fn or (nome.split()[0] if nome else ""),
            "last_name":  ln or (" ".join(nome.split()[1:]) if len(nome.split()) > 1 else ""),
            "information": info,
            "is_shared": True,   # visibile a tutti gli utenti dell'account
        }
        if phone:
            body["phone_numbers"] = [{"label": "Work", "value": phone}]
        if email:
            body["emails"] = [{"label": "Work", "value": email}]

        r = await c.post(f"{_AIRCALL_BASE}/contacts", headers=headers, json=body)
        r.raise_for_status()
        contact = r.json().get("contact", {})

    return {"aircall_contact_id": str(contact.get("id", "")), "action": "created", "name": nome}


def _internal_base_url() -> str:
    """URL interno del gateway (evita 403 da proxy Render su chiamate self-referenziali)."""
    _port = os.environ.get("PORT", "10000")
    return os.environ.get("INTERNAL_API_URL") or f"http://localhost:{_port}"


@app.post("/api/mcp/aircall/push-lead")
async def aircall_push_lead(request: Request):
    """Sincronizza un singolo lead come contatto AirCall e salva l'aircall_contact_id nel lead."""
    import httpx as _httpx
    payload = await request.json()
    lead_id = payload.get("lead_id")
    if not lead_id:
        raise HTTPException(status_code=400, detail="lead_id mancante")

    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    headers_sales = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    base = _internal_base_url()
    async with _httpx.AsyncClient(timeout=20.0) as c:
        # Recupera il lead
        r = await c.get(f"{base}/api/leads/{lead_id}", headers=headers_sales)
        if r.status_code != 200:
            raise HTTPException(status_code=404, detail=f"Lead {lead_id} non trovato")
        lead = r.json()

        # Push su AirCall
        result = await _push_lead_to_aircall(lead)
        aircall_contact_id = result["aircall_contact_id"]

        # Salva aircall_contact_id nel lead
        if aircall_contact_id:
            await c.put(
                f"{base}/api/leads/{lead_id}",
                headers=headers_sales,
                json={"aircall_contact_id": aircall_contact_id},
            )

    return {
        "success": True,
        "aircall_contact_id": aircall_contact_id,
        "action": result["action"],
        "name": result["name"],
        "message": f"Contatto '{result['name']}' {result['action']} su AirCall (ID: {aircall_contact_id})",
    }


@app.post("/api/mcp/aircall/bulk-push")
async def aircall_bulk_push(request: Request):
    """Sincronizza più lead come contatti AirCall. Se lead_ids è vuoto, sincronizza tutti i lead attivi."""
    import asyncio as _asyncio
    import httpx as _httpx
    payload = await request.json()
    lead_ids: list = payload.get("lead_ids", [])
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    headers_sales = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    # ── Test rapido autenticazione AirCall prima di processare i lead ──────────
    try:
        ac_headers = _aircall_headers()
        async with _httpx.AsyncClient(timeout=8.0) as _tc:
            _tr = await _tc.get(f"{_AIRCALL_BASE}/users", headers=ac_headers, params={"per_page": 1})
            if _tr.status_code == 401:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Autenticazione AirCall fallita (401). "
                        "Configura AIRCALL_API_ID e AIRCALL_API nel file .env "
                        "con il formato api_id:api_token oppure imposta entrambe le variabili separatamente."
                    ),
                )
    except HTTPException:
        raise
    except Exception as _e:
        raise HTTPException(status_code=503, detail=f"AirCall non raggiungibile: {_e}")

    base = _internal_base_url()
    async with _httpx.AsyncClient(timeout=30.0) as c:
        r = await c.get(f"{base}/api/leads", headers=headers_sales)
        r.raise_for_status()
        all_leads = r.json()

    ACTIVE = {"optin", "contattato", "prima_chiamata", "appuntamento_vivo_1",
              "seconda_chiamata", "appuntamento_vivo_2", "preventivo_consegnato"}
    if lead_ids:
        candidates = [l for l in all_leads if l["id"] in lead_ids or l["id"][:8] in lead_ids]
    else:
        candidates = [l for l in all_leads if l.get("stage") in ACTIVE]

    # Il Bulk Sync crea contatti SOLO per lead senza aircall_contact_id.
    # I lead già collegati vengono gestiti dalla Riconciliazione — evita
    # PATCH su ID potenzialmente stale e crea doppioni.
    leads = [l for l in candidates if not l.get("aircall_contact_id")]
    skipped_already_linked = len(candidates) - len(leads)
    if skipped_already_linked:
        print(f"ℹ️ {skipped_already_linked} lead già collegati ad AirCall — saltati (usa Riconcilia per aggiornarli)")

    # ── Elaborazione sequenziale con retry su 429 ─────────────────────────────
    # AirCall rate-limit: ~60 req/min — processiamo 1 alla volta con pausa breve.
    task_results = []
    for lead in leads:
        for attempt in range(3):
            try:
                result = await _push_lead_to_aircall(lead)
                aircall_id = result["aircall_contact_id"]
                if aircall_id and aircall_id != lead.get("aircall_contact_id"):
                    async with _httpx.AsyncClient(timeout=10.0) as c2:
                        await c2.put(
                            f"{base}/api/leads/{lead['id']}",
                            headers=headers_sales,
                            json={"aircall_contact_id": aircall_id},
                        )
                task_results.append({"ok": True, "lead_id": lead["id"], "name": result["name"],
                                     "aircall_contact_id": aircall_id, "action": result["action"]})
                await _asyncio.sleep(0.6)   # ~100 req/min max, stia sotto il limite
                break
            except Exception as e:
                err_str = str(e)
                if "429" in err_str and attempt < 2:
                    wait = 15 * (attempt + 1)
                    print(f"⏳ AirCall 429 — attendo {wait}s prima di riprovare lead {lead.get('id','')[:8]}")
                    await _asyncio.sleep(wait)
                else:
                    print(f"⚠️ AirCall bulk sync: errore per lead {lead.get('id','')[:8]}: {e}")
                    task_results.append({"ok": False, "lead_id": lead["id"], "error": err_str})
                    break

    synced = sum(1 for r in task_results if r.get("ok"))
    failed = sum(1 for r in task_results if not r.get("ok"))
    return {"synced": synced, "failed": failed, "total": len(leads), "results": task_results}


@app.get("/api/mcp/aircall/calls/{lead_id}")
async def aircall_get_lead_calls(lead_id: str, request: Request):
    """Recupera le chiamate AirCall per un lead (richiede aircall_contact_id)."""
    import httpx as _httpx
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    base  = _internal_base_url()

    async with _httpx.AsyncClient(timeout=15.0) as c:
        r = await c.get(f"{base}/api/leads/{lead_id}",
                        headers={"Authorization": f"Bearer {token}"})
        if r.status_code != 200:
            raise HTTPException(status_code=404, detail="Lead non trovato")
        lead = r.json()

    aircall_id = lead.get("aircall_contact_id")
    if not aircall_id:
        return {"calls": [], "message": "Lead non ancora sincronizzato con AirCall"}

    headers_ac = _aircall_headers()
    async with _httpx.AsyncClient(timeout=15.0) as c:
        r = await c.get(f"{_AIRCALL_BASE}/contacts/{aircall_id}/calls",
                        headers=headers_ac, params={"per_page": 20, "order": "desc"})
        r.raise_for_status()
        calls = r.json().get("calls", [])

    return {"calls": calls, "aircall_contact_id": aircall_id}


def _parse_evometrics_id(info_text: str) -> str | None:
    """Estrae EvoMetrics-ID dal campo information di un contatto AirCall."""
    if not info_text:
        return None
    for line in info_text.splitlines():
        if line.startswith("EvoMetrics-ID:"):
            return line.split(":", 1)[1].strip() or None
    return None


async def _find_lead_for_call(
    call: dict,
    all_leads: list,
    aircall_headers: dict,
) -> dict | None:
    """
    Lookup a 3 livelli per trovare il lead associato a una chiamata AirCall:
    1. aircall_contact_id diretto sul lead
    2. EvoMetrics-ID nel campo information del contatto AirCall
    3. Matching per numero di telefono
    """
    import httpx as _httpx
    import re as _re

    ac_cid   = str((call.get("contact") or {}).get("id", "")) or None
    raw_from = call.get("raw_digits") or call.get("from") or ""

    # Livello 1: aircall_contact_id già mappato
    if ac_cid:
        hit = next((l for l in all_leads if str(l.get("aircall_contact_id", "")) == ac_cid), None)
        if hit:
            return hit

    # Livello 2: EvoMetrics-ID nel campo information del contatto AirCall
    if ac_cid:
        try:
            async with _httpx.AsyncClient(timeout=8.0) as c:
                r = await c.get(f"{_AIRCALL_BASE}/contacts/{ac_cid}", headers=aircall_headers)
                if r.status_code == 200:
                    contact_info = r.json().get("contact", {}).get("information", "")
                    evo_id = _parse_evometrics_id(contact_info)
                    if evo_id:
                        hit = next((l for l in all_leads if l.get("id") == evo_id), None)
                        if hit:
                            return hit
        except Exception:
            pass

    # Livello 3: matching per numero di telefono (normalizza a solo cifre)
    if raw_from:
        digits = _re.sub(r"\D", "", raw_from)[-9:]  # ultimi 9 digit
        for lead in all_leads:
            lead_phone = _re.sub(r"\D", "", lead.get("phone") or "")
            if lead_phone and lead_phone.endswith(digits):
                return lead

    return None


async def _process_aircall_webhook(payload: dict) -> None:
    """
    Processa eventi AirCall (call.ended / call.completed):
    1. Identifica il lead con lookup a 3 livelli
    2. Aggiunge nota con metadata chiamata
    3. Se il lead non aveva aircall_contact_id, lo aggiorna
    """
    import httpx as _httpx
    data  = payload.get("data", {})
    call  = data.get("call") or data
    event = payload.get("event", "")

    if event not in ("call.ended", "call.completed") and "call" not in event:
        return

    call_id   = call.get("id")
    duration  = int(call.get("duration") or 0)
    recording = call.get("recording") or ""
    direction = call.get("direction", "?")
    status    = call.get("status", "?")
    agent     = (call.get("user") or {}).get("name") or "N/D"
    started   = call.get("started_at")
    ac_cid    = str((call.get("contact") or {}).get("id", "")) or None

    svc_token = os.environ.get("INTERNAL_SERVICE_TOKEN", "")
    if not svc_token:
        print("⚠️ AirCall webhook: INTERNAL_SERVICE_TOKEN mancante.")
        return

    base = _internal_base_url()
    headers_svc = {"Authorization": f"Bearer {svc_token}", "Content-Type": "application/json"}

    # Recupera tutti i lead per il matching
    async with _httpx.AsyncClient(timeout=15.0) as c:
        r = await c.get(f"{base}/api/leads", headers=headers_svc)
        if r.status_code != 200:
            print(f"⚠️ AirCall webhook: errore fetch leads: {r.status_code}")
            return
        all_leads = r.json()

    try:
        ac_headers = _aircall_headers()
    except Exception:
        ac_headers = {}

    matched_lead = await _find_lead_for_call(call, all_leads, ac_headers)
    if not matched_lead:
        print(f"ℹ️ AirCall webhook: nessun lead trovato per call_id={call_id} contact={ac_cid}")
        return

    # Aggiorna aircall_contact_id se mancava
    if ac_cid and not matched_lead.get("aircall_contact_id"):
        async with _httpx.AsyncClient(timeout=8.0) as c:
            await c.put(
                f"{base}/api/leads/{matched_lead['id']}",
                headers=headers_svc,
                json={"aircall_contact_id": ac_cid},
            )
        print(f"🔗 AirCall webhook: aircall_contact_id={ac_cid} salvato sul lead {matched_lead['id'][:8]}")

    import datetime as _dt
    date_str = _dt.datetime.fromtimestamp(started).strftime("%d/%m/%Y %H:%M") if started else "N/D"
    dur_str  = f"{duration // 60}m {duration % 60}s" if duration > 0 else "N/D"
    note_lines = [
        f"[AUTO - AirCall {date_str}]",
        f"Chiamata {direction} | Durata: {dur_str} | Status: {status} | Agente: {agent}",
    ]
    if recording:
        note_lines.append(f"Recording: {recording}")
    note_content = "\n".join(note_lines)

    async with _httpx.AsyncClient(timeout=15.0) as c:
        r = await c.post(
            f"{base}/api/leads/{matched_lead['id']}/notes",
            headers=headers_svc,
            json={"content": note_content},
        )
        if r.status_code in (200, 201):
            print(f"✅ AirCall webhook: nota aggiunta al lead {matched_lead['id'][:8]} (call {call_id})")
        else:
            print(f"⚠️ AirCall webhook: errore nota ({r.status_code}): {r.text[:200]}")


@app.post("/api/mcp/aircall/dial")
async def aircall_dial(request: Request):
    """
    Click-to-call: riempie l'app AirCall dell'agente con il numero del lead pronto da chiamare.
    Richiede AIRCALL_USER_ID nell'env (ID utente AirCall del commerciale).
    Se non configurato, usa il primo utente disponibile sull'account.
    """
    import httpx as _httpx
    payload = await request.json()
    lead_id = payload.get("lead_id")
    if not lead_id:
        raise HTTPException(status_code=400, detail="lead_id mancante")

    token    = request.headers.get("Authorization", "").replace("Bearer ", "")
    base     = _internal_base_url()
    h_svc    = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    h_ac     = _aircall_headers()

    # Recupera dati lead
    async with _httpx.AsyncClient(timeout=10.0) as c:
        r = await c.get(f"{base}/api/leads/{lead_id}", headers=h_svc)
        if r.status_code != 200:
            raise HTTPException(status_code=404, detail="Lead non trovato")
        lead = r.json()

    phone = (lead.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=422, detail="Il lead non ha un numero di telefono")

    # Risolvi aircall_user_id
    aircall_user_id = os.environ.get("AIRCALL_USER_ID", "").strip()
    if not aircall_user_id:
        async with _httpx.AsyncClient(timeout=8.0) as c:
            r = await c.get(f"{_AIRCALL_BASE}/users", headers=h_ac, params={"per_page": 1})
            if r.status_code != 200:
                raise HTTPException(status_code=503, detail=f"Impossibile ottenere utenti AirCall: {r.status_code}")
            users = r.json().get("users", [])
            if not users:
                raise HTTPException(status_code=503, detail="Nessun utente AirCall trovato")
            aircall_user_id = str(users[0]["id"])

    # Chiama POST /v1/users/{id}/dial → apre il telefono AirCall con il numero pre-compilato
    async with _httpx.AsyncClient(timeout=10.0) as c:
        r = await c.post(
            f"{_AIRCALL_BASE}/users/{aircall_user_id}/dial",
            headers=h_ac,
            json={"to": phone},
        )
        if r.status_code not in (200, 201):
            raise HTTPException(
                status_code=502,
                detail=f"AirCall dial fallito ({r.status_code}): {r.text[:200]}",
            )

    nome = f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip() or lead.get("azienda") or lead.get("email")
    return {"success": True, "phone": phone, "aircall_user_id": aircall_user_id, "lead_name": nome}


@app.post("/api/mcp/aircall/reconcile")
async def aircall_reconcile(request: Request):
    """
    Riconciliazione one-shot: collega i lead EvoMetrics ai contatti AirCall già esistenti.
    - Scarica tutti i contatti AirCall (paginati)
    - Per ogni contatto: cerca un lead per phone/email
    - Se trovato: aggiorna lead.aircall_contact_id + aggiorna information del contatto con EvoMetrics-ID
    Utile dopo un'importazione manuale su AirCall.
    """
    import httpx as _httpx
    import re as _re

    token    = request.headers.get("Authorization", "").replace("Bearer ", "")
    base     = _internal_base_url()
    h_svc    = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    h_ac     = _aircall_headers()

    # ── Pre-flight: verifica auth AirCall ─────────────────────────────────────
    try:
        async with _httpx.AsyncClient(timeout=8.0) as _tc:
            _tr = await _tc.get(f"{_AIRCALL_BASE}/users", headers=h_ac, params={"per_page": 1})
            if _tr.status_code == 401:
                raise HTTPException(
                    status_code=503,
                    detail=(
                        "Autenticazione AirCall fallita (401). "
                        "Aggiungi AIRCALL_API_ID nel file .env con il tuo API ID "
                        "(reperibile su AirCall → Impostazioni → Integrazioni → API Keys)."
                    ),
                )
    except HTTPException:
        raise
    except Exception as _e:
        raise HTTPException(status_code=503, detail=f"AirCall non raggiungibile: {_e}")

    # ── STEP 1: scarica TUTTI i contatti AirCall (fonte di verità per i numeri) ──
    # Strategia combinata: usa next_page_link quando presente, ma verifica anche
    # meta.total come fallback perché AirCall a volte restituisce next_page_link=null
    # prima di aver paginato tutti i contatti (bug noto in certi account).
    print("🔄 Riconciliazione: scarico tutti i contatti AirCall...")
    all_ac_contacts: list[dict] = []
    PER_PAGE = 50
    page = 1
    total_reported = 0
    async with _httpx.AsyncClient(timeout=30.0) as c:
        while True:
            r = await c.get(f"{_AIRCALL_BASE}/contacts", headers=h_ac,
                            params={"per_page": PER_PAGE, "page": page})
            if r.status_code != 200:
                raise HTTPException(status_code=502,
                                    detail=f"AirCall /contacts: HTTP {r.status_code} — {r.text[:200]}")
            data = r.json()
            batch = data.get("contacts", [])
            if not batch:
                break
            all_ac_contacts.extend(batch)
            meta = data.get("meta", {})
            total_reported = int(meta.get("total", total_reported) or total_reported)
            next_url = meta.get("next_page_link") or None
            print(f"   pagina {page} — {len(all_ac_contacts)}/{total_reported} contatti scaricati")
            # Interrompi se: batch incompleto, O non ci sono altri contatti da scaricare
            if len(batch) < PER_PAGE:
                break
            if total_reported and len(all_ac_contacts) >= total_reported:
                break
            # Se next_page_link è null ma il totale è superiore ai contatti ottenuti,
            # forziamo la pagina successiva (bug AirCall con next_page_link prematuro)
            page += 1

    print(f"✅ Totale contatti AirCall: {len(all_ac_contacts)}")

    # ── STEP 2: costruisci mappa phone → contact e email → contact (da AirCall) ──
    ac_phone_map: dict[str, dict] = {}   # ultimi 9 digit → contact
    ac_email_map: dict[str, dict] = {}   # email lower → contact
    for contact in all_ac_contacts:
        for pn in contact.get("phone_numbers", []):
            raw = pn.get("value", "")
            digits = _re.sub(r"\D", "", raw)[-9:]
            if digits and digits not in ac_phone_map:
                ac_phone_map[digits] = contact
        for em in contact.get("emails", []):
            key = em.get("value", "").lower().strip()
            if key and key not in ac_email_map:
                ac_email_map[key] = contact

    # Set di tutti gli ID AirCall validi — usato per rilevare ID stale sui lead
    ac_id_set: set[str] = {str(c["id"]) for c in all_ac_contacts}
    print(f"   Numeri unici indicizzati: {len(ac_phone_map)} | Email: {len(ac_email_map)}")

    # ── STEP 3: scarica tutti i lead EvoMetrics ───────────────────────────────
    async with _httpx.AsyncClient(timeout=30.0) as c:
        r = await c.get(f"{base}/api/leads", headers=h_svc)
        r.raise_for_status()
        all_leads = r.json()

    print(f"   Lead EvoMetrics: {len(all_leads)}")

    # ── STEP 4: per ogni lead cerca il contatto AirCall corrispondente ─────────
    matched = 0
    cleared = 0
    already_ok = 0
    updated_info = 0
    matched_lead_ids: set[str] = set()

    async with _httpx.AsyncClient(timeout=15.0) as c:
        for lead in all_leads:
            lead_id_val = lead["id"]
            lead_phone  = _re.sub(r"\D", "", lead.get("phone") or "")[-9:]
            lead_email  = (lead.get("email") or "").lower().strip()
            current_ac_id = str(lead.get("aircall_contact_id") or "")

            # Cerca contatto AirCall: prima per telefono, poi per email
            contact_match: dict | None = None
            if lead_phone and lead_phone in ac_phone_map:
                contact_match = ac_phone_map[lead_phone]
            elif lead_email and lead_email in ac_email_map:
                contact_match = ac_email_map[lead_email]

            # Se il lead ha un ID non presente in AirCall, è stale → pulisci prima di tutto
            if current_ac_id and current_ac_id not in ac_id_set:
                await c.put(
                    f"{base}/api/leads/{lead_id_val}",
                    headers=h_svc,
                    json={"aircall_contact_id": None},
                )
                cleared += 1
                print(f"   🧹 Lead {lead_id_val[:8]}: ID stale {current_ac_id} rimosso (non esiste in AirCall)")
                current_ac_id = ""   # reset per eventuale match sottostante

            if contact_match:
                ac_id = str(contact_match.get("id", ""))
                matched_lead_ids.add(lead_id_val)

                if current_ac_id == ac_id:
                    already_ok += 1
                else:
                    # Aggiorna aircall_contact_id sul lead (overwrite stale/vuoto)
                    await c.put(
                        f"{base}/api/leads/{lead_id_val}",
                        headers=h_svc,
                        json={"aircall_contact_id": ac_id},
                    )
                    matched += 1
                    print(f"   🔗 Lead {lead_id_val[:8]} ↔ AC {ac_id} (era: {current_ac_id or 'nessuno'})")

                # Aggiorna information del contatto AirCall con EvoMetrics-ID (se mancante)
                ac_info = contact_match.get("information", "") or ""
                if not _parse_evometrics_id(ac_info):
                    new_info = f"EvoMetrics-ID:{lead_id_val}\n{ac_info}".strip()
                    r2 = await c.patch(
                        f"{_AIRCALL_BASE}/contacts/{ac_id}",
                        headers=h_ac,
                        json={"information": new_info},
                    )
                    if r2.status_code in (200, 201):
                        updated_info += 1

            elif not current_ac_id:
                # Nessun match per telefono/email e nessun ID → candidato per il Bulk Sync
                pass

    total_matched = matched + already_ok
    print(f"\n✅ Riconciliazione completata:")
    print(f"   {total_matched} lead collegati ({already_ok} già corretti, {matched} aggiornati)")
    print(f"   {cleared} lead con ID stale ripuliti")
    print(f"   {updated_info} contatti AirCall aggiornati con EvoMetrics-ID")
    print(f"   {len(all_leads) - total_matched - cleared} lead senza corrispondenza AirCall (verranno creati al prossimo Sync)")

    return {
        "matched": total_matched,
        "updated": matched,
        "already_correct": already_ok,
        "cleared_stale": cleared,
        "unmatched": len(all_leads) - total_matched - cleared,
        "updated_aircall_info": updated_info,
        "message": (
            f"Riconciliazione completata: {total_matched} lead collegati ad AirCall "
            f"({matched} aggiornati, {already_ok} già corretti), "
            f"{cleared} ID stale puliti, "
            f"{len(all_leads) - total_matched - cleared} lead senza corrispondenza "
            f"(usa Sync per crearli)."
        ),
    }


@app.post("/api/mcp/aircall-webhook")
async def aircall_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Riceve eventi da AirCall (call.ended, call.completed).
    Risponde subito 200; processa in background: identifica il lead e aggiunge nota con metadata chiamata.
    """
    import hmac, hashlib
    webhook_token = os.environ.get("AIRCALL_WEBHOOK_TOKEN", "")
    raw_body = await request.body()

    if webhook_token:
        # AirCall usa token nel payload (non HMAC signature)
        try:
            payload = json.loads(raw_body)
            if payload.get("token") != webhook_token:
                raise HTTPException(status_code=401, detail="Token webhook AirCall non valido")
        except (json.JSONDecodeError, KeyError):
            raise HTTPException(status_code=400, detail="Payload non valido")
    else:
        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Payload non valido")

    event = payload.get("event", "")
    print(f"📨 AirCall webhook ricevuto: event={event}")
    background_tasks.add_task(_process_aircall_webhook, payload)
    return {"status": "accepted", "event": event}


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


# ── Calendly OAuth ────────────────────────────────────────────────────────────

_CALENDLY_AUTH_URL  = "https://auth.calendly.com/oauth/authorize"
_CALENDLY_TOKEN_URL = "https://auth.calendly.com/oauth/token"
_CALENDLY_API_BASE  = "https://api.calendly.com"


def _get_calendly_token_from_db() -> Optional[dict]:
    """Recupera il token Calendly salvato nel DB."""
    from models import OAuthToken
    db = SessionLocal()
    try:
        record = db.query(OAuthToken).filter(OAuthToken.provider == "calendly").order_by(OAuthToken.updated_at.desc()).first()
        if not record:
            return None
        return {
            "access_token": record.access_token,
            "refresh_token": record.refresh_token,
            "expires_at": record.expires_at,
            "account_id": record.account_id,
        }
    finally:
        db.close()


def _save_calendly_token(access_token: str, refresh_token: Optional[str], expires_in: Optional[int], account_id: Optional[str] = None):
    """Salva o aggiorna il token Calendly nel DB."""
    from models import OAuthToken
    db = SessionLocal()
    try:
        expires_at = None
        if expires_in:
            expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
        record = db.query(OAuthToken).filter(OAuthToken.provider == "calendly").first()
        if record:
            record.access_token = access_token
            record.refresh_token = refresh_token or record.refresh_token
            record.expires_at = expires_at
            if account_id:
                record.account_id = account_id
        else:
            record = OAuthToken(
                provider="calendly",
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=expires_at,
                account_id=account_id,
            )
            db.add(record)
        db.commit()
    finally:
        db.close()


async def _get_valid_calendly_token() -> str:
    """
    Ritorna un access token Calendly valido.
    Se scaduto e c'è refresh_token, lo rinnova automaticamente.
    Fallback: usa CALENDLY_API_TOKEN dall'env (Personal Access Token).
    """
    # Prima prova il PAT da env (più semplice, ha precedenza se configurato)
    pat = os.environ.get("CALENDLY_API_TOKEN", "").strip()
    if pat:
        return pat

    token_data = _get_calendly_token_from_db()
    if not token_data:
        raise HTTPException(status_code=401, detail="Calendly non connesso. Vai su /api/mcp/calendly/connect per autorizzare.")

    # Controlla scadenza (con 5 minuti di margine)
    if token_data.get("expires_at") and token_data["expires_at"] < datetime.utcnow() + timedelta(minutes=5):
        # Prova refresh
        refresh_token = token_data.get("refresh_token")
        if not refresh_token:
            raise HTTPException(status_code=401, detail="Token Calendly scaduto. Ri-autorizza su /api/mcp/calendly/connect.")
        client_id     = os.environ.get("CALENDLY_CLIENT_ID", "")
        client_secret = os.environ.get("CALENDLY_CLIENT_SECRET", "")
        async with httpx.AsyncClient() as c:
            r = await c.post(_CALENDLY_TOKEN_URL, data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
                "client_secret": client_secret,
            })
        if r.status_code != 200:
            raise HTTPException(status_code=401, detail=f"Refresh token Calendly fallito: {r.text}")
        resp = r.json()
        _save_calendly_token(
            access_token=resp["access_token"],
            refresh_token=resp.get("refresh_token", refresh_token),
            expires_in=resp.get("expires_in"),
        )
        return resp["access_token"]

    return token_data["access_token"]


@app.get("/api/mcp/calendly/connect")
async def calendly_connect(request: Request):
    """Avvia il flusso OAuth con Calendly. Reindirizza l'utente alla pagina di autorizzazione."""
    client_id    = os.environ.get("CALENDLY_CLIENT_ID", "")
    redirect_uri = os.environ.get("CALENDLY_REDIRECT_URI", "https://www.evoluzioneimprese.com/api/mcp/calendly/callback")
    if not client_id:
        raise HTTPException(status_code=500, detail="CALENDLY_CLIENT_ID non configurato nel server.")
    from urllib.parse import urlencode
    from starlette.responses import RedirectResponse
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
    }
    auth_url = f"{_CALENDLY_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url=auth_url)


@app.get("/api/mcp/calendly/callback")
async def calendly_callback(request: Request, code: Optional[str] = None, error: Optional[str] = None):
    """Gestisce il callback OAuth di Calendly, scambia il code per i token e li salva."""
    from starlette.responses import HTMLResponse
    frontend_url = os.environ.get("FRONTEND_URL", "https://www.evoluzioneimprese.com")

    if error:
        return HTMLResponse(
            f"""<html><body><script>
            window.opener && window.opener.postMessage({{type:'calendly_oauth',success:false,error:'{error}'}}, '*');
            window.close();
            </script><p>Autorizzazione Calendly negata: {error}</p></body></html>"""
        )
    if not code:
        raise HTTPException(status_code=400, detail="Parametro 'code' mancante nel callback.")

    client_id     = os.environ.get("CALENDLY_CLIENT_ID", "")
    client_secret = os.environ.get("CALENDLY_CLIENT_SECRET", "")
    redirect_uri  = os.environ.get("CALENDLY_REDIRECT_URI", "https://www.evoluzioneimprese.com/api/mcp/calendly/callback")

    # Scambio code → tokens
    async with httpx.AsyncClient() as c:
        r = await c.post(_CALENDLY_TOKEN_URL, data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "client_secret": client_secret,
        })

    if r.status_code != 200:
        return HTMLResponse(
            f"""<html><body><script>
            window.opener && window.opener.postMessage({{type:'calendly_oauth',success:false,error:'token_exchange_failed'}}, '*');
            window.close();
            </script><p>Errore scambio token: {r.text}</p></body></html>"""
        )

    resp = r.json()
    access_token  = resp.get("access_token", "")
    refresh_token = resp.get("refresh_token")
    expires_in    = resp.get("expires_in")
    owner_uri     = resp.get("owner", "")

    _save_calendly_token(access_token, refresh_token, expires_in, account_id=owner_uri)
    print(f"✅ Calendly OAuth completato — account: {owner_uri}")

    return HTMLResponse(
        f"""<html><body><script>
        window.opener && window.opener.postMessage({{type:'calendly_oauth',success:true}}, '*');
        window.close();
        </script>
        <p>✅ Calendly connesso con successo! Puoi chiudere questa finestra.</p>
        </body></html>"""
    )


@app.get("/api/mcp/calendly/status")
async def calendly_status():
    """Controlla se Calendly è connesso e ritorna info account."""
    # Prova con PAT
    pat = os.environ.get("CALENDLY_API_TOKEN", "").strip()
    token = pat if pat else None

    if not token:
        token_data = _get_calendly_token_from_db()
        if token_data:
            token = token_data["access_token"]

    if not token:
        return {"connected": False, "method": None}

    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(f"{_CALENDLY_API_BASE}/users/me", headers={"Authorization": f"Bearer {token}"})
        if r.status_code == 200:
            user = r.json().get("resource", {})
            return {
                "connected": True,
                "method": "pat" if pat else "oauth",
                "name": user.get("name"),
                "email": user.get("email"),
                "scheduling_url": user.get("scheduling_url"),
                "account_uri": user.get("uri"),
            }
    except Exception:
        pass
    return {"connected": False, "method": None}

