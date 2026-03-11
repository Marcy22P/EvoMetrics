import os
import json
import io
import pickle
from pathlib import Path
from typing import List, Dict, Any, Optional
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload, MediaIoBaseDownload

# Scopes richiesti
SCOPES = ['https://www.googleapis.com/auth/drive']

class DriveService:
    def __init__(self):
        # Determina path assoluto per token.pickle per evitare errori di CWD
        self.token_path = Path(__file__).parent / 'token.pickle'
        self.creds = None
        self.service = None
        self.auth_type = 'oauth'
        # Non autentichiamo subito nel costruttore per evitare blocchi
        self._authenticate() 

    def _authenticate(self):
        """Autentica usando SOLO OAuth 2.0 User Flow (Persistente)"""
        print(f"🔍 DRIVE AUTH: Inizio procedura di autenticazione OAuth... (Token path: {self.token_path})")
        self.creds = None
        
        # Carica token salvato
        self._load_stored_credentials()

        if self.creds:
            try:
                self.service = build('drive', 'v3', credentials=self.creds)
                print(f"✅ DRIVE AUTH: Service build completato (OAuth)")
            except Exception as e:
                print(f"❌ DRIVE AUTH: Errore build service: {e}")
                self.service = None
        else:
             print("⚠️ DRIVE AUTH: Nessun token trovato. Richiesto login manuale.")

    def _load_stored_credentials(self):
        """Carica credenziali OAuth utente salvate"""
        if self.token_path.exists():
            try:
                with open(self.token_path, 'rb') as token:
                    self.creds = pickle.load(token)
                
                # Prova refresh se scaduto
                if self.creds and self.creds.expired and self.creds.refresh_token:
                    try:
                        print("🔄 DRIVE AUTH: Refreshing expired token...")
                        self.creds.refresh(Request())
                        with open(self.token_path, 'wb') as token:
                            pickle.dump(self.creds, token)
                        print("✅ DRIVE AUTH: Token refreshed e salvato.")
                    except Exception as e:
                        print(f"⚠️ Errore refresh token: {e}")
                        self.creds = None
                
                if self.creds and self.creds.valid:
                    self.auth_type = 'oauth'
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
        
        # Salva token nel path assoluto
        try:
            with open(self.token_path, 'wb') as token:
                pickle.dump(self.creds, token)
            print(f"✅ Google Drive Service: Token salvato in {self.token_path}")
        except Exception as e:
            print(f"❌ ERRORE CRITICO SALVATAGGIO TOKEN: {e}")
            
        self.service = build('drive', 'v3', credentials=self.creds)
        print("✅ Google Drive Service autenticato con successo")

    def is_ready(self) -> bool:
        return self.service is not None

    def list_files(self, folder_id: str = None, query_term: str = None) -> List[Dict[str, Any]]:
        """Elenca file e cartelle in una specifica cartella o cerca per nome"""
        if not self.is_ready():
            return []

        # Costruzione query base
        query_parts = ["trashed = false"]

        if folder_id:
            query_parts.append(f"'{folder_id}' in parents")
        elif not query_term:
             # Se non c'è folder e non c'è ricerca, mostra root/shared
             query_parts.append("( 'root' in parents or sharedWithMe = true )")
        
        if query_term:
            # Escape semplice per evitare injection banali
            safe_term = query_term.replace("'", "\\'")
            query_parts.append(f"name contains '{safe_term}'")

        query = " and ".join(query_parts)
        
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
            import traceback
            traceback.print_exc()
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
            import traceback
            traceback.print_exc()
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
                fields="id, name, mimeType, parents, webViewLink, thumbnailLink, webContentLink, size"
            ).execute()
            return file
        except Exception as e:
            print(f"❌ Drive get_file_metadata error: {e}")
            return None

    def download_file_stream(self, file_id: str):
        """Scarica file come stream (intero file in memoria)"""
        if not self.is_ready():
            raise Exception("Drive service not ready")
            
        try:
            # Get metadata first
            meta = self.get_file_metadata(file_id)
            if not meta:
                raise Exception("File not found")
                
            request = self.service.files().get_media(fileId=file_id)
            file_io = io.BytesIO()
            downloader = MediaIoBaseDownload(file_io, request)
            
            done = False
            while done is False:
                status, done = downloader.next_chunk()
                
            file_io.seek(0)
            return file_io, meta.get('mimeType'), meta.get('name')
        except Exception as e:
            print(f"❌ Drive download error: {e}")
            raise e

    def download_file_range(self, file_id: str, start: int = 0, end: int = None):
        """
        Scarica un range di byte di un file da Drive.
        Supporta Range Requests per streaming video efficiente.
        Ritorna (bytes_data, total_size, content_type, filename).
        """
        if not self.is_ready():
            raise Exception("Drive service not ready")

        try:
            meta = self.get_file_metadata(file_id)
            if not meta:
                raise Exception("File not found")

            total_size = int(meta.get('size', 0))
            content_type = meta.get('mimeType', 'application/octet-stream')
            filename = meta.get('name', 'file')

            if total_size == 0:
                # Google Docs/Sheets non hanno size, fallback a download completo
                stream, ct, fn = self.download_file_stream(file_id)
                data = stream.read()
                return data, len(data), ct, fn

            # Calcola range effettivo
            if end is None or end >= total_size:
                end = total_size - 1

            # Chunk non troppo grande (max 10MB per request)
            chunk_size = min(end - start + 1, 10 * 1024 * 1024)
            actual_end = start + chunk_size - 1

            # Download con header Range
            request = self.service.files().get_media(fileId=file_id)
            request.headers['Range'] = f'bytes={start}-{actual_end}'

            file_io = io.BytesIO()
            downloader = MediaIoBaseDownload(file_io, request, chunksize=chunk_size)

            done = False
            while not done:
                dl_status, done = downloader.next_chunk()

            file_io.seek(0)
            return file_io.read(), total_size, content_type, filename

        except Exception as e:
            print(f"❌ Drive range download error: {e}")
            # Fallback: scarica tutto e ritorna il range richiesto
            try:
                stream, ct, fn = self.download_file_stream(file_id)
                data = stream.read()
                total = len(data)
                if end is None:
                    end = total - 1
                return data[start:end + 1], total, ct, fn
            except Exception as e2:
                print(f"❌ Drive range download fallback error: {e2}")
                raise e2

    def share_file(self, file_id: str, user_email: str, role: str = "reader") -> Optional[Dict[str, Any]]:
        """
        Condivide un file con un utente specifico.
        role: 'reader', 'writer', 'commenter'
        """
        if not self.is_ready():
            return None
        
        try:
            permission = {
                'type': 'user',
                'role': role,
                'emailAddress': user_email
            }
            
            result = self.service.permissions().create(
                fileId=file_id,
                body=permission,
                fields='id'
            ).execute()
            
            print(f"✅ File {file_id} condiviso con {user_email} (ruolo: {role})")
            return result
        except Exception as e:
            print(f"❌ Drive share_file error: {e}")
            import traceback
            traceback.print_exc()
            return None

# Singleton instance
drive_service = DriveService()
