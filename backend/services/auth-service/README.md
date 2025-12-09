# Auth Service

Microservizio indipendente per autenticazione e autorizzazione.

## Funzionalità

- Login con username/password
- OAuth Google
- Validazione token JWT
- Endpoint `/api/auth/me` per info utente

## Setup

### 1. Installa dipendenze

```bash
cd services/auth-service
python -m venv venv
source venv/bin/activate  # Su Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configura variabili d'ambiente

Il servizio carica automaticamente il file `.env` dalla root del progetto.

Variabili richieste:
- `DATABASE_URL` - URL database PostgreSQL
- `SECRET_KEY` - Chiave segreta per JWT
- `GOOGLE_CLIENT_ID` - Client ID Google OAuth
- `GOOGLE_CLIENT_SECRET` - Client Secret Google OAuth
- `GOOGLE_REDIRECT_URI` - Redirect URI per OAuth callback
- `BASE_URL` - URL base backend
- `FRONTEND_URL` - URL frontend
- `AUTH_SERVICE_PORT` - Porta servizio (default: 8001)
- `CORS_ORIGINS` - Origini CORS consentite (opzionale)

### 3. Avvia il servizio

```bash
python main.py
```

Oppure con uvicorn:
```bash
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

## Endpoint

- `GET /health` - Health check
- `POST /api/auth/login` - Login username/password
- `GET /api/auth/google` - Inizia OAuth Google
- `GET /api/auth/google/callback` - Callback OAuth Google
- `GET /api/auth/validate-token` - Valida token JWT
- `GET /api/auth/me` - Info utente corrente

## Struttura

```
auth-service/
├── main.py           # FastAPI app e endpoint
├── auth.py           # Funzioni autenticazione (JWT, password)
├── database.py       # Connessione database
├── models.py         # Pydantic models
├── requirements.txt  # Dipendenze Python
└── README.md         # Questa documentazione
```

## Note

- Il servizio è completamente indipendente dal monolite
- Usa lo stesso database del monolite (fase transitoria)
- Carica le variabili d'ambiente dalla root del progetto

