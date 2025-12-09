"""
Pydantic models per Gradimento Service
"""

from pydantic import BaseModel
from typing import Optional


class GradimentoRisposte(BaseModel):
    """Risposte del form di gradimento settimanale"""
    # Anagrafica
    nome: Optional[str] = None
    cognome: Optional[str] = None
    email: Optional[str] = None
    
    # Sezione 1: Cosa hai fatto questa settimana
    cose_principali: str
    lasciato_indietro: str
    soddisfazione_qualita: int
    organizzazione_produttivita: int
    
    # Sezione 2: Ostacoli e miglioramenti
    blocchi_rallentamenti: str
    ostacoli_interni: Optional[str] = None
    difficolta_esterne: Optional[str] = None
    
    # Sezione 3: Collaborazione e comunicazione
    allineamento_team: int
    supporto_chiarezza: Optional[str] = None
    ringraziamenti: Optional[str] = None
    
    # Sezione 4: Prossima settimana
    priorita_prossima_settimana: str
    risorse_necessarie: Optional[str] = None
    
    # Sezione 5: Stato d'animo
    stato_animo: str
    pensiero_libero: Optional[str] = None


class GradimentoSettimanale(BaseModel):
    """Gradimento settimanale completo"""
    id: str
    data_compilazione: str
    risposte: GradimentoRisposte
    created_at: str
    updated_at: str

