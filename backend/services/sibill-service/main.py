from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks
from contextlib import asynccontextmanager
from typing import List, Dict, Any, Optional
import os
import json
from datetime import datetime, timedelta

from database import database, init_database, close_database
from models import SyncRequest, ContoSummaryResponse, SibillAccountData, SibillTransactionData, SibillTransactionResponse, ReconciliationItem, MatchDetail, ExpenseItem, ExpenseCategory
from client import SibillClient
from categorizer import categorize_transaction, get_category_info
# Import lazy o locale per evitare cicli se necessario, ma qui dovrebbe andare bene
# Nota: ai_categorizer importa database, quindi ok.


# --- Database Schema ---
async def create_tables():
    # Tabella Conti Bancari
    await database.execute("""
    CREATE TABLE IF NOT EXISTS sibill_accounts (
        id TEXT PRIMARY KEY, -- sibill_id
        name TEXT NOT NULL,
        iban TEXT,
        balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
        currency TEXT DEFAULT 'EUR',
        last_sync TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Tabella Transazioni (RAW - Mirror di Sibill)
    await database.execute("""
    CREATE TABLE IF NOT EXISTS sibill_transactions (
        id TEXT PRIMARY KEY, -- sibill_id
        account_id TEXT NOT NULL,
        date TIMESTAMP NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        description TEXT,
        category TEXT,
        direction TEXT CHECK (direction IN ('in', 'out')),
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES sibill_accounts(id)
    );
    """)

    # Tabella Ledger Finanziario (PROPRIETARY - Categorizzato da Agenti)
    # Questa tabella è la "Golden Source" per le analisi e il frontend.
    # Viene popolata inizialmente copiando i dati grezzi, poi arricchita dagli agenti.
    await database.execute("""
    CREATE TABLE IF NOT EXISTS finance_ledger (
        id TEXT PRIMARY KEY, -- source_id (sibill_id)
        source_id TEXT NOT NULL, -- riferimento a sibill_transactions
        date TIMESTAMP NOT NULL,
        amount DECIMAL(12, 2) NOT NULL,
        description TEXT,
        
        -- Campi Proprietari (Agentic)
        category_key TEXT, -- Chiave categoria interna (es. 'software_licenze')
        confidence_score DECIMAL(5, 2) DEFAULT 0,
        agent_reasoning TEXT,
        verification_status TEXT DEFAULT 'NEW', -- NEW, PROCESSED, VERIFIED, FLAGGED
        
        last_agent_update TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES sibill_transactions(id)
    );
    """)

    # Migrazione per popolare finance_ledger se vuota (per chi ha già dati)
    # Copia solo le USCITE (OUT) perché categorizziamo quelle
    try:
        await database.execute("""
            INSERT INTO finance_ledger (id, source_id, date, amount, description, created_at)
            SELECT id, id, date, amount, description, created_at
            FROM sibill_transactions
            WHERE direction = 'out'
            ON CONFLICT (id) DO NOTHING;
        """)
    except Exception as e:
        print(f"⚠️ Errore auto-popolamento ledger: {e}")

    # Tabella Fatture (per IVA e Bilancio)
    await database.execute("""
        CREATE TABLE IF NOT EXISTS sibill_invoices (
            id TEXT PRIMARY KEY, -- sibill_id
            number TEXT,
            date TIMESTAMP NOT NULL,
            due_date TIMESTAMP,
            amount_net DECIMAL(12, 2) NOT NULL,
            amount_vat DECIMAL(12, 2) NOT NULL,
            amount_gross DECIMAL(12, 2) NOT NULL,
            type TEXT CHECK (type IN ('active', 'passive')), -- active=vendita, passive=acquisto
            status TEXT, -- paid, unpaid, etc.
            customer_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)
    
    # Tabella per tracciare le sincronizzazioni manuali
    await database.execute("""
        CREATE TABLE IF NOT EXISTS sibill_sync_log (
            id SERIAL PRIMARY KEY,
            sync_type TEXT CHECK (sync_type IN ('manual', 'automatic')) NOT NULL,
            force_sync BOOLEAN DEFAULT FALSE,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN DEFAULT TRUE,
            error_message TEXT
        );
        """)
    
    # Indice per query veloci per data
    await database.execute("""
        CREATE INDEX IF NOT EXISTS idx_sync_log_timestamp ON sibill_sync_log(timestamp);
        """)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Avvio Sibill Service...")
    await init_database()
    await create_tables()
    print("✅ Sibill Service avviato e tabelle pronte")
    yield
    await close_database()
    print("⏹️ Spegnimento Sibill Service...")

app = FastAPI(
    title="Sibill Service",
    description="Gestione sincronizzazione conti e fatture con Sibill",
    version="1.0.0",
    lifespan=lifespan
)

# --- Logic Sync ---

async def perform_sync_task(force: bool = False, sync_type: str = 'manual'):
    """
    Esegue la sincronizzazione con Sibill.
    
    IMPORTANTE: Il comportamento è IDENTICO indipendentemente da sync_type.
    Il parametro sync_type serve solo per il logging/tracciamento, non cambia
    la logica di sincronizzazione o come vengono gestiti i dati nel DB.
    
    Args:
        force: Se True, bypassa alcuni controlli di rate limiting
        sync_type: 'manual' o 'automatic' - solo per logging, non influisce sul comportamento
    """
    print(f"🔄 Starting Sibill Sync (Force={force}, Type={sync_type})...")
    client = SibillClient()

    try:
        # 1. Sync Accounts
        accounts = await client.get_accounts()
        accounts_saved = 0
        for acc in accounts:
            # Mapping secondo risposta reale API Sibill
            acc_id = acc.get('id')
            # Il nome è in 'nickname', non 'name'
            name = acc.get('nickname') or acc.get('name') or 'Conto sconosciuto'
            iban = acc.get('iban')
            
            # Balance: usa 'current_balance' (saldo corrente) o 'available_balance' come fallback
            balance_obj = acc.get('current_balance') or acc.get('available_balance') or {}
            balance = float(balance_obj.get('amount', 0)) if isinstance(balance_obj, dict) else float(balance_obj) if balance_obj else 0.0
            
            query = """
                INSERT INTO sibill_accounts (id, name, iban, balance, last_sync, updated_at)
                VALUES (:id, :name, :iban, :balance, :now, :now)
                ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                iban = EXCLUDED.iban,
                balance = EXCLUDED.balance,
                last_sync = EXCLUDED.last_sync,
                updated_at = EXCLUDED.updated_at
            """
            await database.execute(query, {
                "id": acc_id,
                "name": name,
                "iban": iban,
                "balance": balance,
                "now": datetime.now()
            })
            accounts_saved += 1

        # 2. Sync Transactions (per tutta la company, non per account)
        # Scarichiamo un ampio storico (2 anni) e aumentiamo il limite
        date_from = datetime.now() - timedelta(days=730) 
        txs = await client.get_transactions(date_from=date_from, limit=10000)
        transactions_saved = 0
        for tx in txs:
            tx_id = tx.get('id')
            account_id = tx.get('account_id')
            
            # Date: usa booking_date_time se disponibile, altrimenti date
            date_str = tx.get('booking_date_time') or tx.get('date')
            if date_str:
                try:
                    tx_date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    if tx_date.tzinfo:
                        tx_date = tx_date.replace(tzinfo=None)
                except:
                    tx_date = datetime.now()
            else:
                tx_date = datetime.now()
            
            # Amount è un oggetto { "amount": "12.3", "currency": "EUR" }
            amount_obj = tx.get('amount', {})
            amount = float(amount_obj.get('amount', 0)) if isinstance(amount_obj, dict) else float(amount_obj) if amount_obj else 0.0
            
            description = tx.get('clean_description') or tx.get('description') or ''
            category_obj = tx.get('category', {})
            category = category_obj.get('name') if isinstance(category_obj, dict) else None
            
            # Direction: positivo = entrata, negativo = uscita
            direction = 'in' if float(amount) > 0 else 'out'
            
            query_tx = """
                INSERT INTO sibill_transactions (id, account_id, date, amount, description, category, direction, raw_data)
                VALUES (:id, :account_id, :date, :amount, :description, :category, :direction, :raw_data)
                ON CONFLICT (id) DO UPDATE SET
                amount = EXCLUDED.amount,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                raw_data = EXCLUDED.raw_data
            """
            await database.execute(query_tx, {
                "id": tx_id,
                "account_id": account_id,
                "date": tx_date,
                "amount": amount,
                "description": description,
                "category": category,
                "direction": direction,
                "raw_data": json.dumps(tx)
            })
            transactions_saved += 1

        # 3. Sync Invoices (Issued)
        issued = await client.get_issued_documents(date_from=datetime.now() - timedelta(days=60))
        print(f"📊 Received {len(issued)} issued documents from Sibill")
        for inv in issued:
            await save_invoice(inv, 'active')
        if len(issued) > 0:
            print(f"💾 Saved {len(issued)} issued invoices")

        # 4. Sync Invoices (Received)
        received = await client.get_received_documents(date_from=datetime.now() - timedelta(days=60))
        print(f"📊 Received {len(received)} received documents from Sibill")
        for inv in received:
            await save_invoice(inv, 'passive')
        if len(received) > 0:
            print(f"💾 Saved {len(received)} received invoices")
        
        # Verifica finale fatture nel DB
        total_invoices = await database.fetch_val("SELECT COUNT(*) FROM sibill_invoices")
        total_iva_debit = await database.fetch_val("SELECT SUM(amount_vat) FROM sibill_invoices WHERE type = 'active'") or 0.0
        total_iva_credit = await database.fetch_val("SELECT SUM(amount_vat) FROM sibill_invoices WHERE type = 'passive'") or 0.0
        print(f"📊 DB Invoices: {total_invoices} total | IVA Debit: €{total_iva_debit:.2f} | IVA Credit: €{total_iva_credit:.2f}")

        print("✅ Sibill Sync Completed Successfully")
        
        # --- ETL: Popola Finance Ledger (Proprietary DB) ---
        # Copia le nuove transazioni USCITE da Sibill Raw a Finance Ledger
        print("🔄 ETL: Syncing Proprietary Finance Ledger...")
        await database.execute("""
            INSERT INTO finance_ledger (id, source_id, date, amount, description, created_at)
            SELECT id, id, date, amount, description, created_at
            FROM sibill_transactions
            WHERE direction = 'out'
            ON CONFLICT (id) DO NOTHING
        """)
        print("✅ ETL Completed.")
        
        # --- AI CATEGORIZATION TRIGGER (AGENTS) ---
        try:
            from ai_categorizer import process_uncategorized_transactions
            # Avvia categorizzazione AI COMPLETA (riprocessa tutto il ledger a blocchi di 50)
            # Questo riorganizza sistematicamente il DB proprietario ad ogni sync
            await process_uncategorized_transactions(batch_size=50, reprocess_all=True)
        except Exception as ai_e:
            print(f"⚠️ AI Categorization Error: {ai_e}")
        # ---------------------------------
        
        # Aggiorna il log con successo (se esiste un log per questo tipo di sync)
        # Nota: Il logging è solo per tracciamento, non influisce sul comportamento della sync
        await database.execute("""
            UPDATE sibill_sync_log 
            SET success = TRUE, error_message = NULL
            WHERE id = (
                SELECT id FROM sibill_sync_log 
                WHERE sync_type = :sync_type 
                AND success IS NULL
                ORDER BY timestamp DESC 
                LIMIT 1
            )
        """, {"sync_type": sync_type})

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Sibill Sync Failed: {error_msg}")
        
        # Aggiorna il log con errore (se esiste un log per questo tipo di sync)
        # Nota: Il logging è solo per tracciamento, non influisce sul comportamento della sync
        await database.execute("""
            UPDATE sibill_sync_log 
            SET success = FALSE, error_message = :error_msg
            WHERE id = (
                SELECT id FROM sibill_sync_log 
                WHERE sync_type = :sync_type 
                AND success IS NULL
                ORDER BY timestamp DESC 
                LIMIT 1
            )
        """, {
            "error_msg": error_msg[:500],  # Limita lunghezza messaggio
            "sync_type": sync_type
        })

async def save_invoice(inv: Dict, type_val: str):
    """
    Salva una fattura nel database.
    Struttura documentazione: gross_amount/vat_amount sono oggetti { "amount": "12.3", "currency": "EUR" }
    """
    inv_id = inv.get('id')
    number = inv.get('number')
    
    # Date: creation_date secondo documentazione
    date_str = inv.get('creation_date')
    if date_str:
        try:
            # creation_date è "YYYY-MM-DD"
            inv_date = datetime.strptime(date_str, "%Y-%m-%d")
        except:
            inv_date = datetime.now()
    else:
        inv_date = datetime.now()
    
    # Amounts: oggetti { "amount": "12.3", "currency": "EUR" }
    gross_obj = inv.get('gross_amount', {})
    gross = float(gross_obj.get('amount', 0)) if isinstance(gross_obj, dict) else float(gross_obj) if gross_obj else 0.0
    
    vat_obj = inv.get('vat_amount', {})
    vat = float(vat_obj.get('amount', 0)) if isinstance(vat_obj, dict) else float(vat_obj) if vat_obj else 0.0
    
    # Net = Gross - VAT
    net = gross - vat
    
    # Status: dalla documentazione può essere "DRAFT", "SENT", "PAID", etc.
    status = inv.get('status', 'UNKNOWN')
    
    # Due date: dal primo flow se disponibile
    flows = inv.get('flows', [])
    due_date = None
    if flows and len(flows) > 0:
        due_date_str = flows[0].get('expected_payment_date')
        if due_date_str:
            try:
                due_date = datetime.strptime(due_date_str, "%Y-%m-%d")
            except:
                pass
    
    # Counterpart: { "company_name": "string" }
    counterpart = inv.get('counterpart', {})
    customer_name = counterpart.get('company_name') if isinstance(counterpart, dict) else None
    
    query = """
        INSERT INTO sibill_invoices (id, number, date, due_date, amount_net, amount_vat, amount_gross, type, status, customer_name, updated_at)
        VALUES (:id, :number, :date, :due_date, :net, :vat, :gross, :type, :status, :customer_name, :now)
        ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        updated_at = EXCLUDED.updated_at
    """
    await database.execute(query, {
        "id": inv_id,
        "number": number,
        "date": inv_date,
        "due_date": due_date,
        "net": net,
        "vat": vat,
        "gross": gross,
        "type": type_val,
        "status": status,
        "customer_name": customer_name,
        "now": datetime.now()
    })

# --- Endpoints ---

@app.post("/api/sibill/sync")
async def trigger_sync(request: SyncRequest, background_tasks: BackgroundTasks):
    """
    Avvia la sincronizzazione con Sibill in background.
    Nessun limite per le sync manuali (pulsante).
    """
    now = datetime.now()
    
    # Rimuoviamo il limite di 2 sync manuali al giorno
    # L'utente può sincronizzare quante volte vuole tramite il pulsante
    
    # Se è force, controlla anche il limite di 12 ore per le automatiche (opzionale)
    # MODIFICA: Rimossi tutti i limiti per sync manuali come richiesto
    # if request.force:
    #     last_sync = await database.fetch_val("SELECT MAX(last_sync) FROM sibill_accounts")
    #     if last_sync:
    #         if isinstance(last_sync, datetime):
    #             if last_sync.tzinfo is not None:
    #                 last_sync = last_sync.replace(tzinfo=None)
    #         elif isinstance(last_sync, str):
    #             last_sync = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
    #             if last_sync.tzinfo:
    #                 last_sync = last_sync.replace(tzinfo=None)
    #         
    #         time_since_sync = now - last_sync
    #         hours_since = time_since_sync.total_seconds() / 3600
    #         
    #         if hours_since < 12:
    #             # Logica rimossa per permettere sync illimitati
    #             pass
    
    # Registra la sync nel log (prima di avviarla)
    await database.execute("""
        INSERT INTO sibill_sync_log (sync_type, force_sync, timestamp)
        VALUES ('manual', :force, :now)
    """, {
        "force": request.force,
        "now": now
    })
    
    # Avvia la sync in background
    # Nota: sync_type='manual' è solo per logging, non cambia il comportamento della sync
    background_tasks.add_task(perform_sync_task, request.force, 'manual')
    
    return {
        "status": "success", 
        "message": "Sync avviata in background", 
        "timestamp": now.isoformat(),
        "force": request.force
    }

@app.get("/api/sibill/sync-status")
async def get_sync_status():
    """
    Restituisce lo stato della sincronizzazione (ultima sync, prossima disponibile, etc.)
    senza avviare una nuova sync.
    Include anche informazioni sulle sync manuali di oggi.
    """
    now = datetime.now()
    today_start = datetime(now.year, now.month, now.day, 0, 0, 0)
    
    # Conta sync manuali di oggi
    manual_syncs_today = await database.fetch_val("""
        SELECT COUNT(*) 
        FROM sibill_sync_log 
        WHERE sync_type = 'manual' 
        AND timestamp >= :today_start
    """, {"today_start": today_start}) or 0
    
    # Ultima sync manuale di oggi
    last_manual_sync = await database.fetch_val("""
        SELECT MAX(timestamp) 
        FROM sibill_sync_log 
        WHERE sync_type = 'manual' 
        AND timestamp >= :today_start
    """, {"today_start": today_start})
    
    # Ultima sync generale (da accounts)
    last_sync = await database.fetch_val("SELECT MAX(last_sync) FROM sibill_accounts")
    
    # Nessun limite per sync manuali - sempre possibile
    can_sync_manual = True
    
    # Info sync automatiche (limite 12h)
    can_sync_automatic = True
    next_automatic_sync_time = None
    remaining_hours = 0
    
    if last_sync:
        if isinstance(last_sync, datetime):
            if last_sync.tzinfo is not None:
                last_sync = last_sync.replace(tzinfo=None)
        elif isinstance(last_sync, str):
            last_sync = datetime.fromisoformat(last_sync.replace('Z', '+00:00'))
            if last_sync.tzinfo:
                last_sync = last_sync.replace(tzinfo=None)
        
        time_since_sync = now - last_sync
        hours_since = time_since_sync.total_seconds() / 3600
        
        can_sync_automatic = hours_since >= 12
        if not can_sync_automatic:
            next_automatic_sync_time = last_sync + timedelta(hours=12)
            remaining_hours = 12 - hours_since
    
    return {
        "has_synced": last_sync is not None,
        "last_sync": last_sync.isoformat() if last_sync else None,
        "last_sync_readable": last_sync.strftime("%d/%m/%Y alle %H:%M") if last_sync else None,
        "next_automatic_sync_available": next_automatic_sync_time.isoformat() if next_automatic_sync_time else None,
        "next_automatic_sync_readable": next_automatic_sync_time.strftime("%d/%m/%Y alle %H:%M") if next_automatic_sync_time else None,
        "can_sync_automatic": can_sync_automatic,
        "remaining_hours_automatic": round(remaining_hours, 1),
        "hours_since_last_sync": round((now - last_sync).total_seconds() / 3600, 1) if last_sync else 0,
        # Info sync manuali (solo statistiche, nessun limite)
        "manual_syncs_today": manual_syncs_today,
        "can_sync_manual": True,  # Sempre possibile, nessun limite
        "last_manual_sync": last_manual_sync.isoformat() if last_manual_sync else None,
        "last_manual_sync_readable": last_manual_sync.strftime("%d/%m/%Y alle %H:%M") if last_manual_sync else None
    }

@app.get("/api/sibill/summary", response_model=ContoSummaryResponse)
async def get_summary():
    """
    Restituisce i KPI aggregati dal DB locale.
    """
    try:
        # 1. Calcolo Saldo Totale - Converti Decimal a float
        query_balance = "SELECT SUM(balance) FROM sibill_accounts"
        total_balance_raw = await database.fetch_val(query_balance) or 0.0
        total_balance = float(total_balance_raw)

        # 2. Calcolo Movimenti Mese Corrente - Converti Decimal a float
        now = datetime.now()
        start_of_month = datetime(now.year, now.month, 1)
        
        query_in = """
            SELECT SUM(amount) FROM sibill_transactions 
            WHERE direction = 'in' AND date >= :start_date
        """
        monthly_in_raw = await database.fetch_val(query_in, {"start_date": start_of_month}) or 0.0
        monthly_in = float(monthly_in_raw)

        query_out = """
            SELECT SUM(amount) FROM sibill_transactions 
            WHERE direction = 'out' AND date >= :start_date
        """
        monthly_out_raw = await database.fetch_val(query_out, {"start_date": start_of_month}) or 0.0
        monthly_out = float(monthly_out_raw)

        # 3. Calcolo IVA (Credito vs Debito) - Totale anno corrente
        start_of_year = datetime(now.year, 1, 1)
        
        # IVA a Debito (Vendite - Active) - da fatture emesse - Converti Decimal a float
        query_vat_debit = """
            SELECT SUM(amount_vat) FROM sibill_invoices 
            WHERE type = 'active' AND date >= :start_date
        """
        iva_debit_raw = await database.fetch_val(query_vat_debit, {"start_date": start_of_year}) or 0.0
        iva_debit = float(iva_debit_raw)

        # IVA a Credito (Acquisti - Passive) - da fatture ricevute - Converti Decimal a float
        query_vat_credit = """
            SELECT SUM(amount_vat) FROM sibill_invoices 
            WHERE type = 'passive' AND date >= :start_date
        """
        iva_credit_raw = await database.fetch_val(query_vat_credit, {"start_date": start_of_year}) or 0.0
        iva_credit = float(iva_credit_raw)
        
        # NOTA: Mostriamo SOLO i valori reali da Sibill (dalle fatture).
        # Se non ci sono fatture in Sibill, iva_debit e iva_credit saranno 0.0.
        # Non facciamo stime dalle transazioni perché non sono accurate.

        # Ultimo sync
        last_sync = await database.fetch_val("SELECT MAX(last_sync) FROM sibill_accounts")

        return {
            "total_balance": total_balance,
            "monthly_in": monthly_in,
            "monthly_out": abs(monthly_out), # Ensure positive for display
            "iva_credit": iva_credit,
            "iva_debit": iva_debit,
            "last_sync": last_sync
        }
    except Exception as e:
        print(f"Errore summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sibill/accounts")
async def get_accounts():
    """Ritorna la lista dei conti connessi"""
    query = "SELECT * FROM sibill_accounts ORDER BY name"
    return await database.fetch_all(query)

@app.get("/api/sibill/transactions", response_model=List[SibillTransactionResponse])
async def get_transactions(limit: int = 50, offset: int = 0):
    """
    Ritorna la lista dei movimenti dal DB locale.
    I dati vengono letti dal database, non da Sibill direttamente.
    """
    query = """
        SELECT t.id, t.account_id, t.date, t.amount, t.description, t.category, t.direction, a.name as account_name
        FROM sibill_transactions t
        LEFT JOIN sibill_accounts a ON t.account_id = a.id
        ORDER BY t.date DESC 
        LIMIT :limit OFFSET :offset
    """
    rows = await database.fetch_all(query, {"limit": limit, "offset": offset})
    
    # Converti i Record in dict e serializza correttamente le date
    transactions = []
    for row in rows:
        # Converti Record in dict
        row_dict = dict(row)
        
        # Converti la data in ISO string se è datetime
        date_value = row_dict.get('date')
        if isinstance(date_value, datetime):
            date_str = date_value.isoformat()
        elif date_value:
            date_str = str(date_value)
        else:
            date_str = datetime.now().isoformat()
        
        # Converti amount da Decimal a float
        amount_value = row_dict.get('amount')
        if amount_value is not None:
            if hasattr(amount_value, '__float__'):
                amount = float(amount_value)
            else:
                amount = float(amount_value)
        else:
            amount = 0.0
        
        transactions.append({
            "id": row_dict.get('id', ''),
            "account_id": row_dict.get('account_id', ''),
            "date": date_str,
            "amount": amount,
            "description": row_dict.get('description'),
            "category": row_dict.get('category'),
            "direction": row_dict.get('direction', 'out'),
            "account_name": row_dict.get('account_name')
        })
    
    return transactions

@app.get("/api/sibill/reconciliation/incoming", response_model=List[ReconciliationItem])
async def get_incoming_reconciliation():
    """
    Confronta le transazioni in entrata (Sibill) con i pagamenti previsti (Gestionale).
    Logica di matching:
    1. Match Esatto: Importo identico (o molto simile) + Data vicina + Nome cliente matchato
    2. Match Probabile: Importo identico + Data vicina
    """
    try:
        # 1. Recupera transazioni IN da Sibill
        # Aumentiamo il limite per vedere più storico
        query_sibill = """
            SELECT t.id, t.account_id, t.date, t.amount, t.description, t.category, t.direction, t.raw_data, a.name as account_name
            FROM sibill_transactions t
            LEFT JOIN sibill_accounts a ON t.account_id = a.id
            WHERE t.direction = 'in'
            ORDER BY t.date DESC
            LIMIT 2000
        """
        sibill_rows = await database.fetch_all(query_sibill)
        
        # DEBUG LOGGING
        try:
            with open("debug_sibill.log", "a") as f:
                f.write(f"[{datetime.now()}] Fetched {len(sibill_rows)} incoming transactions\n")
                if len(sibill_rows) > 0:
                    f.write(f"First tx: {dict(sibill_rows[0])}\n")
        except Exception as e:
            print(f"Log error: {e}")
        
        # 2. Recupera pagamenti attesi dal gestionale (pagamenti)
        # Prendiamo quelli 'pagato' (per verificare match passati) e 'da_pagare' (per match nuovi)
        query_pagamenti = """
            SELECT id, cliente, importo, data_scadenza, status, descrizione
            FROM pagamenti
            ORDER BY data_scadenza DESC
            LIMIT 1000
        """
        pagamenti_rows = await database.fetch_all(query_pagamenti)
        
        try:
            with open("debug_sibill.log", "a") as f:
                f.write(f"[{datetime.now()}] Fetched {len(pagamenti_rows)} pagamenti\n")
        except:
            pass
        
        # Converti pagamenti in lista di dict per iterazione veloce
        pagamenti_list = []
        for p in pagamenti_rows:
            p_dict = dict(p)
            # Converti decimal a float
            if p_dict.get('importo') is not None:
                p_dict['importo'] = float(p_dict['importo'])
            pagamenti_list.append(p_dict)

        results = []

        for row in sibill_rows:
            tx = dict(row)
            
            # Serializzazione base della transazione
            date_val = tx.get('date')
            date_str = date_val.isoformat() if isinstance(date_val, datetime) else str(date_val) if date_val else ""
            
            amount_val = float(tx.get('amount')) if tx.get('amount') is not None else 0.0
            desc_tx = (tx.get('description') or "").lower()
            
            # Estrarre counterpart_name da raw_data
            raw_data_str = tx.get('raw_data')
            counterpart_name = ""
            if raw_data_str:
                try:
                    if isinstance(raw_data_str, str):
                        raw_json = json.loads(raw_data_str)
                    else:
                        raw_json = raw_data_str # Già dict se driver supporta JSONB
                    
                    counterpart_name = (raw_json.get('counterpart_name') or "").lower()
                except:
                    pass

            tx_response = {
                "id": tx.get('id', ''),
                "account_id": tx.get('account_id', ''),
                "date": date_str,
                "amount": amount_val,
                "description": tx.get('description'),
                "category": tx.get('category'),
                "direction": tx.get('direction', 'in'),
                "account_name": tx.get('account_name')
            }

            match_status = "unmatched"
            match_detail = None
            
            # LOGICA DI MATCHING
            
            # Tentativo 1: Match Esatto (Importo + Nome Cliente)
            # Tolleranza importo: 0.05 euro
            # Tolleranza data: ignoriamo per ora, focus su nome e importo
            
            best_match = None
            best_score = 0
            
            for pag in pagamenti_list:
                score = 0
                pag_amount = pag.get('importo', 0.0)
                pag_cliente = (pag.get('cliente') or "").lower()
                
                # Check Importo (priorità alta)
                diff = abs(amount_val - pag_amount)
                if diff < 0.05: # Match importo quasi esatto
                    score += 50
                elif diff < 1.0: # Match importo simile
                    score += 20
                else:
                    continue # Se l'importo è diverso, difficile sia lo stesso pagamento (salvo acconti parziali, da gestire in futuro)

                # Check Nome Cliente (nella descrizione O nel counterpart_name)
                if pag_cliente and len(pag_cliente) > 3:
                    if pag_cliente in desc_tx:
                        score += 50
                    elif counterpart_name and pag_cliente in counterpart_name:
                        score += 50
                    # Reverse check: counterpart in pag_cliente (es. "Acme" in "Acme Srl")
                    elif counterpart_name and len(counterpart_name) > 3 and counterpart_name in pag_cliente:
                        score += 50
                
                if score > best_score:
                    best_score = score
                    best_match = pag
            
            # Determina status finale
            if best_score >= 100: # Importo esatto + Nome trovato
                match_status = "matched"
                confidence = "high"
            elif best_score >= 50: # Solo importo esatto (potrebbe essere ambiguo se ci sono più pagamenti uguali)
                match_status = "potential"
                confidence = "medium"
            else:
                match_status = "unmatched"
                confidence = "low"
            
            if best_match:
                p_date = best_match.get('data_scadenza')
                p_date_str = p_date.isoformat() if isinstance(p_date, datetime) else str(p_date) if p_date else None
                
                match_detail = {
                    "id": best_match.get('id'),
                    "cliente": best_match.get('cliente'),
                    "importo": best_match.get('importo'),
                    "data_scadenza": p_date_str,
                    "status": best_match.get('status'),
                    "confidence": confidence
                }
                
                # Se il match è "potential" ma l'importo è molto comune (es. 100 euro), degradare a unmatched se non c'è nome?
                # Per ora lasciamo potential per evidenziarlo all'utente.

            results.append({
                "transaction": tx_response,
                "match_status": match_status,
                "match_detail": match_detail if match_status != "unmatched" else None
            })
            
        return results

    except Exception as e:
        print(f"Errore riconciliazione: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sibill/expenses", response_model=List[ExpenseItem])
async def get_expenses(limit: int = 2000, offset: int = 0):
    """
    Ritorna la lista delle uscite dal Finance Ledger (DB Proprietario).
    I dati sono lavorati dagli Agenti AI.
    """
    try:
        # Recupera dati dal Ledger Proprietario, con join per info account
        query = """
            SELECT 
                l.id, l.source_id, l.date, l.amount, l.description, 
                l.category_key as ai_category, l.confidence_score as ai_confidence, l.agent_reasoning as ai_reasoning,
                l.verification_status,
                t.category as original_category, t.raw_data,
                a.id as account_id, a.name as account_name
            FROM finance_ledger l
            JOIN sibill_transactions t ON l.source_id = t.id
            LEFT JOIN sibill_accounts a ON t.account_id = a.id
            ORDER BY l.date DESC
            LIMIT :limit OFFSET :offset
        """
        rows = await database.fetch_all(query, {"limit": limit, "offset": offset})
        
        expenses = []
        for row in rows:
            tx = dict(row)
            
            # Serializzazione base
            date_val = tx.get('date')
            date_str = date_val.isoformat() if isinstance(date_val, datetime) else str(date_val) if date_val else ""
            
            amount_val = float(tx.get('amount')) if tx.get('amount') is not None else 0.0
            desc_tx = tx.get('description') or ""
            
            # Estrazione counterpart_name da raw_data
            raw_data_str = tx.get('raw_data')
            counterpart_name = ""
            if raw_data_str:
                try:
                    if isinstance(raw_data_str, str):
                        raw_json = json.loads(raw_data_str)
                    else:
                        raw_json = raw_data_str
                    counterpart_name = raw_json.get('counterpart_name') or ""
                except:
                    pass
            
            # DETERMINAZIONE CATEGORIA: Priorità AI dal Ledger
            ai_cat_key = tx.get('ai_category')
            ai_confidence = float(tx.get('ai_confidence') or 0)
            
            if ai_cat_key:
                # Usa AI dal Ledger
                cat_key = ai_cat_key
                is_ai = True
                cat_info = get_category_info(cat_key)
                deductibility = cat_info["deductibility"]
            else:
                # Fallback Euristica (se il ledger non è ancora processato)
                cat_key, deductibility = categorize_transaction(desc_tx, abs(amount_val), counterpart_name)
                cat_info = get_category_info(cat_key)
                is_ai = False
            
            tx_response = {
                "id": tx.get('id', ''), # Usa ID del ledger
                "account_id": tx.get('account_id', ''),
                "date": date_str,
                "amount": amount_val, 
                "description": desc_tx,
                "category": tx.get('original_category'), 
                "direction": "out",
                "account_name": tx.get('account_name')
            }
            
            expenses.append({
                "transaction": tx_response,
                "category": {
                    "key": cat_key,
                    "label": cat_info["label"],
                    "deductibility": cat_info["deductibility"],
                    "type": cat_info["type"],
                    "description": cat_info["description"]
                },
                "is_ai_categorized": is_ai,
                "ai_confidence": ai_confidence if is_ai else 0.0,
                "ai_reasoning": tx.get('ai_reasoning') if is_ai else None
            })
        
        return expenses
    
    except Exception as e:
        print(f"Errore recupero uscite: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sibill/expense-categories")
async def get_expense_categories():
    """
    Ritorna la lista delle categorie di spesa disponibili.
    """
    from categorizer import EXPENSE_CATEGORIES
    categories = []
    for key, data in EXPENSE_CATEGORIES.items():
        categories.append({
            "key": key,
            "label": data["label"],
            "deductibility": data["deductibility"],
            "type": data["type"],
            "description": data["description"]
        })
    return categories

@app.post("/api/sibill/categorize-all")
async def trigger_ai_categorization(background_tasks: BackgroundTasks, limit: int = 50):
    """
    Avvia un task in background per (ri)categorizzare tutte le uscite con AI a blocchi.
    """
    try:
        from ai_categorizer import process_uncategorized_transactions
        # Avvia con reprocess_all=True e batch_size=limit
        background_tasks.add_task(process_uncategorized_transactions, batch_size=limit, reprocess_all=True)
        return {"status": "started", "message": f"AI Categorization avviata (Batch Size: {limit})"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8008)))
