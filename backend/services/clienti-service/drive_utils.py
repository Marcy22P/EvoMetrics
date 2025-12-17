import os
import json
import io
import pickle
from typing import List, Dict, Any, Optional
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

# Scopes richiesti
SCOPES = ['https://www.googleapis.com/auth/drive']

class DriveService:
    def __init__(self):
        self.creds = None
        self.service = None
        self.auth_type = None
        # Non autentichiamo subito nel costruttore per evitare blocchi
        self._authenticate() 

    def _authenticate(self):
        """Autentica usando Service Account (Prioritario) o OAuth 2.0 User Flow"""
        self.creds = None
        self.auth_type = None # 'service_account' o 'oauth'
        
        # 1. Prova Service Account da File
        service_account_path = 'service-account.json'
        # Supporto per path relativo alla root del servizio o assoluto
        if not os.path.exists(service_account_path):
             # Prova a cercare nella directory corrente o parent
             potential_paths = [
                 'service-account.json',
                 'backend/services/clienti-service/service-account.json',
                 '../service-account.json',
                 '../../service-account.json'
             ]
             for p in potential_paths:
                 if os.path.exists(p):
                     service_account_path = p
                     break
        
        if os.path.exists(service_account_path):
            try:
                self.creds = service_account.Credentials.from_service_account_file(
                    service_account_path, scopes=SCOPES
                )
                self.auth_type = 'service_account'
                print(f"✅ Drive: Usando Service Account da {service_account_path}")
            except Exception as e:
                print(f"⚠️ Drive: Errore caricamento Service Account file: {e}")

        # 2. Prova Service Account da Variabile d'Ambiente (JSON Content)
        if not self.creds and os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"):
            try:
                info = json.loads(os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"))
                self.creds = service_account.Credentials.from_service_account_info(
                    info, scopes=SCOPES
                )
                self.auth_type = 'service_account'
                print("✅ Drive: Usando Service Account da ENV")
            except Exception as e:
                print(f"⚠️ Drive: Errore parsing Service Account JSON da ENV: {e}")

        # 3. Fallback a OAuth 2.0 User Token (token.pickle)
        if not self.creds:
            self._load_stored_credentials()

        if self.creds:
            try:
                self.service = build('drive', 'v3', credentials=self.creds)
                print(f"✅ Drive Service inizializzato (Mode: {self.auth_type})")
            except Exception as e:
                print(f"❌ Errore inizializzazione servizio Drive: {e}")
                self.service = None

    def _load_stored_credentials(self):
        """Carica credenziali OAuth utente salvate"""
        token_path = 'token.pickle'
        if os.path.exists(token_path):
            try:
                with open(token_path, 'rb') as token:
                    self.creds = pickle.load(token)
                
                # Prova refresh se scaduto
                if self.creds and self.creds.expired and self.creds.refresh_token:
                    try:
                        self.creds.refresh(Request())
                        with open(token_path, 'wb') as token:
                            pickle.dump(self.creds, token)
                    except Exception as e:
                        print(f"⚠️ Errore refresh token: {e}")
                        self.creds = None
                
                if self.creds and self.creds.valid:
                    self.auth_type = 'oauth'
                    self.service = build('drive', 'v3', credentials=self.creds)
                    print("✅ Google Drive Service inizializzato (Token)")
            except Exception as e:
                print(f"⚠️ Errore caricamento token: {e}")

    def get_auth_url(self, redirect_uri: str) -> str:
        """Genera URL per il login Google (Solo per OAuth User Mode)"""
        client_id = os.environ.get("GOOGLE_CLIENT_ID")
        client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
        
        if not client_id or not client_secret:
            raise Exception("GOOGLE_CLIENT_ID o GOOGLE_CLIENT_SECRET mancanti")

        print(f"DEBUG OAuth: Generating URL with redirect_uri={redirect_uri}") 

        client_config = {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }
        
        flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=redirect_uri
        )
        
        auth_url, _ = flow.authorization_url(prompt='consent', access_type='offline')
        return auth_url

    def complete_auth(self, code: str, redirect_uri: str):
        """Completa il flow OAuth con il codice ricevuto"""
        client_id = os.environ.get("GOOGLE_CLIENT_ID")
        client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
        
        client_config = {
            "web": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        }
        
        flow = Flow.from_client_config(
            client_config,
            scopes=SCOPES,
            redirect_uri=redirect_uri
        )
        
        flow.fetch_token(code=code)
        self.creds = flow.credentials
        
        # Salva token
        with open('token.pickle', 'wb') as token:
            pickle.dump(self.creds, token)
            
        self.service = build('drive', 'v3', credentials=self.creds)
        print("✅ Google Drive Service autenticato con successo")

    def is_ready(self) -> bool:
        return self.service is not None

    def list_files(self, folder_id: str = None) -> List[Dict[str, Any]]:
        """Elenca file e cartelle in una specifica cartella"""
        if not self.is_ready():
            return []

        # Query migliorata per vedere tutto alla prima chiamata
        if folder_id:
             query = f"'{folder_id}' in parents and trashed = false"
        else:
             # Mostra root e cartelle condivise
             query = "( 'root' in parents or sharedWithMe = true ) and trashed = false"
        
        try:
            results = self.service.files().list(
                q=query,
                pageSize=100,
                orderBy="folder,name",
                fields="nextPageToken, files(id, name, mimeType, webViewLink, iconLink, createdTime, size, owners, parents)"
            ).execute()
            return results.get('files', [])
        except Exception as e:
            print(f"❌ Drive list_files error: {e}")
            return []

    def create_folder(self, name: str, parent_id: str = None) -> Optional[str]:
        """Crea una nuova cartella"""
        if not self.is_ready():
            return None

        file_metadata = {
            'name': name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_id:
            file_metadata['parents'] = [parent_id]

        try:
            file = self.service.files().create(
                body=file_metadata,
                fields='id'
            ).execute()
            return file.get('id')
        except Exception as e:
            print(f"❌ Drive create_folder error: {e}")
            return None

    def upload_file(self, file_content: Any, file_name: str, folder_id: str = None, mime_type: str = None) -> Optional[Dict[str, Any]]:
        """
        Carica un file su Drive usando un upload resumable (chunked).
        file_content può essere bytes o un oggetto file-like.
        """
        if not self.is_ready():
            return None

        file_metadata = {'name': file_name}
        if folder_id:
            file_metadata['parents'] = [folder_id]

        # Gestione input: se bytes, avvolgi in BytesIO
        if isinstance(file_content, bytes):
            media_stream = io.BytesIO(file_content)
        else:
            media_stream = file_content # Assume file-like object

        media = MediaIoBaseUpload(
            media_stream,
            mimetype=mime_type or 'application/octet-stream',
            resumable=True,
            chunksize=1024*1024*5 # 5MB chunk size
        )

        try:
            request = self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, name, webViewLink'
            )
            
            response = None
            while response is None:
                status, response = request.next_chunk()
                if status:
                    print(f"Upload progress: {int(status.progress() * 100)}%")
            
            return response
        except Exception as e:
            print(f"❌ Drive upload_file error: {e}")
            return None

    def search_folder(self, name: str, parent_id: str = None) -> Optional[str]:
        """Cerca una cartella per nome"""
        if not self.is_ready():
            return None
            
        query = f"mimeType = 'application/vnd.google-apps.folder' and name = '{name}' and trashed = false"
        if parent_id:
            query += f" and '{parent_id}' in parents"
            
        try:
            results = self.service.files().list(
                q=query,
                pageSize=1,
                fields="files(id, name)"
            ).execute()
            files = results.get('files', [])
            if files:
                return files[0]['id']
            return None
        except Exception as e:
            print(f"❌ Drive search_folder error: {e}")
            return None

    def get_file_metadata(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Ottiene metadati di un file"""
        if not self.is_ready():
            return None
        try:
            file = self.service.files().get(
                fileId=file_id,
                fields="id, name, mimeType, parents, webViewLink"
            ).execute()
            return file
        except Exception as e:
            print(f"❌ Drive get_file_metadata error: {e}")
            return None

# Singleton instance
drive_service = DriveService()
