# EvoMetrics - Sistema di Gestione Aziendale

Sistema completo di gestione aziendale con architettura microservizi, frontend React e integrazioni con Google Workspace, Shopify, e altri servizi esterni.

## 📋 Indice

- [Panoramica](#panoramica)
- [Architettura](#architettura)
- [Requisiti](#requisiti)
- [Installazione](#installazione)
- [Configurazione](#configurazione)
- [Avvio del Progetto](#avvio-del-progetto)
- [Struttura del Progetto](#struttura-del-progetto)
- [Servizi](#servizi)
- [Deployment](#deployment)

## 🎯 Panoramica

EvoMetrics è una piattaforma completa per la gestione di:
- **Clienti e Lead**: Gestione anagrafica, documenti, contratti e preventivi
- **Sales Pipeline**: Pipeline vendite personalizzabile con stage dinamici e drag-and-drop
- **Workflow Automatizzati**: Sistema di workflow builder per automatizzare task e processi
- **Productivity**: Gestione task, calendario Google, e sincronizzazione eventi
- **Assessments**: Valutazioni digitali e form di gradimento
- **Integrazioni**: Shopify, Google Drive, Google Calendar, SIBill, Email (Resend)

## 🏗️ Architettura

Il progetto utilizza un'architettura **microservizi unificata**:

- **Backend**: API Gateway FastAPI che carica dinamicamente tutti i microservizi
- **Frontend**: Applicazione React con Shopify Polaris UI
- **Database**: PostgreSQL (principale) + SQLite (sales-service)
- **Modalità**: Unified Mode - tutti i servizi in un unico processo Python

```
┌─────────────────┐
│   Frontend      │  React + Vite + Shopify Polaris
│   (Port 5173)   │
└────────┬────────┘
         │ HTTP
         ▼
┌─────────────────┐
│  API Gateway    │  FastAPI (Port 10000)
│  (Unified Mode) │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┬──────────┐
    │         │          │          │          │
┌───▼───┐ ┌──▼───┐ ┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│ Auth  │ │Sales │ │Clienti│ │Prod.  │ │ ...   │
│Service│ │Service│ │Service│ │Service│ │       │
└───────┘ └──────┘ └───────┘ └───────┘ └───────┘
```

## 📦 Requisiti

### Backend
- **Python**: 3.12+ (consigliato 3.12.7)
- **PostgreSQL**: 12+ (per database principale)
- **pip**: Gestore pacchetti Python

### Frontend
- **Node.js**: 18+ (consigliato 18.x o superiore)
- **npm**: 9+ (incluso con Node.js)

### Variabili d'Ambiente
Crea un file `.env` nella root del progetto con le seguenti variabili (vedi [Configurazione](#configurazione)):

```env
DATABASE_URL=postgresql://user:password@localhost:5432/dbname
SECRET_KEY=your-secret-key-here
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# ... altre variabili
```

## 🚀 Installazione

### 1. Clona il Repository

```bash
git clone <repository-url>
cd EvoMetrics
```

### 2. Setup Backend

```bash
# Vai nella directory dell'API Gateway
cd backend/api-gateway

# Crea un virtual environment
python -m venv venv

# Attiva il virtual environment
# Su macOS/Linux:
source venv/bin/activate
# Su Windows:
# venv\Scripts\activate

# Installa le dipendenze
pip install -r requirements.txt
```

### 3. Setup Frontend

```bash
# Dalla root del progetto, vai nella directory frontend
cd frontend-react

# Installa le dipendenze
npm install
```

## ⚙️ Configurazione

### File `.env`

Crea un file `.env` nella **root del progetto** con le seguenti variabili:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/evoluzione_imprese

# JWT Authentication
SECRET_KEY=your-super-secret-key-min-32-chars

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:10000/api/auth/google/callback

# URLs
FRONTEND_URL=http://localhost:5173
BASE_URL=http://localhost:10000

# Email (Resend)
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=noreply@yourdomain.com
RESEND_FROM_NAME=EvoMetrics

# Shopify (opzionale)
SHOPIFY_API_KEY=your-shopify-api-key
SHOPIFY_API_SECRET=your-shopify-api-secret
SHOPIFY_ENCRYPTION_KEY=your-encryption-key
SHOPIFY_SCOPES=read_orders,read_products,read_customers,read_analytics

# SIBill (opzionale)
SIBILL_API_URL=https://api.sibill.it
SIBILL_API_KEY=your-sibill-api-key
SIBILL_COMPANY_ID=your-company-id

# N8N Webhook (opzionale)
N8N_WEBHOOK_ASSESSMENT=your-n8n-webhook-url

# Modalità Unificata (sempre true in questo setup)
UNIFIED_MODE=true
```

### Database PostgreSQL

Assicurati che PostgreSQL sia in esecuzione e che il database esista:

```bash
# Crea il database
createdb evoluzione_imprese

# Oppure tramite psql
psql -U postgres
CREATE DATABASE evoluzione_imprese;
```

I microservizi creeranno automaticamente le tabelle necessarie all'avvio.

## 🏃 Avvio del Progetto

### Opzione 1: Sviluppo (Raccomandato)

#### Terminale 1 - Backend (API Gateway)

```bash
cd backend/api-gateway
source venv/bin/activate  # Su Windows: venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 10000 --reload
```

Il backend sarà disponibile su: `http://localhost:10000`

#### Terminale 2 - Frontend

```bash
cd frontend-react
npm run dev
```

Il frontend sarà disponibile su: `http://localhost:5173`

**Nota**: Il frontend in modalità sviluppo si connette automaticamente al backend su `http://localhost:10000`.

### Opzione 2: Produzione (Build)

#### 1. Build Frontend

```bash
cd frontend-react
npm run build
```

Questo creerà i file statici nella directory `frontend-react/dist/`.

#### 2. Avvia Backend (serve anche il frontend)

```bash
cd backend/api-gateway
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 10000
```

Il backend servirà automaticamente il frontend compilato su `http://localhost:10000`.

### Verifica Installazione

1. **Backend Health Check**: `http://localhost:10000/health`
2. **Frontend**: `http://localhost:5173` (dev) o `http://localhost:10000` (production)

## 📁 Struttura del Progetto

```
EvoMetrics/
├── backend/
│   ├── api-gateway/          # API Gateway unificato
│   │   ├── main.py           # Entry point principale
│   │   └── requirements.txt  # Dipendenze Python
│   ├── services/             # Microservizi
│   │   ├── auth-service/     # Autenticazione JWT/OAuth
│   │   ├── user-service/     # Gestione utenti
│   │   ├── sales-service/    # Sales Pipeline
│   │   ├── productivity-service/  # Workflow e Task
│   │   ├── calendar-service/ # Google Calendar
│   │   ├── clienti-service/  # Gestione clienti
│   │   ├── contratti-service/ # Contratti
│   │   ├── preventivi-service/ # Preventivi
│   │   ├── assessments-service/ # Assessments
│   │   ├── gradimento-service/ # Form gradimento
│   │   ├── pagamenti-service/ # Pagamenti
│   │   ├── email-service/    # Invio email
│   │   ├── shopify-service/   # Integrazione Shopify
│   │   ├── sibill-service/    # Integrazione SIBill
│   │   └── mcp-service/      # MCP integrations
│   ├── shared/               # Codice condiviso
│   │   └── internal_calls.py # Chiamate inter-servizio
│   └── README.md             # Documentazione backend
├── frontend-react/           # Frontend React
│   ├── src/
│   │   ├── pages/            # Pagine principali
│   │   ├── components/       # Componenti riutilizzabili
│   │   ├── services/        # API clients
│   │   └── utils/           # Utility
│   ├── package.json
│   └── vite.config.ts
├── .env                      # Variabili d'ambiente (da creare)
├── render.yaml               # Configurazione deployment Render.com
└── README.md                 # Questo file
```

## 🔧 Servizi

### Backend Services

| Servizio | Descrizione | Database |
|----------|-------------|----------|
| **auth-service** | Autenticazione JWT, OAuth Google | PostgreSQL |
| **user-service** | Gestione utenti, ruoli, permessi | PostgreSQL |
| **sales-service** | Sales Pipeline, leads, stage dinamici | SQLite |
| **productivity-service** | Workflow builder, task, automazioni | PostgreSQL |
| **calendar-service** | Integrazione Google Calendar | PostgreSQL |
| **clienti-service** | Gestione clienti, documenti Drive | PostgreSQL |
| **contratti-service** | Gestione contratti | PostgreSQL |
| **preventivi-service** | Gestione preventivi | PostgreSQL |
| **assessments-service** | Assessments digitali | PostgreSQL |
| **gradimento-service** | Form gradimento settimanale | PostgreSQL |
| **pagamenti-service** | Gestione pagamenti | PostgreSQL |
| **email-service** | Invio email (Resend) | - |
| **shopify-service** | Integrazione Shopify App | PostgreSQL |
| **sibill-service** | Integrazione SIBill fatturazione | PostgreSQL |
| **mcp-service** | MCP integrations | PostgreSQL |

### Frontend Pages

- **Sales Pipeline**: Gestione leads e pipeline vendite
- **Workflow Builder**: Creazione workflow automatizzati
- **Calendar**: Visualizzazione calendario Google
- **Clienti**: Gestione anagrafica clienti
- **Task Manager**: Gestione task e productivity
- **Assessments**: Valutazioni digitali
- **Shopify**: Integrazione Shopify

## 🚢 Deployment

Il progetto è configurato per il deployment su **Render.com** tramite `render.yaml`.

### Setup Render.com

1. Collega il repository GitHub a Render
2. Render creerà automaticamente:
   - 1 Web Service (API Gateway) - Porta 10000
   - 1 Database PostgreSQL

3. Configura le variabili d'ambiente in Render Dashboard

4. Il build command esegue:
   ```bash
   pip install -r requirements.txt && cd ../../frontend-react && npm install && npm run build
   ```

5. Il start command:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```

### Costi Stimati

- **Web Service**: ~7€/mese (Starter plan)
- **PostgreSQL Database**: ~7€/mese (Starter plan)
- **Totale**: ~14€/mese

## 📚 Documentazione Aggiuntiva

- [Backend README](backend/README.md) - Documentazione dettagliata backend
- [Auth Service README](backend/services/auth-service/README.md) - Documentazione auth service
- [User Service README](backend/services/user-service/README.md) - Documentazione user service

## 🐛 Troubleshooting

### Backend non si avvia

1. Verifica che PostgreSQL sia in esecuzione
2. Controlla che il file `.env` esista e contenga `DATABASE_URL`
3. Verifica che tutte le dipendenze siano installate: `pip install -r requirements.txt`

### Frontend non si connette al backend

1. Verifica che il backend sia in esecuzione su `http://localhost:10000`
2. Controlla la console del browser per errori CORS
3. Verifica che `FRONTEND_URL` in `.env` sia corretto

### Errori di import moduli

1. Assicurati di essere nella directory corretta (`backend/api-gateway`)
2. Verifica che il virtual environment sia attivo
3. Controlla che `UNIFIED_MODE=true` in `.env`

### Database connection errors

1. Verifica che PostgreSQL sia in esecuzione: `pg_isready`
2. Controlla le credenziali in `DATABASE_URL`
3. Verifica che il database esista: `psql -l | grep evoluzione_imprese`

## 📝 Note

- Il progetto usa **Unified Mode**: tutti i microservizi sono caricati dinamicamente nell'API Gateway
- Il frontend in sviluppo usa Vite dev server con proxy al backend
- In produzione, il backend serve i file statici del frontend compilato
- I servizi comunicano tramite chiamate dirette (unified mode) invece di HTTP

## 👥 Contribuire

1. Crea un branch per la feature: `git checkout -b feature/nome-feature`
2. Committa le modifiche: `git commit -m "Aggiunge feature X"`
3. Pusha il branch: `git push origin feature/nome-feature`
4. Apri una Pull Request

## 📄 Licenza

[Specifica la licenza del progetto]
