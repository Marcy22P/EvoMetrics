# Backend - Architettura Microservizi

Struttura backend organizzata per microservizi con API Gateway centralizzato in **Unified Mode**.

## Architettura

Il backend utilizza un'architettura **microservizi unificata** dove tutti i servizi sono caricati dinamicamente nell'API Gateway. Questo permette di avere un unico processo Python che gestisce tutti i microservizi, riducendo i costi di deployment e semplificando la gestione.

## Struttura

```
backend/
├── api-gateway/           # API Gateway - Routing centralizzato e servizio frontend
│   ├── main.py            # Gateway principale con dynamic loading dei servizi
│   └── requirements.txt   # Dipendenze Python unificate
├── services/              # Microservizi
│   ├── auth-service/           # Autenticazione (JWT, OAuth Google)
│   ├── user-service/           # Gestione utenti e permessi
│   ├── sales-service/          # Sales Pipeline e gestione leads
│   ├── productivity-service/   # Workflow builder e task management
│   ├── calendar-service/       # Integrazione Google Calendar
│   ├── preventivi-service/     # Gestione preventivi
│   ├── gradimento-service/     # Form gradimento settimanale
│   ├── contratti-service/      # Gestione contratti
│   ├── pagamenti-service/      # Gestione pagamenti
│   ├── assessments-service/    # Assessment digitali
│   ├── clienti-service/        # Gestione clienti e magic links
│   ├── email-service/          # Invio email (Resend)
│   ├── shopify-service/        # Integrazione Shopify
│   ├── sibill-service/         # Integrazione SIBill fatturazione
│   └── mcp-service/            # MCP integrations
└── shared/                # Codice condiviso
    └── internal_calls.py  # Chiamate inter-servizio (unified mode)
```

## API Gateway

Il gateway centralizzato (`backend/api-gateway/`) serve:
- **Frontend React**: File statici compilati dalla directory `frontend-react/dist/`
- **Dynamic Service Loading**: Carica tutti i microservizi dinamicamente usando `importlib`
- **Unified Lifespan**: Gestisce startup/shutdown di tutti i servizi in modo coordinato
- **Health Check**: `/health` per monitoraggio

### Routing Automatico

Tutte le chiamate `/api/*` vengono automaticamente instradate ai microservizi:
- `/api/auth/*` → Auth Service
- `/api/users/*` → User Service
- `/api/sales/*` → Sales Service (pipeline, leads)
- `/api/pipeline/*` → Sales Service (stages)
- `/api/productivity/*` → Productivity Service (workflow, task)
- `/api/calendar/*` → Calendar Service
- `/api/preventivi/*` → Preventivi Service
- `/api/gradimento/*` → Gradimento Service
- `/api/contratti/*` → Contratti Service
- `/api/pagamenti/*` → Pagamenti Service
- `/api/assessments/*` → Assessments Service
- `/api/clienti/*` → Clienti Service
- `/api/shopify/*` → Shopify Service
- `/api/sibill/*` → SIBill Service
- `/api/hooks/*` → Productivity Service (webhook per workflow)
- `/webhook/clickfunnels` → Sales Service (webhook pubblico)
- `/webhook` → Assessments Service (webhook pubblico)

## Microservizi

In **Unified Mode**, tutti i microservizi sono caricati dinamicamente nell'API Gateway e comunicano tramite chiamate dirette (non HTTP). Questo riduce la latenza e semplifica il deployment.

### Configurazione

Ogni microservizio ha:
- `main.py`: Applicazione FastAPI con `app` export
- `database.py`: Connessione database (PostgreSQL o SQLite)
- `models.py`: Modelli Pydantic
- `requirements.txt`: Dipendenze Python (consolidate in api-gateway)

### Database

- **PostgreSQL**: Usato dalla maggior parte dei servizi (asyncpg)
- **SQLite**: Usato da `sales-service` per semplicità

### Servizi Principali

