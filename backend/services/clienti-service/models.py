"""
Pydantic models per Clienti Service
"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List

# --- NUOVI MODELLI PER DETTAGLI ---

class Referente(BaseModel):
    nome: Optional[str] = None
    cognome: Optional[str] = None
    azienda: Optional[str] = None
    email: Optional[str] = None
    telefono: Optional[str] = None
    file_preventivo: Optional[str] = None  # URL o path
    file_contratto: Optional[str] = None   # URL o path

class Canale(BaseModel):
    id: str  # Frontend generated UUID
    url_sito: Optional[str] = None
    nome_utente: Optional[str] = None  # o email
    password: Optional[str] = None
    via_negozio: Optional[str] = None

class BrandManual(BaseModel):
    logo: Optional[str] = None
    colore_principale: Optional[str] = None
    colore_secondario: Optional[str] = None
    colore_terziario: Optional[str] = None
    font_titolo: Optional[str] = None
    font_sottotitolo: Optional[str] = None
    font_descrizioni: Optional[str] = None

class Situazione(BaseModel):
    grafico_img: Optional[str] = None # Per statico
    fatturato: Optional[float] = 0
    spesa_adv: Optional[float] = 0
    # Per dinamico potremmo avere campi extra o logica frontend

class Registrazione(BaseModel):
    id: str
    data: Optional[str] = None
    file_audio: Optional[str] = None
    titolo: Optional[str] = None

class Task(BaseModel):
    id: str
    titolo: str
    status: str
    descrizione: Optional[str] = None
    data_scadenza: Optional[str] = None

class DettagliCliente(BaseModel):
    data_inizio: Optional[str] = None
    data_fine: Optional[str] = None
    referente: Optional[Referente] = None
    canali: List[Canale] = []
    brand_manual: Optional[BrandManual] = None
    situazione_inizio: Optional[Situazione] = None
    situazione_attuale: Optional[Situazione] = None
    obiettivo: Optional[str] = None # "notorieta", "considerazione", "acquisizione", "profitto", "fidelizzazione"
    registrazioni: List[Registrazione] = []
    tasks: List[Task] = []
    stato_umore: Optional[str] = "neutrale" # "triste", "neutrale", "felice"
    note_rapide: Optional[str] = None
    drive_folder_id: Optional[str] = None # ID cartella Google Drive


# --- MODELLI ESISTENTI ---

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
    dettagli: Optional[DettagliCliente] = None # Nuovo campo


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
    dettagli: Optional[DettagliCliente] = None # Nuovo campo
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
