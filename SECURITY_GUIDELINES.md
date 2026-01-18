# Linee Guida Sicurezza - Variabili d'Ambiente

## 🔒 Variabili Critiche per Sicurezza (OBBLIGATORIE)

Queste variabili **NON devono mai avere default** e devono essere sempre configurate:

- `SECRET_KEY` - Chiave segreta JWT (obbligatoria, già gestita correttamente)
- `JWT_SECRET_KEY` - Chiave segreta JWT alternativa (obbligatoria)
- `GOOGLE_CLIENT_SECRET` - Secret OAuth Google (obbligatoria, già gestita)
- `SHOPIFY_API_SECRET` - Secret Shopify (obbligatoria)
- `SHOPIFY_ENCRYPTION_KEY` - Chiave crittografia Shopify (obbligatoria)
- `SIBILL_API_KEY` - API key SIBill (obbligatoria)
- `RESEND_API_KEY` - API key Resend (obbligatoria)
- `OPENAI_API_KEY` - API key OpenAI (obbligatoria)
- `SERVICE_TOKEN` - Token inter-servizio (obbligatoria)
- `ENCRYPTION_KEY` - Chiave crittografia generale (obbligatoria)

## ⚠️ Variabili Importanti (OBBLIGATORIE in Produzione)

Queste variabili sono obbligatorie in produzione ma possono avere default in sviluppo:

- `DATABASE_URL` - Database PostgreSQL principale (obbligatoria, già gestita)
- `BASE_URL` - URL base backend (obbligatoria, già gestita)
- `FRONTEND_URL` - URL frontend (obbligatoria, già gestita)

## 🔧 Variabili di Configurazione (Opzionali con Default Sensati)

Queste variabili hanno default per facilitare lo sviluppo locale, ma dovrebbero essere esplicite in produzione:

- `SALES_DATABASE_URL` - Database SQLite sales (default: `sqlite:///./sales.db`)
- `CALENDAR_DATABASE_URL` - Database SQLite calendar (default: path relativo)
- `DB_POOL_MIN_SIZE` - Connection pool minimo (default: 1)
- `DB_POOL_MAX_SIZE` - Connection pool massimo (default: 3)
- `DEFAULT_TIMEZONE` - Timezone default (default: `Europe/Rome`)
- `DEFAULT_NOTIFICATION_MINUTES` - Minuti notifica default (default: 30)
- `GOOGLE_AUTH_URI` - URI OAuth Google (default: standard Google)
- `GOOGLE_TOKEN_URI` - URI token Google (default: standard Google)
- `GOOGLE_USERINFO_URI` - URI userinfo Google (default: standard Google)
- `GOOGLE_CALENDAR_SCOPES` - Scopes OAuth (default: standard)

## 🛡️ Best Practices

1. **Mai hardcodare segreti**: Tutti i segreti devono essere in env vars
2. **Validazione produzione**: In produzione, tutte le variabili critiche devono essere validate
3. **Default solo per sviluppo**: I default devono essere usati solo in ambiente di sviluppo
4. **Documentazione**: Tutte le variabili devono essere documentate in `.env.example`
5. **Separazione dev/prod**: Usare `RENDER=true` o `ENVIRONMENT=production` per distinguere

## 📋 Checklist Pre-Deploy

- [ ] Tutte le variabili critiche sono configurate
- [ ] Nessun default hardcoded per segreti
- [ ] `.env.example` aggiornato senza valori reali
- [ ] Variabili sensibili non committate (verificare `.gitignore`)
- [ ] Secret manager configurato (Render.com Environment Variables)
