import asyncio
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional
import os
import json
import mcp.types as types
from mcp.server import Server
from mcp.server.sse import SseServerTransport
from starlette.routing import Mount, Route
from starlette.endpoints import HTTPEndpoint
from fastapi import FastAPI, Request, HTTPException, Depends
from pydantic import BaseModel
from openai import AsyncOpenAI
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, cast, String
from datetime import datetime, timedelta
from data import SERVIZI_CATALOG, PREVENTIVO_SCHEMA, EXPENSE_CATEGORIES
from database import SessionLocal, engine, Base
from models import ChatSession, ChatMessage, Assessment
import httpx
from bs4 import BeautifulSoup
import sys
import os
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

# Inizializzazione tabelle DB
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
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
            uri=types.AnyURI("preventivi://catalog"),
            name="Catalogo Servizi Evoluzione Imprese",
            description="Lista completa dei servizi offerti con descrizioni e ID",
            mimeType="application/json",
        ),
        types.Resource(
            uri=types.AnyURI("preventivi://schema"),
            name="Schema JSON Preventivo",
            description="Struttura JSON richiesta per creare un preventivo valido",
            mimeType="application/json",
        ),
        types.Resource(
            uri=types.AnyURI("spese://categorie"),
            name="Categorie di Spese Fiscali",
            description="Lista completa delle categorie di spese con regole di deducibilità secondo la normativa fiscale italiana",
            mimeType="application/json",
        ),
    ]

@mcp_server.read_resource()
async def handle_read_resource(uri: types.AnyURI) -> str | bytes:
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
