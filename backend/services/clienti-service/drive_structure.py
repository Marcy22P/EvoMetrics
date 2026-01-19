"""
Modulo per gestione struttura Drive centralizzata WebApp
Gestisce la struttura organizzata: WebApp/Clienti, WebApp/Procedure, WebApp/Preventivi, WebApp/Contratti
"""

from typing import Optional, Dict, Any
from drive_utils import drive_service

# Nome della cartella principale
WEBAPP_FOLDER_NAME = "WebApp"

# Nomi delle sottocartelle
CLIENTI_FOLDER_NAME = "Clienti"
PROCEDURE_FOLDER_NAME = "Procedure"
PREVENTIVI_FOLDER_NAME = "Preventivi"
CONTRATTI_FOLDER_NAME = "Contratti"

class DriveStructureManager:
    """Gestisce la struttura Drive centralizzata WebApp"""
    
    def __init__(self):
        self._webapp_folder_id: Optional[str] = None
        self._clienti_folder_id: Optional[str] = None
        self._procedure_folder_id: Optional[str] = None
        self._preventivi_folder_id: Optional[str] = None
        self._contratti_folder_id: Optional[str] = None
    
    def _ensure_webapp_folder(self) -> Optional[str]:
        """Assicura che la cartella WebApp esista e la restituisce"""
        if self._webapp_folder_id:
            return self._webapp_folder_id
        
        if not drive_service or not drive_service.is_ready():
            print("❌ Drive service non disponibile")
            return None
        
        # Cerca la cartella WebApp
        folder_id = drive_service.search_folder(WEBAPP_FOLDER_NAME)
        
        if not folder_id:
            # Crea la cartella WebApp nella root
            folder_id = drive_service.create_folder(WEBAPP_FOLDER_NAME)
            if folder_id:
                print(f"✅ Cartella WebApp creata: {folder_id}")
            else:
                print("❌ Impossibile creare cartella WebApp")
                return None
        else:
            print(f"✅ Cartella WebApp trovata: {folder_id}")
        
        self._webapp_folder_id = folder_id
        return folder_id
    
    def _ensure_subfolder(self, parent_id: str, folder_name: str, cache_attr: str) -> Optional[str]:
        """Assicura che una sottocartella esista dentro parent_id"""
        cached_id = getattr(self, cache_attr, None)
        if cached_id:
            return cached_id
        
        if not drive_service or not drive_service.is_ready():
            return None
        
        # Cerca la sottocartella
        folder_id = drive_service.search_folder(folder_name, parent_id=parent_id)
        
        if not folder_id:
            # Crea la sottocartella
            folder_id = drive_service.create_folder(folder_name, parent_id=parent_id)
            if folder_id:
                print(f"✅ Cartella {folder_name} creata: {folder_id}")
            else:
                print(f"❌ Impossibile creare cartella {folder_name}")
                return None
        else:
            print(f"✅ Cartella {folder_name} trovata: {folder_id}")
        
        setattr(self, cache_attr, folder_id)
        return folder_id
    
    def initialize_structure(self) -> Dict[str, Optional[str]]:
        """
        Inizializza l'intera struttura WebApp.
        Restituisce un dict con gli ID delle cartelle create/trovate.
        """
        webapp_id = self._ensure_webapp_folder()
        if not webapp_id:
            return {
                "webapp": None,
                "clienti": None,
                "procedure": None,
                "preventivi": None,
                "contratti": None
            }
        
        clienti_id = self._ensure_subfolder(webapp_id, CLIENTI_FOLDER_NAME, "_clienti_folder_id")
        procedure_id = self._ensure_subfolder(webapp_id, PROCEDURE_FOLDER_NAME, "_procedure_folder_id")
        preventivi_id = self._ensure_subfolder(webapp_id, PREVENTIVI_FOLDER_NAME, "_preventivi_folder_id")
        contratti_id = self._ensure_subfolder(webapp_id, CONTRATTI_FOLDER_NAME, "_contratti_folder_id")
        
        return {
            "webapp": webapp_id,
            "clienti": clienti_id,
            "procedure": procedure_id,
            "preventivi": preventivi_id,
            "contratti": contratti_id
        }
    
    def get_clienti_folder_id(self) -> Optional[str]:
        """Restituisce l'ID della cartella Clienti"""
        if self._clienti_folder_id:
            return self._clienti_folder_id
        
        webapp_id = self._ensure_webapp_folder()
        if not webapp_id:
            return None
        
        return self._ensure_subfolder(webapp_id, CLIENTI_FOLDER_NAME, "_clienti_folder_id")
    
    def get_procedure_folder_id(self) -> Optional[str]:
        """Restituisce l'ID della cartella Procedure"""
        if self._procedure_folder_id:
            return self._procedure_folder_id
        
        webapp_id = self._ensure_webapp_folder()
        if not webapp_id:
            return None
        
        return self._ensure_subfolder(webapp_id, PROCEDURE_FOLDER_NAME, "_procedure_folder_id")
    
    def get_preventivi_folder_id(self) -> Optional[str]:
        """Restituisce l'ID della cartella Preventivi"""
        if self._preventivi_folder_id:
            return self._preventivi_folder_id
        
        webapp_id = self._ensure_webapp_folder()
        if not webapp_id:
            return None
        
        return self._ensure_subfolder(webapp_id, PREVENTIVI_FOLDER_NAME, "_preventivi_folder_id")
    
    def get_contratti_folder_id(self) -> Optional[str]:
        """Restituisce l'ID della cartella Contratti"""
        if self._contratti_folder_id:
            return self._contratti_folder_id
        
        webapp_id = self._ensure_webapp_folder()
        if not webapp_id:
            return None
        
        return self._ensure_subfolder(webapp_id, CONTRATTI_FOLDER_NAME, "_contratti_folder_id")
    
    def get_or_create_cliente_folder(self, cliente_name: str, cliente_id: Optional[str] = None) -> Optional[str]:
        """
        Ottiene o crea la cartella per un cliente specifico dentro WebApp/Clienti.
        Restituisce l'ID della cartella cliente.
        """
        clienti_folder_id = self.get_clienti_folder_id()
        if not clienti_folder_id:
            print("❌ Impossibile ottenere cartella Clienti")
            return None
        
        if not drive_service or not drive_service.is_ready():
            return None
        
        # Cerca la cartella del cliente
        folder_id = drive_service.search_folder(cliente_name, parent_id=clienti_folder_id)
        
        if not folder_id:
            # Crea la cartella del cliente
            folder_id = drive_service.create_folder(cliente_name, parent_id=clienti_folder_id)
            if folder_id:
                print(f"✅ Cartella cliente '{cliente_name}' creata: {folder_id}")
            else:
                print(f"❌ Impossibile creare cartella cliente '{cliente_name}'")
                return None
        else:
            print(f"✅ Cartella cliente '{cliente_name}' trovata: {folder_id}")
        
        return folder_id
    
    def clear_cache(self):
        """Pulisce la cache degli ID delle cartelle (utile per testing o refresh)"""
        self._webapp_folder_id = None
        self._clienti_folder_id = None
        self._procedure_folder_id = None
        self._preventivi_folder_id = None
        self._contratti_folder_id = None

# Singleton instance
drive_structure = DriveStructureManager()
