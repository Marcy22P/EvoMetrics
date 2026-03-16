---
name: EvoAgent Conversations + Fireflies
overview: "Tre interventi: (1) fix del bug conversazioni passate — manca l'endpoint e il fetch frontend; (2) integrazione Fireflies via REST API diretta con tool interni di matching lead-trascrizione; (3) webhook Fireflies per automazione proattiva (classificazione chiamata, aggiornamento note lead, scheduling follow-up)."
todos:
  - id: fix-conv-backend
    content: "Backend: aggiungere GET /api/mcp/evo-agent/conversations/{id} che restituisce id, title, messages[], agent_id"
    status: completed
  - id: fix-conv-frontend
    content: "Frontend: sostituire onClick conversazione con openConversation() che fetcha i messaggi e li popola nello stato"
    status: completed
  - id: fix-memory
    content: "Backend: aggiungere agent_id ai messaggi salvati in agent_conversations.messages"
    status: completed
  - id: fireflies-tools
    content: "evo_agent.py: rimuovere MCP remoto Fireflies, aggiungere 4 tool interni GraphQL: search_transcripts, get_transcript, match_lead_to_transcripts, bulk_fetch_for_enrichment"
    status: completed
  - id: fireflies-webhook
    content: "Backend: nuovo endpoint POST /api/mcp/fireflies-webhook per automazione proattiva (classify → match lead → update notes → create follow-up task)"
    status: completed
isProject: false
---

# EvoAgent: Conversazioni + Fireflies Intelligence

## Stato attuale e diagnosi

```mermaid
flowchart TD
    subgraph bug [Bug conversazione]
        click["Click su conv. passata"] --> setId["setConvId(id)"]
        setId --> empty["setMessages([]) — chat vuota"]
        empty --> noFetch["Nessun fetch dei messaggi storici"]
    end
    subgraph missing [Cosa manca]
        noEndpoint["GET /conversations/:id — NON esiste nel backend"]
        noFetch2["loadConversation() — NON esiste nel frontend"]
    end
```



---

## Fix 1 — Bug conversazioni passate

**Backend** — `[backend/services/mcp-service/main.py](backend/services/mcp-service/main.py)`

Aggiungere endpoint:

```python
@app.get("/api/mcp/evo-agent/conversations/{conv_id}")
async def get_evo_agent_conversation(conv_id: str, request: Request, db: Session = Depends(get_db)):
    conversation = db.query(AgentConversation).filter(
        AgentConversation.id == conv_id,
        AgentConversation.user_id == user["id"]
    ).first()
    return {
        "id": conversation.id,
        "title": conversation.title,
        "messages": conversation.messages or [],
        "agent_id": ...,  # da messages[-1].agent_id se presente
        "updated_at": conversation.updated_at.isoformat(),
    }
```

**Frontend** — `[frontend-react/src/pages/EvoAgentPage.tsx](frontend-react/src/pages/EvoAgentPage.tsx)`

Sostituire l'onClick delle conversazioni (attualmente solo `setConvId + setMessages([])`):

```typescript
const openConversation = async (id: string) => {
  setConvId(id);
  setMessages([{ id: 'loading', role: 'assistant', content: '', isLoading: true }]);
  const data = await apiFetch(`/api/mcp/evo-agent/conversations/${id}`);
  // Mappa messages: {role, content} → Message[]
  setMessages(data.messages.map((m, i) => ({ id: `h${i}`, role: m.role, content: m.content })));
  if (data.agent_id) setActiveAgent(data.agent_id);
};
```

---

## Fix 2 — Memoria cross-conversazione (contesto persistente)

Attualmente il modello legge solo i messaggi della conversazione corrente. Il campo `agent_id` non viene salvato per messaggio nel DB.

- Aggiungere `agent_id` alla struttura messaggi salvati: `{role, content, agent_id, ts}`
- Il system prompt già include data/ora e utente — nessun cambio necessario
- Limite 50 messaggi per conversazione già implementato: ok

---

## Fix 3 — Fireflies: da MCP remoto a tool interno REST

Il server MCP `https://api.fireflies.ai/mcp` **non esiste** (confermato: connection reset). Fireflies espone solo una **GraphQL API** su `https://api.fireflies.ai/graphql`.

```mermaid
flowchart LR
    subgraph current [Attuale - non funziona]
        agent1[Sales Agent] -->|"mcp_toolset (beta)"| ff_mcp["https://api.fireflies.ai/mcp — 404"]
    end
    subgraph fixed [Proposto - tool interno]
        agent2[Sales Agent] -->|"tool: search_transcripts"| executor[ToolExecutor]
        executor -->|"POST GraphQL"| ff_gql["https://api.fireflies.ai/graphql"]
        ff_gql --> transcripts["trascrizioni + summaries"]
    end
```



**In `[backend/services/mcp-service/evo_agent.py](backend/services/mcp-service/evo_agent.py)`:**

Rimuovere `_AGENT_MCP_SERVERS` Fireflies e aggiungere 3 tool interni al `ToolExecutor`:

```python
# Tool 1: cerca trascrizioni per nome/azienda
async def search_fireflies_transcripts(self, query: str, limit: int = 5) -> str:
    # POST https://api.fireflies.ai/graphql con Authorization: Bearer FIREFLIES_API_KEY
    # Query GraphQL: transcripts(filter: {title: query}) → id, title, date, summary, sentences

# Tool 2: dettaglio trascrizione
async def get_fireflies_transcript(self, transcript_id: str) -> str:
    # Restituisce summary + action_items + key_topics

# Tool 3: match lead → trascrizione
async def match_lead_to_transcripts(self, lead_id: str) -> str:
    # Prende nome/azienda/email del lead da /api/leads
    # Cerca in Fireflies per nome + azienda
    # Restituisce le trascrizioni correlate con score di match
```

