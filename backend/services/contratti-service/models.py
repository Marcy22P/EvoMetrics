"""
Pydantic models per Contratti Service
"""

from pydantic import BaseModel
from typing import List, Optional


class DatiCommittente(BaseModel):
    ragioneSociale: str
    citta: str
    via: str
    numero: str
    cap: str
    email: str
    pec: Optional[str] = None
    cfPiva: str
    legaleRappresentante: str


class ServizioContratto(BaseModel):
    id: str
    nome: str
    descrizione: str
    attivato: bool


class DurataContratto(BaseModel):
    tipo: str
    dataDecorrenza: str
    dataScadenza: str


class CompensoSitoWeb(BaseModel):
    importoTotale: float
    modalitaPagamento: str
    acconto: float
    secondaRata: Optional[float] = None
    saldo: float


class CompensoMarketing(BaseModel):
    importoMensile: float
    giornoPagamento: int


class CompensoContratto(BaseModel):
    sitoWeb: Optional[CompensoSitoWeb] = None
    marketing: CompensoMarketing


class ContrattoData(BaseModel):
    numero: str
    datiCommittente: DatiCommittente
    tipologiaServizio: str
    servizi: List[ServizioContratto]
    durata: DurataContratto
    compenso: CompensoContratto
    note: Optional[str] = None
    articolo2Oggetto: Optional[str] = None
    articolo2SitoWeb: Optional[str] = None
    articolo2Marketing: Optional[str] = None
    articolo2Linkbuilding: Optional[str] = None
    articolo3Modalita: Optional[str] = None
    articolo4Durata: Optional[str] = None
    articolo5Compenso: Optional[str] = None
    articolo6Proprieta: Optional[str] = None
    articolo7Responsabilita: Optional[str] = None
    articolo8NormeRinvio: Optional[str] = None
    articolo9ForoCompetente: Optional[str] = None
    status: str = "bozza"


class ContrattoResponse(BaseModel):
    id: str
    numero: str
    datiCommittente: DatiCommittente
    tipologiaServizio: str
    servizi: List[ServizioContratto]
    durata: DurataContratto
    compenso: CompensoContratto
    note: Optional[str] = None
    articolo2Oggetto: Optional[str] = None
    articolo2SitoWeb: Optional[str] = None
    articolo2Marketing: Optional[str] = None
    articolo2Linkbuilding: Optional[str] = None
    articolo3Modalita: Optional[str] = None
    articolo4Durata: Optional[str] = None
    articolo5Compenso: Optional[str] = None
    articolo6Proprieta: Optional[str] = None
    articolo7Responsabilita: Optional[str] = None
    articolo8NormeRinvio: Optional[str] = None
    articolo9ForoCompetente: Optional[str] = None
    status: str
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class UpdateStatusRequest(BaseModel):
    status: str

