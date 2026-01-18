# Setup Variabili d'Ambiente per Render.com

## 📋 Variabili da Aggiungere in Render.com

Vai nel dashboard Render.com → Il tuo servizio → Environment → Aggiungi le seguenti variabili:

### ⚠️ IMPORTANTE: Variabili Frontend (VITE_*)

Le variabili che iniziano con `VITE_` devono essere aggiunte **PRIMA del build** perché vengono sostituite durante la compilazione del frontend.

**Aggiungi queste variabili in Render.com:**

```bash
VITE_API_GATEWAY_URL=https://www.evoluzioneimprese.com
VITE_PORT=5173
VITE_API_URL=https://www.evoluzioneimprese.com
```

**Nota**: In produzione, `VITE_PORT` non è usato (il frontend è servito dal backend), ma è utile per sviluppo locale.

### 🔧 Variabili Backend (Opzionali ma Consigliate)

Queste variabili migliorano la configurabilità ma hanno fallback, quindi non sono obbligatorie:

```bash
# Database SQLite (opzionali, hanno default)
SALES_DATABASE_URL=sqlite:///./sales.db
CALENDAR_DATABASE_URL=sqlite:///./calendar.db

# Connection Pool (opzionali, default: min=1, max=3)
DB_POOL_MIN_SIZE=1
DB_POOL_MAX_SIZE=3

# Calendar Configuration (opzionali, hanno default)
DEFAULT_TIMEZONE=Europe/Rome
DEFAULT_NOTIFICATION_MINUTES=30

# Google OAuth URIs (opzionali, hanno fallback ai valori standard)
GOOGLE_AUTH_URI=https://accounts.google.com/o/oauth2/auth
GOOGLE_TOKEN_URI=https://oauth2.googleapis.com/token
GOOGLE_USERINFO_URI=https://www.googleapis.com/oauth2/v2/userinfo
GOOGLE_CALENDAR_SCOPES=https://www.googleapis.com/auth/calendar.events,https://www.googleapis.com/auth/calendar.readonly,https://www.googleapis.com/auth/userinfo.email

# Internal Service URLs (opzionali in unified mode, ma utili per fallback)
PREVENTIVI_SERVICE_URL=https://www.evoluzioneimprese.com
CONTRATTI_SERVICE_URL=https://www.evoluzioneimprese.com
CLIENTI_SERVICE_URL=https://www.evoluzioneimprese.com
PRODUCTIVITY_SERVICE_URL=https://www.evoluzioneimprese.com
USER_SERVICE_URL=https://www.evoluzioneimprese.com
GATEWAY_URL=https://www.evoluzioneimprese.com
EMAIL_SERVICE_URL=https://www.evoluzioneimprese.com
```

### ✅ Variabili Già Presenti (Verifica che siano corrette)

Queste dovrebbero già essere presenti nel tuo Render.com:

```bash
BASE_URL=https://www.evoluzioneimprese.com
FRONTEND_URL=https://www.evoluzioneimprese.com
UNIFIED_MODE=true
PORT=10000
DATABASE_URL=postgresql://...
SECRET_KEY=...
# ... tutte le altre che hai già
```

## 🚀 Passi per il Deploy

1. **Aggiungi le variabili VITE_*** in Render.com (IMPORTANTE!)
2. **Trigger un nuovo deploy** (Render ricostruirà il frontend con le nuove variabili)
3. **Verifica** che il frontend si connetta correttamente al backend

## 🧪 Test Locale

Per testare localmente, crea un file `.env` nella root del progetto con:

```bash
VITE_API_GATEWAY_URL=http://localhost:10000
VITE_PORT=5173
VITE_API_URL=http://localhost:10000
```

Poi avvia:
```bash
# Terminale 1 - Backend
cd backend/api-gateway
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 10000 --reload

# Terminale 2 - Frontend
cd frontend-react
npm run dev
```

## 📝 Note

- Le variabili `VITE_*` sono **sostituite al build time**, non al runtime
- In produzione, il frontend è servito dal backend, quindi `VITE_PORT` non è usato
- Le variabili backend senza `VITE_` sono usate solo dal backend Python
- In `UNIFIED_MODE=true`, i servizi comunicano direttamente, quindi gli URL interni sono usati solo come fallback
