import httpx
import os
import json
from typing import List, Dict, Any, Optional
from datetime import datetime

class SibillClient:
    def __init__(self):
        # Carica variabili d'ambiente dalla root del progetto
        try:
            from dotenv import load_dotenv
            from pathlib import Path
            current_file = Path(__file__).resolve()
            root_dir = current_file.parent.parent.parent.parent
            env_path = root_dir / ".env"
            if env_path.exists():
                load_dotenv(env_path, override=True)
            else:
                load_dotenv(override=True)
        except ImportError:
            pass
        except Exception:
            pass
        
        # Base URL - OBBLIGATORIO da env, nessun default hardcoded
        self.base_url = os.environ.get("SIBILL_API_URL")
        if not self.base_url:
            raise ValueError("SIBILL_API_URL environment variable is required. Please set it in .env file.")
        
        # Rimuovi spazi e trailing slash
        self.base_url = self.base_url.strip().rstrip('/')
        
        self.token = os.environ.get("SIBILL_API_KEY")
        self.company_id = os.environ.get("SIBILL_COMPANY_ID")
        
        if not self.token:
            raise ValueError("SIBILL_API_KEY environment variable is required")
        
        if not self.company_id:
            raise ValueError("SIBILL_COMPANY_ID environment variable is required")
        
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
            "Accept": "application/json"
        }

    async def _get(self, path: str, params: Optional[Dict] = None) -> Any:
        """Esegue una richiesta GET all'API Sibill"""
        async with httpx.AsyncClient() as client:
            # Assicurati che path inizi con /
            if not path.startswith('/'):
                path = '/' + path
            
            url = f"{self.base_url}{path}"
            try:
                response = await client.get(url, headers=self.headers, params=params, timeout=30.0)
                response.raise_for_status()
                return response.json()
            except httpx.HTTPStatusError as e:
                print(f"❌ Sibill API Error: {e.response.status_code} - {e.response.text}")
                raise
            except Exception as e:
                print(f"❌ Sibill Connection Error: {e}")
                raise

    async def get_accounts(self) -> List[Dict]:
        """
        Recupera i conti bancari per la company.
        Endpoint: GET /api/v1/companies/{company_id}/accounts
        """
        response = await self._get(f"/api/v1/companies/{self.company_id}/accounts")
        # La risposta ha struttura { "data": [...] }
        return response.get("data", []) if isinstance(response, dict) else response

    async def get_transactions(self, date_from: Optional[datetime] = None, limit: Optional[int] = None) -> List[Dict]:
        """
        Recupera tutte le transazioni per la company usando la paginazione.
        Endpoint: GET /api/v1/companies/{company_id}/transactions
        """
        all_transactions = []
        cursor = None
        page_size = 100 # Aumentiamo page size per efficienza se supportato, altrimenti default server
        
        print(f"🔄 Fetching transactions from Sibill (Pagination enabled)...")
        
        while True:
            params = {}
            if cursor:
                params["cursor"] = cursor
            
            # Nota: Sibill potrebbe non supportare page_size custom su transactions, 
            # ma se lo supporta riduce il numero di chiamate
            # params["page_size"] = page_size 

            try:
                response = await self._get(f"/api/v1/companies/{self.company_id}/transactions", params=params)
                
                # Estrai dati e cursore
                page_data = response.get("data", []) if isinstance(response, dict) else response
                page_info = response.get("page", {}) if isinstance(response, dict) else {}
                
                if page_data:
                    all_transactions.extend(page_data)
                    print(f"   - Fetched {len(page_data)} transactions (Total so far: {len(all_transactions)})")
                
                # Check limit globale
                if limit and len(all_transactions) >= limit:
                    all_transactions = all_transactions[:limit]
                    print(f"   - Reached limit of {limit} transactions")
                    break

                # Cursore per prossima pagina
                cursor = page_info.get("cursor")
                if not cursor:
                    break # Fine pagine
                    
            except Exception as e:
                print(f"⚠️ Error during transaction pagination: {e}")
                break
        
        print(f"📊 Total transactions fetched: {len(all_transactions)}")
        return all_transactions

    async def get_documents(self, direction: Optional[str] = None, date_from: Optional[datetime] = None) -> List[Dict]:
        """
        Recupera i documenti (fatture) per la company con paginazione completa.
        Endpoint: GET /api/v1/companies/{company_id}/documents
        
        direction: "ISSUED" per fatture emesse (active), "RECEIVED" per ricevute (passive)
        
        La paginazione viene gestita automaticamente usando il cursor di Sibill.
        """
        all_documents = []
        cursor = None
        page_size = 25  # Default di Sibill
        
        # Loop di paginazione: continua finché c'è un cursor
        while True:
            params = {"page_size": page_size}
            if cursor:
                params["cursor"] = cursor
            
            try:
                response = await self._get(f"/api/v1/companies/{self.company_id}/documents", params=params)
                
                # Estrai dati e cursor dalla risposta
                page_data = response.get("data", []) if isinstance(response, dict) else response
                page_info = response.get("page", {}) if isinstance(response, dict) else {}
                
                if page_data:
                    all_documents.extend(page_data)
                
                # Controlla se c'è un cursor per la prossima pagina
                cursor = page_info.get("cursor")
                if not cursor:
                    break  # Nessun cursor = ultima pagina
                    
            except Exception as e:
                # Se c'è un errore, restituisci almeno quello che abbiamo recuperato finora
                print(f"⚠️ Errore durante paginazione documenti: {e}")
                break
        
        total_count = len(all_documents)
        if total_count == 0:
            print(f"📊 No documents found in Sibill (total: 0)")
            return []
        
        print(f"📊 Found {total_count} total documents from Sibill API")
        
        # Filtra lato client per direction se specificato
        if direction:
            original_count = total_count
            # Salva le direzioni disponibili PRIMA del filtro
            available_directions = set(d.get('direction') for d in all_documents if d.get('direction'))
            # Applica il filtro
            all_documents = [doc for doc in all_documents if doc.get('direction') == direction]
            if len(all_documents) == 0:
                print(f"⚠️ No documents match direction='{direction}'. Available directions: {available_directions}")
            elif original_count > len(all_documents):
                print(f"📊 Filtered by direction '{direction}': {original_count} -> {len(all_documents)} documents")
        
        # Filtra per data se specificato
        if date_from and isinstance(all_documents, list):
            original_count = len(all_documents)
            all_documents = [
                doc for doc in all_documents 
                if doc.get('creation_date') and doc.get('creation_date') >= date_from.strftime("%Y-%m-%d")
            ]
            if original_count > len(all_documents):
                print(f"📊 Filtered by date: {original_count} -> {len(all_documents)} documents")
        
        return all_documents

    async def get_issued_documents(self, date_from: Optional[datetime] = None) -> List[Dict]:
        """Recupera fatture emesse (attive)"""
        return await self.get_documents(direction="ISSUED", date_from=date_from)
        
    async def get_received_documents(self, date_from: Optional[datetime] = None) -> List[Dict]:
        """Recupera fatture ricevute (passive)"""
        return await self.get_documents(direction="RECEIVED", date_from=date_from)
