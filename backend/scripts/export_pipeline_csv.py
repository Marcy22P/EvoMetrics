#!/usr/bin/env python3
"""
Script standalone per esportare tutte le opportunità Pipeline in CSV.
Usa DATABASE_URL dal .env (stesso DB del sales-service).
Esegui dalla root del repo: python backend/scripts/export_pipeline_csv.py
Oppure da backend: python scripts/export_pipeline_csv.py
"""
import csv
import io
import json
import os
import sys
from pathlib import Path

# Carica .env dalla root del repo
repo_root = Path(__file__).resolve().parent.parent.parent
env_path = repo_root / ".env"
if env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        # Fallback: leggi .env a mano (senza quote complesse)
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    k, v = k.strip(), v.strip()
                    if v.startswith("'") and v.endswith("'"): v = v[1:-1].replace("\\n", "\n")
                    elif v.startswith('"') and v.endswith('"'): v = v[1:-1].replace('\\n', '\n')
                    os.environ.setdefault(k, v)

DATABASE_URL = os.environ.get("DATABASE_URL") or os.environ.get("SALES_DATABASE_URL")
if not DATABASE_URL:
    print("❌ Imposta DATABASE_URL o SALES_DATABASE_URL (o .env nella root)")
    sys.exit(1)

# SQLAlchemy sincrono per PostgreSQL
if "+asyncpg" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("+asyncpg", "+psycopg2")
elif DATABASE_URL.startswith("postgresql://") and "+" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

def main():
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=1,
        max_overflow=0,
    )
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        # Lead con tutti i campi, ordinati per created_at desc
        leads = db.execute(
            text("""
                SELECT id, email, first_name, last_name, phone, azienda, stage, source,
                       notes, response_status, lead_tag_id, deal_value, deal_currency,
                       deal_services, linked_preventivo_id, linked_contratto_id,
                       source_channel, assigned_to_user_id, created_at, updated_at
                FROM leads
                ORDER BY created_at DESC
            """)
        ).fetchall()

        # Stage key -> label
        stages = {r[0]: r[1] for r in db.execute(text("SELECT key, label FROM pipeline_stages")).fetchall()}
        # Tag id -> label
        tags = {r[0]: r[1] for r in db.execute(text("SELECT id, label FROM lead_tags")).fetchall()}
        # User id -> nome cognome
        users_rows = db.execute(text("SELECT id, nome, cognome FROM users")).fetchall()
        user_names = {}
        for r in users_rows:
            uid = str(r[0]) if r[0] else ""
            user_names[uid] = f"{(r[1] or '').strip()} {(r[2] or '').strip()}".strip()
    finally:
        db.close()

    def format_ts(v):
        if v is None:
            return ""
        return v.isoformat() if hasattr(v, "isoformat") else str(v)

    headers = [
        "Nome", "Cognome", "Nome Azienda", "Canale della fonte", "Source",
        "Stage", "Stage label", "Data opt-in", "Data ultima modifica",
        "Email", "Telefono", "Valore deal (EUR)", "Valuta", "Servizi deal",
        "ID preventivo", "ID contratto", "Assegnato a", "Tag", "Response status",
        "Note", "ID",
    ]

    out_path = repo_root / "pipeline-opportunita.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=",", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(headers)
        for row in leads:
            (id_, email, first_name, last_name, phone, azienda, stage, source,
             notes, response_status, lead_tag_id, deal_value, deal_currency,
             deal_services, linked_preventivo_id, linked_contratto_id,
             source_channel, assigned_to_user_id, created_at, updated_at) = row
            stage_label = stages.get(stage, stage or "")
            tag_label = tags.get(lead_tag_id, "") if lead_tag_id else ""
            assigned = user_names.get(str(assigned_to_user_id or ""), "")
            if deal_value is not None:
                deal_val = round(deal_value / 100.0, 2)
            else:
                deal_val = ""
            if deal_services:
                try:
                    svc = json.loads(deal_services) if isinstance(deal_services, str) else deal_services
                    services_str = "; ".join(f"{s.get('name', '')}: {s.get('price', 0)}€" for s in (svc if isinstance(svc, list) else []))
                except Exception:
                    services_str = ""
            else:
                services_str = ""
            writer.writerow([
                (first_name or ""),
                (last_name or ""),
                azienda or "",
                source_channel or "",
                source or "",
                stage or "",
                stage_label,
                format_ts(created_at),
                format_ts(updated_at),
                email or "",
                phone or "",
                deal_val,
                deal_currency or "EUR",
                services_str,
                linked_preventivo_id or "",
                linked_contratto_id or "",
                assigned,
                tag_label,
                response_status or "",
                (notes or "").replace("\r\n", " ").replace("\n", " "),
                id_ or "",
            ])

    print(f"✅ CSV salvato: {out_path} ({len(leads)} opportunità)")

if __name__ == "__main__":
    main()