Aggiungere i tool alle definizioni `SALES_TOOLS` e `CLIENTS_TOOLS`.

---

## Fix 3b — Bulk enrichment: arricchimento storico lead da Fireflies

Per il backlog di trascrizioni esistenti, si aggiunge un quarto tool che aggrega tutto e lascia a Claude il matching.

**Flusso conversazionale:**

```mermaid
sequenceDiagram
    actor User
    participant Agent as Sales Agent (Claude)
    participant Tool as ToolExecutor
    participant FF as Fireflies GraphQL
    participant EVO as EvoMetrics API

    User->>Agent: "Arricchisci i lead con le trascrizioni Fireflies"
    Agent->>Tool: bulk_fetch_for_enrichment(limit=20)
    Tool->>FF: fetch ultimi N transcript (id, title, date, summary, participants)
    Tool->>EVO: GET /api/leads (nome, azienda, email, stage)
    Tool-->>Agent: {leads: [...], transcripts: [...]}
    Agent->>Agent: Ragiona sui match nome/azienda/email
    Agent-->>User: "Trovati questi match:\n- Mario Rossi → trascrizione del 10/03\n- Acme Srl → 2 call (05/03, 12/03)\n\nConfermi che scrivo le note?"
    User->>Agent: "Sì, procedi"
    Agent->>Tool: update_lead_notes(lead_id, notes)
    Tool->>EVO: PUT /api/leads/:id (aggiunge note strutturate)
    Agent-->>User: "Fatto. 8 lead aggiornati, 3 trascrizioni orfane."
```

**Quarto tool da aggiungere al `ToolExecutor`:**

```python
async def bulk_fetch_for_enrichment(self, limit: int = 20) -> str:
    # Fetcha in parallelo:
    # - ultimi N transcript da Fireflies (id, title, date, summary, participants[])
    # - tutti i lead da /api/leads (id, nome, cognome, azienda, email)
    # Restituisce JSON compatto con entrambi i set
    # Claude usa questo output per ragionare sul matching
```

**Limitazione rate limit Anthropic:** il tool restituisce max 20 trascrizioni + lead correlati per turno. Per pipeline più grandi, l'utente può chiedere "processa i successivi 20".

---

## Fix 4 — Webhook Fireflies: automazione proattiva

**Come funziona:** Fireflies invia una POST al nostro server non appena una trascrizione è pronta. Il payload contiene `transcriptId`. Da lì fetchtiamo i dettagli via GraphQL e processiamo automaticamente.

**Setup richiesto (una tantum):**

- In Fireflies → Settings → Webhooks → aggiungere `https://[render-url]/api/mcp/fireflies-webhook`
- Aggiungere `FIREFLIES_WEBHOOK_SECRET` nelle env var (stringa segreta per verificare le richieste)
- Funziona solo in produzione (Render) — in locale non è raggiungibile da Fireflies

```mermaid
flowchart TD
    call["Call completata"] --> ff["Fireflies trascrive"]
    ff -->|"POST {transcriptId}"| endpoint["POST /api/mcp/fireflies-webhook"]
    endpoint --> verify["Verifica HMAC signature"]
    verify --> fetch["Fetch trascrizione GraphQL"]
    fetch --> classify["Claude classifica: sales / ops / altro"]
    classify -->|"sales"| match["Cerca lead per nome + azienda + email"]
    match --> found{Lead trovato?}
    found -->|"Si, score > 0.7"| update["Aggiunge note strutturate al lead"]
    found -->|"No"| orphan["Salva come trascrizione orfana"]
    update --> stage["Valuta stage corretto dal contesto call"]
    stage --> followup["Crea task follow-up in productivity-service"]
    followup --> notify["Log su console + futuro Slack"]
```



Le note aggiunte al lead hanno questa struttura fissa:

```
[AUTO - Fireflies 2026-03-15]
Tipo call: Discovery / Demo / Follow-up
Durata: 32 min
Partecipanti: Mario Rossi (cliente), Paolo (AE)
Sintesi: [summary Fireflies]
Action items: [...lista]
Sentiment: positivo / neutro / negativo
```

**Nuovo endpoint** in `[backend/services/mcp-service/main.py](backend/services/mcp-service/main.py)`:

```python
@app.post("/api/mcp/fireflies-webhook")
async def fireflies_webhook(request: Request, background_tasks: BackgroundTasks):
    # 1. Verifica HMAC signature con FIREFLIES_WEBHOOK_SECRET
    # 2. Estrae transcriptId dal payload
    # 3. In background: fetch GraphQL → classifica → match lead → update notes + task
    return {"status": "accepted"}  # risponde subito 200, processo in background
```

Il processing avviene in `BackgroundTasks` per non tenere Fireflies in attesa (evita retry del webhook).

---

## File coinvolti

- `[backend/services/mcp-service/main.py](backend/services/mcp-service/main.py)` — Fix 1 (endpoint conv), Fix 4 (webhook)
- `[backend/services/mcp-service/evo_agent.py](backend/services/mcp-service/evo_agent.py)` — Fix 3 (tool interni Fireflies, rimozione MCP remoto)
- `[frontend-react/src/pages/EvoAgentPage.tsx](frontend-react/src/pages/EvoAgentPage.tsx)` — Fix 1 (openConversation), Fix 2 (agent_id nel messaggio)

