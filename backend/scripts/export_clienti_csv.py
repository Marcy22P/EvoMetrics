#!/usr/bin/env python3
"""
Script standalone per esportare i clienti in CSV.
Colonne: Nome, Cognome, Nome Azienda, P.IVA, Durata Contratto, Inizio Contratto, Path Drive, Valore Contratto.
Il valore contratto viene risolto cercando il contratto per Ragione Sociale (nome azienda).
Esegui dalla root: .venv/bin/python backend/scripts/export_clienti_csv.py
"""
import csv
import json
import os
import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent.parent
env_path = repo_root / ".env"
if env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(env_path)
    except ImportError:
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    k, v = k.strip(), v.strip()
                    if v.startswith("'") and v.endswith("'"): v = v[1:-1].replace("\\n", "\n")
                    elif v.startswith('"') and v.endswith('"'): v = v[1:-1].replace('\\n', '\n')
                    os.environ.setdefault(k, v)

DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    print("❌ Imposta DATABASE_URL (o .env nella root)")
    sys.exit(1)
if "+asyncpg" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("+asyncpg", "+psycopg2")
elif DATABASE_URL.startswith("postgresql://") and "+" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)


def contratto_valore(compenso):
    if not compenso:
        return ""
    if isinstance(compenso, str):
        try:
            compenso = json.loads(compenso)
        except Exception:
            return ""
    if not isinstance(compenso, dict):
        return ""
    sito = compenso.get("sitoWeb") or {}
    marketing = compenso.get("marketing") or {}
    if isinstance(sito, dict) and sito.get("importoTotale") is not None:
        return str(sito["importoTotale"])
    if isinstance(marketing, dict) and marketing.get("importoMensile") is not None:
        return str(marketing["importoMensile"])
    return ""


def contratto_durata_testo(durata):
    if not durata:
        return ""
    if isinstance(durata, str):
        try:
            durata = json.loads(durata)
        except Exception:
            return ""
    if not isinstance(durata, dict):
        return ""
    dec = durata.get("dataDecorrenza") or ""
    scad = durata.get("dataScadenza") or ""
    if dec and scad:
        return f"{dec} - {scad}"
    return dec or scad


def main():
    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import sessionmaker

    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=1, max_overflow=0)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        clienti = db.execute(text(
            "SELECT id, nome_azienda, contatti, dettagli FROM clienti ORDER BY created_at DESC"
        )).fetchall()
        contratti = db.execute(text(
            "SELECT id, cliente_id, ragione_sociale, durata, compenso FROM contratti ORDER BY created_at DESC"
        )).fetchall()
    finally:
        db.close()

    contratti_list = []
    for c in contratti:
        contratti_list.append({
            "id": c[0],
            "cliente_id": c[1],
            "ragione_sociale": c[2],
            "durata": c[3],
            "compenso": c[4],
        })

    def find_contratto(cliente_id, nome_azienda):
        nome_norm = (nome_azienda or "").strip().lower()
        for c in contratti_list:
            if (c.get("cliente_id") or "").strip() == cliente_id:
                return c
        for c in contratti_list:
            rs = (c.get("ragione_sociale") or "").strip().lower()
            if nome_norm and rs and (nome_norm in rs or rs in nome_norm):
                return c
        return None

    headers = [
        "Nome", "Cognome", "Nome Azienda", "P.IVA", "Durata Contratto",
        "Inizio Contratto", "Path Drive", "Valore Contratto",
    ]
    out_path = repo_root / "clienti-export.csv"
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=",", quoting=csv.QUOTE_MINIMAL)
        writer.writerow(headers)
        for row in clienti:
            cliente_id, nome_azienda, contatti_raw, dettagli_raw = row[0], row[1], row[2], row[3]
            contatti = {}
            if contatti_raw:
                try:
                    contatti = json.loads(contatti_raw) if isinstance(contatti_raw, str) else contatti_raw
                except Exception:
                    pass
            dettagli = {}
            if dettagli_raw:
                try:
                    dettagli = json.loads(dettagli_raw) if isinstance(dettagli_raw, str) else dettagli_raw
                except Exception:
                    pass
            referente = dettagli.get("referente") or {}
            if isinstance(referente, str):
                try:
                    referente = json.loads(referente) if referente else {}
                except Exception:
                    referente = {}
            nome = referente.get("nome") or ""
            cognome = referente.get("cognome") or ""
            p_iva = contatti.get("cfPiva") or ""
            drive_folder_id = dettagli.get("drive_folder_id") or ""
            path_drive = f"https://drive.google.com/drive/folders/{drive_folder_id}" if drive_folder_id else ""

            contratto = find_contratto(str(cliente_id), nome_azienda)
            durata_txt = ""
            inizio_txt = ""
            valore_txt = ""
            if contratto:
                durata_raw = contratto.get("durata")
                durata_txt = contratto_durata_testo(durata_raw)
                if isinstance(durata_raw, str):
                    try:
                        durata_raw = json.loads(durata_raw)
                    except Exception:
                        durata_raw = {}
                inizio_txt = (durata_raw.get("dataDecorrenza") or "") if isinstance(durata_raw, dict) else ""
                valore_txt = contratto_valore(contratto.get("compenso"))

            writer.writerow([
                nome, cognome, nome_azienda or "", p_iva, durata_txt, inizio_txt, path_drive, valore_txt
            ])

    print(f"✅ CSV salvato: {out_path} ({len(clienti)} clienti)")


if __name__ == "__main__":
    main()
