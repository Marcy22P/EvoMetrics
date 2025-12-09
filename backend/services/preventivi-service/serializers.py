import json
from typing import Dict, Any
from datetime import datetime

def serialize_preventivo(row: Dict[str, Any]) -> Dict[str, Any]:
    """Serializza un preventivo dal database al formato API"""
    try:
        # Parsifica i dati JSON dalla colonna 'data'
        if isinstance(row.get('data'), str):
            data_json = json.loads(row['data'])
        else:
            data_json = row.get('data') or {}
        
        # Parsifica client_info se presente
        client_info = {}
        if row.get('client_info'):
            if isinstance(row['client_info'], str):
                client_info = json.loads(row['client_info'])
            else:
                client_info = row['client_info']
        
        # Costruisci risposta - Preferisci colonne dedicate se presenti
        response = {
            "id": row['id'],
            "cliente": row.get('nome_cliente') or data_json.get('cliente', ''),
            "oggetto": data_json.get('oggetto', ''),
            "servizi": data_json.get('servizi', []),
            "totale": row.get('importo_totale') or data_json.get('totale', 0),
            "subtotale": data_json.get('subtotale'),
            "iva": data_json.get('iva'),
            "note": data_json.get('note', ''),
            "numero": row.get('numero_preventivo') or data_json.get('numero', ''),
            "data": data_json.get('data', ''),
            "validita": data_json.get('validita', ''),
            "tipologiaIntervento": data_json.get('tipologiaIntervento', ''),
            "tipologiaInterventoEcommerce": data_json.get('tipologiaInterventoEcommerce', ''),
            "tipologiaInterventoMarketing": data_json.get('tipologiaInterventoMarketing', ''),
            "tipologiaInterventoVideoPost": data_json.get('tipologiaInterventoVideoPost', ''),
            "tipologiaInterventoMetaAds": data_json.get('tipologiaInterventoMetaAds', ''),
            "tipologiaInterventoGoogleAds": data_json.get('tipologiaInterventoGoogleAds', ''),
            "tipologiaInterventoSeo": data_json.get('tipologiaInterventoSeo', ''),
            "tipologiaInterventoEmailMarketing": data_json.get('tipologiaInterventoEmailMarketing', ''),
            "terminiPagamento": data_json.get('terminiPagamento', ''),
            "terminiCondizioni": data_json.get('terminiCondizioni', ''),
            "status": row.get('status', 'created'),
            "source": row.get('source', 'unknown'),
            "client_info": client_info,
            "created_at": row['created_at'].isoformat() if row.get('created_at') else None,
            "updated_at": row['updated_at'].isoformat() if row.get('updated_at') else None,
        }
        return response
    except Exception as e:
        print(f"❌ Errore serializzazione preventivo: {e}")
        raise

