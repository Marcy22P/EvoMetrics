"""
Pydantic models per Clienti Service
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List


class Contatti(BaseModel):
    email: Optional[str] = None
    telefono: Optional[str] = None
    indirizzo: Optional[str] = None
    pec: Optional[str] = None
    cfPiva: Optional[str] = None
    legaleRappresentante: Optional[str] = None


class ClienteData(BaseModel):
    """Modello per creazione/aggiornamento cliente"""
    nome_azienda: str
    contatti: Optional[Dict[str, Any]] = None
    servizi_attivi: Optional[List[str]] = None
    integrazioni: Optional[Dict[str, Any]] = None
    note: Optional[str] = None
    source: Optional[str] = "manual"
    source_id: Optional[str] = None


class ClienteResponse(BaseModel):
    """Modello per risposta API cliente"""
    id: str
    nome_azienda: str
    contatti: Optional[Dict[str, Any]] = None
    servizi_attivi: Optional[List[str]] = None
    integrazioni: Optional[Dict[str, Any]] = None
    note: Optional[str] = None
    source: Optional[str] = None
    source_id: Optional[str] = None
    created_at: str
    updated_at: str


class MagicLinkResponse(BaseModel):
    """Modello per risposta API magic link"""
    id: str
    cliente_id: str
    token: str
    url: str
    is_active: bool
    is_used: bool
    expires_at: str
    created_at: str
    used_at: Optional[str] = None
    revoked_at: Optional[str] = None


class CreateMagicLinkResponse(BaseModel):
    """Modello per risposta creazione magic link"""
    id: str
    url: str
    token: str
    expires_at: str
    is_active: bool


class VerifyMagicLinkResponse(BaseModel):
    """Modello per risposta verifica magic link"""
    valid: bool
    cliente_id: str
    cliente_nome: str
    expires_at: Optional[str] = None
    is_used: bool
    is_active: bool


class ImportSource(BaseModel):
    """Modello per fonte di import"""
    id: str
    numero: Optional[str] = None
    cliente: Optional[str] = None
    ragioneSociale: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    citta: Optional[str] = None
    data: Optional[str] = None


class ImportSourcesResponse(BaseModel):
    """Modello per risposta fonti di import"""
    preventivi: List[ImportSource]
    contratti: List[ImportSource]


class ImportClienteRequest(BaseModel):
    """Modello per richiesta import cliente"""
    source_type: str  # "preventivo" o "contratto"
    source_id: str

