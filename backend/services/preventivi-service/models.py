"""
Pydantic models per Preventivi Service
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class ServizioItem(BaseModel):
    """Singolo servizio nel preventivo"""
    descrizione: str
    quantita: int = 1
    prezzo: float


class PreventivoData(BaseModel):
    """Dati per creare/aggiornare un preventivo"""
    cliente: str
    oggetto: str
    servizi: List[ServizioItem]
    totale: float
    subtotale: Optional[float] = None
    iva: Optional[float] = None
    note: Optional[str] = None
    numero: Optional[str] = None
    data: Optional[str] = None
    validita: Optional[str] = None
    tipologiaIntervento: Optional[str] = None
    tipologiaInterventoEcommerce: Optional[str] = None
    tipologiaInterventoMarketing: Optional[str] = None
    tipologiaInterventoVideoPost: Optional[str] = None
    tipologiaInterventoMetaAds: Optional[str] = None
    tipologiaInterventoGoogleAds: Optional[str] = None
    tipologiaInterventoSeo: Optional[str] = None
    tipologiaInterventoEmailMarketing: Optional[str] = None
    terminiPagamento: Optional[str] = None
    terminiCondizioni: Optional[str] = None


class PreventivoResponse(BaseModel):
    """Risposta con dati preventivo"""
    id: str
    cliente: str
    oggetto: str
    servizi: List[Dict[str, Any]]
    totale: float
    subtotale: Optional[float] = None
    iva: Optional[float] = None
    note: Optional[str] = None
    numero: Optional[str] = None
    data: Optional[str] = None
    validita: Optional[str] = None
    tipologiaIntervento: Optional[str] = None
    tipologiaInterventoEcommerce: Optional[str] = None
    tipologiaInterventoMarketing: Optional[str] = None
    tipologiaInterventoVideoPost: Optional[str] = None
    tipologiaInterventoMetaAds: Optional[str] = None
    tipologiaInterventoGoogleAds: Optional[str] = None
    tipologiaInterventoSeo: Optional[str] = None
    tipologiaInterventoEmailMarketing: Optional[str] = None
    terminiPagamento: Optional[str] = None
    terminiCondizioni: Optional[str] = None
    status: str = "created"
    source: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    client_info: Optional[Dict[str, Any]] = None

