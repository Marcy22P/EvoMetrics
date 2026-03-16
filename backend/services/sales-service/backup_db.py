"""
Script di backup one-shot della tabella leads.
Eseguire PRIMA di qualsiasi modifica allo schema.
Output: backup_sales_YYYYMMDD_HHMMSS.json nella stessa cartella
"""
import os
import json
from datetime import datetime
from pathlib import Path

# Carica .env dalla root del progetto
try:
    from dotenv import load_dotenv
    root = Path(__file__).parent.parent.parent.parent
    for env_path in [root / ".env", Path(__file__).parent / ".env"]:
        if env_path.exists():
            load_dotenv(env_path)
            break
except ImportError:
    pass

from sqlalchemy import create_engine, text

DATABASE_URL = os.environ.get("DATABASE_URL", "")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL non trovata nelle env vars")

if "+asyncpg" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("+asyncpg", "+psycopg2")
elif DATABASE_URL.startswith("postgresql://") and "+" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

engine = create_engine(DATABASE_URL, connect_args={"sslmode": "prefer"})
timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

def serialize(obj):
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")

with engine.connect() as conn:
    leads = conn.execute(text("SELECT * FROM leads")).mappings().all()
    leads_data = [dict(row) for row in leads]

    stages = conn.execute(text("SELECT * FROM pipeline_stages")).mappings().all()
    stages_data = [dict(row) for row in stages]

    try:
        tags = conn.execute(text("SELECT * FROM lead_tags")).mappings().all()
        tags_data = [dict(row) for row in tags]
    except Exception:
        tags_data = []

backup = {
    "timestamp": timestamp,
    "leads_count": len(leads_data),
    "stages_count": len(stages_data),
    "tags_count": len(tags_data),
    "leads": leads_data,
    "pipeline_stages": stages_data,
    "lead_tags": tags_data,
}

filename = f"backup_sales_{timestamp}.json"
with open(filename, "w", encoding="utf-8") as f:
    json.dump(backup, f, default=serialize, ensure_ascii=False, indent=2)

print(f"✅ Backup completato: {filename}")
print(f"   Lead: {len(leads_data)} | Stage: {len(stages_data)} | Tag: {len(tags_data)}")
