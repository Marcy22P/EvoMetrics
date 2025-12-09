"""
Pydantic models per Pagamenti Service
"""

from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class PagamentoData(BaseModel):
    contratto_id: str
    contratto_numero: str
    cliente: str
    tipo: str  # 'sito_acconto', 'sito_rata2', 'sito_saldo', 'marketing_mensile'
    descrizione: Optional[str] = None
    importo: float
    data_scadenza: str  # ISO format
    status: str = "da_pagare"  # 'da_pagare', 'pagato', 'scaduto'
    metodo_pagamento: Optional[str] = None
    note: Optional[str] = None


class PagamentoResponse(BaseModel):
    id: str
    contratto_id: str
    contratto_numero: str
    cliente: str
    tipo: str
    descrizione: Optional[str] = None
    importo: float
    data_scadenza: str
    data_pagamento: Optional[str] = None
    status: str
    metodo_pagamento: Optional[str] = None
    note: Optional[str] = None
    created_at: str
    updated_at: str
    contratto_status: Optional[str] = None  # Stato del contratto


class MarcaPagatoRequest(BaseModel):
    data_pagamento: Optional[str] = None
    metodo_pagamento: Optional[str] = None
    note: Optional[str] = None


class AnnullaPagamentoRequest(BaseModel):
    note: Optional[str] = None


# --- Modelli per Spese (Uscite) ---

class SpesaData(BaseModel):
    descrizione: str
    importo: float
    data_spesa: str # ISO date YYYY-MM-DD
    categoria: str # 'software', 'ufficio', 'tasse', 'personale', 'marketing', 'altro'
    metodo_pagamento: Optional[str] = None
    note: Optional[str] = None
    ricorrente: bool = False

class SpesaResponse(BaseModel):
    id: str
    descrizione: str
    importo: float
    data_spesa: str
    categoria: str
    metodo_pagamento: Optional[str] = None
    note: Optional[str] = None
    created_at: str

# --- Modelli Analytics ---

class DailyTrend(BaseModel):
    date: str
    entrate: float
    uscite: float
    netto: float

class FinanceAnalyticsResponse(BaseModel):
    periodo_start: str
    periodo_end: str
    entrate_totali: float
    uscite_totali: float
    tasse_stimate: float # Es. 22% entrate imponibili
    utile_netto: float
    trend_daily: List[DailyTrend]
