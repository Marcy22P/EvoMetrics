# User Service

Microservizio responsabile della gestione utenti e permessi.

## Funzionalità previste

- CRUD utenti (creazione, aggiornamento profilo, attivazione/disattivazione)
- Gestione permessi (`user_permissions`)
- Approvazione/rifiuto utenti pending (post Google OAuth)
- Endpoint profilo utente corrente

## Setup locale

```bash
cd backend/services/user-service
python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r requirements.txt
python main.py               # oppure uvicorn main:app
```

Il servizio carica il file `.env` nella root del progetto per variabili come:

- `DATABASE_URL`
- `CORS_ORIGINS`
- `USER_SERVICE_PORT` (default 8002)

## Stato attuale

Struttura FastAPI e endpoints placeholder.  
La logica reale (query su `users`, `user_permissions`, ecc.) verrà portata dal monolite passo passo.

## Prossimi passi

1. Copiare dal monolite le query `users` / `user_permissions`
2. Implementare endpoint `GET/POST/PATCH /users`
3. Implementare `GET/PUT /users/{id}/permissions`
4. Integrare il frontend (`AccountsManager`, `ProfileForm`, `useAuth`) con questo servizio

