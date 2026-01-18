# 🔍 Report Audit Valori Hardcoded - EvoMetrics

**Data Audit**: 2026-01-18  
**Stato**: ⚠️ Trovati problemi critici e non critici

## 📊 Riepilogo

- **Problemi Critici**: 8
- **Problemi Medi**: 5
- **Problemi Minori**: 12
- **Valori Accettabili**: 15+

---

## 🔴 PROBLEMI CRITICI (Da Fixare Subito)

### 1. Frontend: Servizi API non usano apiConfig.ts

**File affetti:**
- `frontend-react/src/services/sibillApi.ts` - usa fallback hardcoded
- `frontend-react/src/services/shopifyApi.ts` - usa fallback hardcoded
- `frontend-react/src/services/preventiviApi.ts` - usa fallback hardcoded
- `frontend-react/src/services/pagamentiApi.ts` - usa fallback hardcoded
- `frontend-react/src/services/authApi.ts` - usa fallback hardcoded
- `frontend-react/src/services/clientiApi.ts` - alcune funzioni usano fallback hardcoded
- `frontend-react/src/pages/DrivePage.tsx` - usa fallback hardcoded

**Problema**: Inconsistenza, alcuni servizi usano `apiConfig.ts`, altri no.

**Fix**: Standardizzare tutti i servizi per usare `getServiceUrl()` da `apiConfig.ts`.

---

### 2. Backend: Fallback hardcoded DATABASE_URL

**File**: `backend/services/sibill-service/database.py:7`

```python
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://user:password@localhost/dbname")
```

**Problema**: Fallback hardcoded con credenziali di esempio.

**Fix**: Rimuovere fallback, rendere obbligatorio.

---

### 3. Backend: Dominio hardcoded nel codice

**File**: `backend/services/clienti-service/main.py:278,301`

```python
protocol = "https" if "evoluzioneimprese.com" in host or BASE_URL.startswith("https://") else "http"
```

**Problema**: Dominio hardcoded nel codice, non configurabile.

**Fix**: Usare solo `BASE_URL.startswith("https://")` o variabile `PRODUCTION_DOMAIN`.

---

### 4. Backend: Fallback localhost hardcoded

**File**: `backend/services/clienti-service/main.py:277,300`

```python
host = parsed.netloc or parsed.path.split('/')[0] if parsed.path else "localhost:10000"
```

**Problema**: Fallback hardcoded anche dopo fix precedente.

**Fix**: Usare BASE_URL senza fallback hardcoded.

---

### 5. Backend: Logica localhost hardcoded

**File**: `backend/services/shopify-service/main.py:261`

```python
if "localhost" in host or "127.0.0.1" in host:
```

**Problema**: Logica hardcoded per determinare ambiente.

**Fix**: Usare variabile `RENDER` o `ENVIRONMENT`.

---

## 🟡 PROBLEMI MEDI (Da Considerare)

### 6. Timeout HTTP hardcoded

**File**: 
- `backend/shared/internal_calls.py` - timeout=10.0
- `backend/services/calendar-service/main.py` - timeout=5.0, 10.0
- `backend/services/productivity-service/calendar_sync.py` - timeout=10.0
- `backend/services/sales-service/main.py` - timeout=5

**Problema**: Timeout non configurabili.

**Fix**: Aggiungere `HTTP_TIMEOUT` env var (default: 10.0).

---

### 7. Valori default stage pipeline hardcoded

**File**: `backend/services/sales-service/database.py:62-67`

**Problema**: Stage iniziali hardcoded nel seeding.

**Nota**: Accettabile per seeding iniziale, ma potrebbe essere configurabile.

---

### 8. Valori default lead hardcoded

**File**: `backend/services/sales-service/database.py:45,46`

```python
stage = Column(String, default="optin")
source = Column(String, default="manual")
```

**Problema**: Valori default hardcoded nel modello.

**Nota**: Accettabile, ma potrebbe essere configurabile.

---

### 9. Calendar default hardcoded

**File**: `backend/services/calendar-service/database.py:51`

```python
default_calendar_id TEXT DEFAULT 'primary'
```

**Problema**: "primary" hardcoded.

**Nota**: Standard Google Calendar, accettabile.

---

### 10. SMTP Port hardcoded

**File**: `env.example:99` (documentazione)

**Problema**: SMTP_PORT=587 hardcoded nella documentazione.

**Nota**: Standard, ma potrebbe essere configurabile.

---

## 🟢 PROBLEMI MINORI (Accettabili ma Documentabili)

### 11. Algoritmo JWT hardcoded

**File**: Tutti i servizi - `ALGORITHM = "HS256"`

**Nota**: Standard JWT, accettabile hardcoded.

---

### 12. Valori numerici hardcoded (non critici)

- `max_results: int = 250` (Google Calendar API)
- `limit: int = 250` (Shopify API)
- `page_size = 25` (SIBill API)
- `ACCESS_TOKEN_EXPIRE_MINUTES = 480` (JWT expiry)

**Nota**: Valori sensati, potrebbero essere configurabili ma non critici.

---

### 13. Permessi default hardcoded

**File**: `backend/services/user-service/main.py:44`

**Nota**: `DEFAULT_PERMISSIONS_BY_ROLE` hardcoded - accettabile per logica business.

---

## ✅ VALORI ACCETTABILI (Non Necessitano Fix)

- `ALGORITHM = "HS256"` - Standard JWT
- `SMTP_PORT = 587` - Standard SMTP
- `default="primary"` - Standard Google Calendar
- `default="optin"` - Business logic
- Timeout HTTP (potrebbero essere configurabili ma non critici)

---

## 🎯 Piano di Azione

### Priorità Alta (Fix Immediati)

1. ✅ Standardizzare tutti i servizi frontend per usare `apiConfig.ts`
2. ✅ Rimuovere fallback DATABASE_URL da sibill-service
3. ✅ Rimuovere dominio hardcoded da clienti-service
4. ✅ Rimuovere fallback localhost da clienti-service
5. ✅ Fix logica localhost in shopify-service

### Priorità Media (Miglioramenti)

6. ⚠️ Rendere timeout HTTP configurabili
7. ⚠️ Documentare valori default stage pipeline
8. ⚠️ Considerare configurabilità valori default lead

### Priorità Bassa (Documentazione)

9. 📝 Documentare valori accettabili hardcoded
10. 📝 Aggiornare SECURITY_GUIDELINES.md

---

## 📝 Note

- I valori standard (HS256, SMTP 587, etc.) sono accettabili hardcoded
- I valori di business logic (permessi, stage) possono essere hardcoded
- I valori di configurazione (URL, timeout, pool size) dovrebbero essere configurabili
- I valori sensibili (secrets, keys) NON devono mai essere hardcoded ✅
