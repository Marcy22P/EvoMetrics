# Backend - Architettura Microservizi

Struttura backend organizzata per microservizi con API Gateway centralizzato.

## Struttura

```
backend/
├── api-gateway/      # API Gateway - Routing centralizzato e servizio frontend
│   ├── main.py       # Gateway principale con reverse proxy
│   └── requirements.txt
├── services/         # Microservizi
│   ├── auth-service/        # Autenticazione (JWT, OAuth Google)
│   ├── user-service/        # Gestione utenti e permessi
│   ├── preventivi-service/  # Gestione preventivi
│   ├── gradimento-service/  # Form gradimento settimanale
│   ├── contratti-service/  # Gestione contratti
│   ├── pagamenti-service/  # Gestione pagamenti
│   ├── assessments-service/ # Assessment digitali
│   ├── clienti-service/     # Gestione clienti e magic links
│   └── shopify-service/    # Integrazione Shopify
└── shared/           # Codice condiviso (deprecato, da rimuovere)
```

## API Gateway

Il gateway centralizzato (`backend/api-gateway/`) serve:
- **Frontend React**: File statici compilati
- **Reverse Proxy**: Routing automatico alle API dei microservizi
- **Health Check**: `/health` per monitoraggio

### Routing Automatico

Tutte le chiamate `/api/*` vengono automaticamente instradate ai microservizi:
- `/api/auth/*` → Auth Service
- `/api/users/*` → User Service
- `/api/preventivi/*` → Preventivi Service
- `/api/gradimento/*` → Gradimento Service
- `/api/contratti/*` → Contratti Service
- `/api/pagamenti/*` → Pagamenti Service
- `/api/assessments/*` → Assessments Service
- `/api/clienti/*` → Clienti Service
- `/api/shopify/*` → Shopify Service
- `/webhook` → Assessments Service (pubblico)

## Microservizi

Tutti i microservizi sono indipendenti e comunicano tramite HTTP REST API.

### Configurazione

Ogni microservizio ha:
- `main.py`: Applicazione FastAPI
- `database.py`: Connessione database
- `models.py`: Modelli Pydantic
- `requirements.txt`: Dipendenze Python

### Porte Locali (Development)

- API Gateway: `10000`
- Auth Service: `8001`
- User Service: `8002`
- Preventivi Service: `8003`
- Gradimento Service: `8004`
- Contratti Service: `8005`
- Pagamenti Service: `8006`
- Assessments Service: `8007`
- Clienti Service: `8008`
- Shopify Service: `8009`

## Deployment

Vedi `render.yaml` per la configurazione completa su Render.com.

**Costo**: 1 Web Service (API Gateway) = 7€/mese