| Servizio | Descrizione | Database | Endpoint Base |
|----------|-------------|----------|---------------|
| **auth-service** | Autenticazione JWT, OAuth Google | PostgreSQL | `/api/auth` |
| **user-service** | Gestione utenti, ruoli, permessi | PostgreSQL | `/api/users` |
| **sales-service** | Sales Pipeline, leads, stage dinamici | SQLite | `/api/sales`, `/api/pipeline` |
| **productivity-service** | Workflow builder, task, automazioni | PostgreSQL | `/api/productivity`, `/api/hooks` |
| **calendar-service** | Integrazione Google Calendar | PostgreSQL | `/api/calendar` |
| **clienti-service** | Gestione clienti, documenti Drive | PostgreSQL | `/api/clienti` |
| **contratti-service** | Gestione contratti | PostgreSQL | `/api/contratti` |
| **preventivi-service** | Gestione preventivi | PostgreSQL | `/api/preventivi` |
| **assessments-service** | Assessments digitali | PostgreSQL | `/api/assessments` |
| **gradimento-service** | Form gradimento settimanale | PostgreSQL | `/api/gradimento` |
| **pagamenti-service** | Gestione pagamenti | PostgreSQL | `/api/pagamenti` |
| **email-service** | Invio email (Resend) | - | `/api/email` |
| **shopify-service** | Integrazione Shopify App | PostgreSQL | `/api/shopify` |
| **sibill-service** | Integrazione SIBill fatturazione | PostgreSQL | `/api/sibill` |
| **mcp-service** | MCP integrations | PostgreSQL | `/api/mcp` |

### Porte (Solo in Development Standalone)

In produzione, tutti i servizi sono unificati nell'API Gateway sulla porta `10000`. In sviluppo standalone (non raccomandato):

- API Gateway: `10000`
- Auth Service: `8001`
- User Service: `8002`
- Sales Service: `8003`
- Productivity Service: `8004`
- Calendar Service: `8005`
- Preventivi Service: `8006`
- Gradimento Service: `8007`
- Contratti Service: `8008`
- Pagamenti Service: `8009`
- Assessments Service: `8010`
- Clienti Service: `8011`
- Shopify Service: `8012`

## Avvio del Backend

### Prerequisiti

1. **PostgreSQL** in esecuzione
2. File `.env` nella root del progetto con `DATABASE_URL` e altre variabili
3. Virtual environment Python attivo

### Setup

```bash
# Dalla root del progetto
cd backend/api-gateway

# Crea virtual environment (se non esiste)
python -m venv venv

# Attiva virtual environment
source venv/bin/activate  # Su Windows: venv\Scripts\activate

# Installa dipendenze
pip install -r requirements.txt
```

### Avvio

```bash
# Modalità sviluppo (con reload automatico)
uvicorn main:app --host 0.0.0.0 --port 10000 --reload

# Modalità produzione
uvicorn main:app --host 0.0.0.0 --port 10000
```

Il backend sarà disponibile su `http://localhost:10000`

### Verifica

- Health Check: `http://localhost:10000/health`
- API Docs: `http://localhost:10000/docs` (Swagger UI)

## Dynamic Loading

L'API Gateway carica dinamicamente i microservizi usando `importlib.util`. Questo permette:

1. **Isolamento Moduli**: Ogni servizio ha il suo namespace per evitare conflitti
2. **Lazy Loading**: I servizi sono caricati solo quando necessario
3. **Unified Lifespan**: Startup/shutdown coordinati di tutti i servizi

### Gestione Conflitti

Il sistema gestisce automaticamente i conflitti di moduli comuni (es. `database`, `serializers`) tra servizi diversi usando:
- Manipolazione di `sys.modules` per isolare i moduli
- Gestione di `sys.path` per import corretti
- Cleanup automatico dopo il caricamento

## Deployment

Vedi `render.yaml` nella root del progetto per la configurazione completa su Render.com.

### Build Command

```bash
pip install -r requirements.txt && cd ../../frontend-react && npm install && npm run build
```

### Start Command

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### Costi Stimati

- **Web Service** (API Gateway): ~7€/mese (Starter plan)
- **PostgreSQL Database**: ~7€/mese (Starter plan)
- **Totale**: ~14€/mese

## Troubleshooting

### Errori di Import

Se vedi errori come `cannot import name 'database' from 'database'`:

1. Verifica che `UNIFIED_MODE=true` in `.env`
2. Controlla che tutti i servizi abbiano il loro `database.py` locale
3. Riavvia l'API Gateway

### Database Connection Errors

1. Verifica che PostgreSQL sia in esecuzione: `pg_isready`
2. Controlla `DATABASE_URL` in `.env`
3. Verifica che il database esista

### Module Loading Errors

1. Controlla i log dell'API Gateway per vedere quale servizio fallisce
2. Verifica che il servizio abbia un `main.py` con `app` export
3. Controlla che le dipendenze siano installate

