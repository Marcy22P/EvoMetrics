#!/usr/bin/env python3
"""
migrate_v3.py — Aggiunge le colonne V3 alla tabella `leads`.
Eseguire nella directory del sales-service con le stesse variabili d'ambiente
del backend.

Uso:
  cd backend/services/sales-service
  DATABASE_URL=postgresql://... python3 migrate_v3.py
  oppure semplicemente:
  python3 migrate_v3.py   (se DATABASE_URL è già nell'environment)
"""

import os
import sys

# ── Carica .env se presente ────────────────────────────────────────────────────
for env_path in ['.env', '../../../.env', '../../.env']:
    if os.path.exists(env_path):
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path)
            print(f"Loaded .env from {env_path}")
        except ImportError:
            # Fallback manuale
            with open(env_path) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        k, v = line.split('=', 1)
                        os.environ.setdefault(k.strip(), v.strip())
        break

# ── Determina DATABASE_URL ─────────────────────────────────────────────────────
DATABASE_URL = os.environ.get('SALES_DATABASE_URL') or os.environ.get('DATABASE_URL')

if not DATABASE_URL:
    # Fallback: SQLite locale
    DATABASE_URL = f"sqlite:///./sales.db"
    print(f"DATABASE_URL non trovata — uso SQLite locale: {DATABASE_URL}")
else:
    print(f"Database: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")

IS_POSTGRES = 'postgresql' in DATABASE_URL.lower()

# ── Connessione ────────────────────────────────────────────────────────────────

if IS_POSTGRES:
    # Converti asyncpg -> psycopg2 se necessario
    if '+asyncpg' in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace('+asyncpg', '+psycopg2')
    elif DATABASE_URL.startswith('postgresql://') and '+' not in DATABASE_URL:
        DATABASE_URL = DATABASE_URL.replace('postgresql://', 'postgresql+psycopg2://', 1)

    try:
        import psycopg2
        # Estrai i parametri dall'URL manualmente per psycopg2 puro
        from urllib.parse import urlparse
        p = urlparse(DATABASE_URL.replace('+psycopg2', ''))
        conn = psycopg2.connect(
            host=p.hostname,
            port=p.port or 5432,
            database=p.path.lstrip('/'),
            user=p.username,
            password=p.password,
            sslmode=os.environ.get('POSTGRES_SSL_MODE', 'prefer'),
            connect_timeout=30,
        )
        conn.autocommit = False
        cursor = conn.cursor()
        print(f"Connesso a PostgreSQL: {p.hostname}/{p.path.lstrip('/')}")
        db_type = 'postgres'
    except Exception as e:
        print(f"ERRORE connessione PostgreSQL: {e}", file=sys.stderr)
        sys.exit(1)
else:
    try:
        import sqlite3
        db_path = DATABASE_URL.replace('sqlite:///', '').replace('sqlite://', '')
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        print(f"Connesso a SQLite: {db_path}")
        db_type = 'sqlite'
    except Exception as e:
        print(f"ERRORE connessione SQLite: {e}", file=sys.stderr)
        sys.exit(1)

# ── Colonne da aggiungere ─────────────────────────────────────────────────────

V3_COLUMNS = [
    ('stage_entered_at',     'TIMESTAMP'),
    ('first_contact_at',     'TIMESTAMP'),
    ('first_appointment_at', 'TIMESTAMP'),
    ('last_activity_at',     'TIMESTAMP'),
    ('no_show_count',        'INTEGER DEFAULT 0'),
    ('follow_up_count',      'INTEGER DEFAULT 0'),
    ('consapevolezza',       'VARCHAR(50)'),
    ('obiettivo_cliente',    'VARCHAR(50)'),
    ('pacchetto_consigliato','VARCHAR(50)'),
    ('budget_indicativo',    'VARCHAR(50)'),
    ('setter_id',            'VARCHAR(50)'),
    ('appointment_date',     'TIMESTAMP'),
    ('follow_up_date',       'TIMESTAMP'),
    ('trattativa_persa_reason','VARCHAR(100)'),
    ('lead_score',           'INTEGER DEFAULT 0'),
]

# ── Esegui migrazione ─────────────────────────────────────────────────────────

print("\nInizio migrazione V3...")
added = 0
skipped = 0
errors = 0

for col_name, col_type in V3_COLUMNS:
    if db_type == 'postgres':
        sql = f"ALTER TABLE leads ADD COLUMN IF NOT EXISTS {col_name} {col_type}"
    else:
        # SQLite non supporta IF NOT EXISTS in ALTER TABLE — verifica prima
        cursor.execute("PRAGMA table_info(leads)")
        existing = [row[1] for row in cursor.fetchall()]
        if col_name in existing:
            print(f"  SKIP  {col_name} (già presente)")
            skipped += 1
            continue
        sql = f"ALTER TABLE leads ADD COLUMN {col_name} {col_type}"

    try:
        cursor.execute(sql)
        if db_type == 'postgres':
            conn.commit()
        else:
            conn.commit()
        print(f"  OK    {col_name} ({col_type})")
        added += 1
    except Exception as e:
        err_str = str(e)
        if 'already exists' in err_str.lower() or 'duplicate column' in err_str.lower():
            print(f"  SKIP  {col_name} (già presente)")
            skipped += 1
            if db_type == 'postgres':
                conn.rollback()
        else:
            print(f"  ERR   {col_name}: {e}")
            errors += 1
            if db_type == 'postgres':
                conn.rollback()

cursor.close()
conn.close()

print(f"\nMigrazione completata: {added} aggiunte, {skipped} saltate, {errors} errori.")
if errors == 0:
    print("Riavvia il backend per applicare le modifiche.")
else:
    print("Correggi gli errori e riesegui lo script.", file=sys.stderr)
    sys.exit(1)
