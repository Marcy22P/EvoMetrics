// Importa ShopifyTestResult da shopifyApi invece di duplicarlo
import type { ShopifyTestResult } from './shopifyApi';

// URL Clienti Service - Usa API Gateway unificato
import { getServiceUrl } from '../utils/apiConfig';

const CLIENTI_SERVICE_URL = getServiceUrl('clienti');

// --- INTERFACCE DETTAGLI CLIENTI ---

export interface Referente {
  nome?: string;
  cognome?: string;
  azienda?: string;
  email?: string;
  telefono?: string;
  file_preventivo?: string;
  file_contratto?: string;
}

export interface Canale {
  id: string;
  url_sito?: string;
  nome_utente?: string;
  password?: string; // Nota: sicurezza
  via_negozio?: string;
}

export interface BrandManual {
  logo?: string;
  colore_principale?: string;
  colore_secondario?: string;
  colore_terziario?: string;
  font_titolo?: string;
  font_sottotitolo?: string;
  font_descrizioni?: string;
}

export interface Situazione {
  grafico_img?: string;
  fatturato?: number;
  spesa_adv?: number;
}

export interface Registrazione {
  id: string;
  data?: string;
  file_audio?: string;
  titolo?: string;
}

export interface Task {
  id: string;
  titolo: string;
  status: 'da_fare' | 'fatto';
  descrizione?: string;
  data_scadenza?: string;
}

export interface DettagliCliente {
  data_inizio?: string;
  data_fine?: string;
  referente?: Referente;
  canali?: Canale[];
  brand_manual?: BrandManual;
  situazione_inizio?: Situazione;
  situazione_attuale?: Situazione;
  obiettivo?: 'notorieta' | 'considerazione' | 'acquisizione' | 'profitto' | 'fidelizzazione';
  registrazioni?: Registrazione[];
  tasks?: Task[];
  stato_umore?: 'triste' | 'neutrale' | 'felice';
  note_rapide?: string;
  drive_folder_id?: string;
}

export interface Cliente {
  id: string;
  nome_azienda: string;
  contatti?: {
    email?: string;
    telefono?: string;
    indirizzo?: string;
  };
  servizi_attivi?: string[];
  integrazioni?: {
    shopify_shop?: string;
    meta_ad_account_id?: string;
  };
  note?: string;
  source?: string;
  source_id?: string;
  dettagli?: DettagliCliente; // Nuovo campo
  created_at: string;
  updated_at: string;
}

export interface ShopifyMetrics {
  total_orders: number;
  total_revenue: number;
  average_order_value: number;
  orders_by_status: Record<string, number>;
  period: {
    start: string;
    end: string;
  };
}

export interface MagicLink {
  id: string;
  cliente_id: string;
  token: string;
  url: string;
  is_active: boolean;
  is_used: boolean;
  expires_at: string;
  revoked_at?: string;
  created_at: string;
  used_at?: string;
  status: 'active' | 'used' | 'expired' | 'revoked';
}

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink: string;
  createdTime?: string;
  size?: string;
}

class ClientiApiService {
  private async getAuthHeaders(isFileUpload = false) {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('Token di autenticazione non trovato');
    }
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
    };
    if (!isFileUpload) {
        headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  async getClienti(): Promise<Cliente[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Errore nel caricamento dei clienti: ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }
    try {
      return await response.json();
    } catch (jsonError) {
      console.error('Errore nel parsing JSON della risposta:', jsonError);
      throw new Error('Risposta del server non valida (non JSON)');
    }
  }

  async getCliente(id: string): Promise<Cliente> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/${id}`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Errore nel caricamento del cliente: ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }
    try {
      return await response.json();
    } catch (jsonError) {
      console.error('Errore nel parsing JSON della risposta:', jsonError);
      throw new Error('Risposta del server non valida (non JSON)');
    }
  }

  async createCliente(cliente: Omit<Cliente, 'id' | 'created_at' | 'updated_at'>): Promise<{ id: string; status: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti`, {
      method: 'POST',
      headers,
      body: JSON.stringify(cliente),
    });
    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Errore nella creazione del cliente: ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }
    try {
      return await response.json();
    } catch (jsonError) {
      console.error('Errore nel parsing JSON della risposta:', jsonError);
      throw new Error('Risposta del server non valida (non JSON)');
    }
  }

  async updateCliente(id: string, cliente: Partial<Cliente>): Promise<{ id: string; status: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(cliente),
    });
    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Errore nell'aggiornamento del cliente: ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }
    try {
      return await response.json();
    } catch (jsonError) {
      console.error('Errore nel parsing JSON della risposta:', jsonError);
      throw new Error('Risposta del server non valida (non JSON)');
    }
  }

  async deleteCliente(id: string): Promise<void> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Errore nell'eliminazione del cliente: ${response.status}`);
    }
  }

  async getImportSources(): Promise<{ preventivi: any[]; contratti: any[] }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/import/sources`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Errore nel caricamento delle fonti: ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }
    try {
      return await response.json();
    } catch (jsonError) {
      console.error('Errore nel parsing JSON della risposta:', jsonError);
      throw new Error('Risposta del server non valida (non JSON)');
    }
  }

  async importCliente(sourceType: 'preventivo' | 'contratto', sourceId: string): Promise<{ id: string; status: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/import`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ source_type: sourceType, source_id: sourceId }),
    });
    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Errore nell'importazione del cliente: ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }
    try {
      return await response.json();
    } catch (jsonError) {
      console.error('Errore nel parsing JSON della risposta:', jsonError);
      throw new Error('Risposta del server non valida (non JSON)');
    }
  }

  async getClienteDocuments(id: string): Promise<{ preventivi: any[], contratti: any[] }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/${id}/documents`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
        throw new Error(`Errore caricamento documenti: ${response.status}`);
    }
    return await response.json();
  }

  async linkContrattoToCliente(contrattoId: string, clienteId: string): Promise<{ status: string }> {
    const headers = await this.getAuthHeaders();
    const CONTRATTI_SERVICE_URL = getServiceUrl('contratti');
    
    const response = await fetch(`${CONTRATTI_SERVICE_URL}/api/contratti/${contrattoId}/link-cliente`, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cliente_id: clienteId }),
    });
    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Errore nel collegamento del contratto: ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        if (text) errorMessage = text;
      }
      throw new Error(errorMessage);
    }
    return await response.json();
  }

  async analyzeDocument(file: File): Promise<{ filename: string, value: number, error?: string }> {
    const headers = await this.getAuthHeaders(true); // true for file upload (no Content-Type: json)
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/documents/analyze`, {
        method: 'POST',
        headers,
        body: formData
    });

    if (!response.ok) {
        const text = await response.text();
        let errorMessage = `Errore analisi: ${response.status}`;
        try {
            const errorData = JSON.parse(text);
            errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
            if (text) errorMessage = text;
        }
        return { filename: file.name, value: 0, error: errorMessage };
    }
    return await response.json();
  }

  // --- GOOGLE DRIVE METHODS ---

  async initDriveFolder(clienteId: string): Promise<{ folder_id: string, folder_url: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/${clienteId}/drive/init`, {
        method: 'POST',
        headers
    });
    if (!response.ok) {
        throw new Error(`Errore init drive: ${response.status}`);
    }
    return await response.json();
  }

  async listDriveFiles(clienteId: string, folderId?: string): Promise<{ files: DriveFile[], current_folder_id: string, message?: string }> {
    const headers = await this.getAuthHeaders();
    let url = `${CLIENTI_SERVICE_URL}/api/clienti/${clienteId}/drive/files`;
    if (folderId) url += `?folder_id=${folderId}`;
    
    const response = await fetch(url, {
        method: 'GET',
        headers
    });
    if (!response.ok) {
        throw new Error(`Errore listing drive: ${response.status}`);
    }
    return await response.json();
  }

  async uploadDriveFile(clienteId: string, file: File, folderId?: string): Promise<DriveFile> {
    const headers = await this.getAuthHeaders(true);
    const formData = new FormData();
    formData.append('file', file);
    if (folderId) formData.append('folder_id', folderId);

    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/${clienteId}/drive/upload`, {
        method: 'POST',
        headers,
        body: formData
    });
    
    if (!response.ok) {
        throw new Error(`Errore upload drive: ${response.status}`);
    }
    return await response.json();
  }

  async createDriveFolder(clienteId: string, name: string, parentId: string): Promise<DriveFile> {
      const headers = await this.getAuthHeaders(true); // Uso multipart/form-data
      const formData = new FormData();
      formData.append('name', name);
      formData.append('parent_id', parentId);

      const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/${clienteId}/drive/folder`, {
          method: 'POST',
          headers,
          body: formData
      });

      if (!response.ok) {
          throw new Error(`Errore creazione cartella: ${response.status}`);
      }
      return await response.json();
  }

  // NOTA: I metodi Shopify sono stati spostati in shopifyApi.ts
  // Questi metodi sono mantenuti per retrocompatibilità ma deprecati
  // Usa shopifyApi.connectShopify(), shopifyApi.getShopifyMetrics(), shopifyApi.testShopifyConnection()
  async connectShopify(clienteId: string, shop: string): Promise<void> {
    // Deprecato: usa shopifyApi.connectShopify() invece
    const { shopifyApi } = await import('./shopifyApi');
    return shopifyApi.connectShopify(clienteId, shop);
  }

  async getShopifyMetrics(
    clienteId: string,
    startDate?: string,
    endDate?: string
  ): Promise<ShopifyMetrics> {
    // Deprecato: usa shopifyApi.getShopifyMetrics() invece
    const { shopifyApi } = await import('./shopifyApi');
    return shopifyApi.getShopifyMetrics(clienteId, startDate, endDate);
  }

  async testShopifyConnection(clienteId: string): Promise<ShopifyTestResult> {
    // Deprecato: usa shopifyApi.testShopifyConnection() invece
    const { shopifyApi } = await import('./shopifyApi');
    return shopifyApi.testShopifyConnection(clienteId);
  }

  async createMagicLink(clienteId: string): Promise<MagicLink> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/${clienteId}/magic-link`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Errore nella creazione del magic link: ${response.status}`);
    }
    const data = await response.json();
    // Il backend restituisce CreateMagicLinkResponse, ma il frontend si aspetta MagicLink
    // Convertiamo aggiungendo i campi mancanti
    return {
      id: data.id,
      cliente_id: clienteId,
      token: data.token,
      url: data.url,
      is_active: data.is_active,
      is_used: false,
      expires_at: data.expires_at,
      created_at: new Date().toISOString(),
      status: 'active'
    } as MagicLink;
  }

  async getMagicLinks(clienteId: string): Promise<MagicLink[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/clienti/${clienteId}/magic-links`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Errore nel caricamento dei magic links: ${response.status}`);
    }
    const links = await response.json();
    // Aggiungi campo status se mancante
    return links.map((link: any) => ({
      ...link,
      status: link.status || (link.revoked_at ? 'revoked' : link.is_used ? 'used' : new Date(link.expires_at) < new Date() ? 'expired' : 'active')
    }));
  }

  async revokeMagicLink(linkId: string): Promise<void> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/magic-links/${linkId}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Errore nella revoca del magic link: ${response.status}`);
    }
  }

  // --- Drive Structure Management ---

  async initDriveStructure(): Promise<{
    status: string;
    message: string;
    folders: {
      webapp: { id: string; url: string | null };
      clienti: { id: string; url: string | null };
      procedure: { id: string; url: string | null };
      preventivi: { id: string; url: string | null };
      contratti: { id: string; url: string | null };
    };
  }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/structure/init`, {
      method: 'POST',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Errore inizializzazione struttura Drive: ${response.status}`);
    }
    return await response.json();
  }

  async getDriveStructure(): Promise<{
    folders: {
      webapp: { id: string; url: string | null };
      clienti: { id: string; url: string | null };
      procedure: { id: string; url: string | null };
      preventivi: { id: string; url: string | null };
      contratti: { id: string; url: string | null };
    };
  }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/structure`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Errore recupero struttura Drive: ${response.status}`);
    }
    return await response.json();
  }

  async exportPreventivoToDrive(preventivoId: string, preventivoData: any): Promise<{
    status: string;
    message: string;
    file: { id: string; name: string; url: string };
  }> {
    const headers = await this.getAuthHeaders(true);
    const formData = new FormData();
    formData.append('preventivo_id', preventivoId);
    formData.append('preventivo_data', JSON.stringify(preventivoData));

    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/export/preventivo`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Errore esportazione preventivo: ${response.status}`);
    }
    return await response.json();
  }

  async exportContrattoToDrive(contrattoId: string, contrattoData: any): Promise<{
    status: string;
    message: string;
    file: { id: string; name: string; url: string };
  }> {
    const headers = await this.getAuthHeaders(true);
    const formData = new FormData();
    formData.append('contratto_id', contrattoId);
    formData.append('contratto_data', JSON.stringify(contrattoData));

    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/export/contratto`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Errore esportazione contratto: ${response.status}`);
    }
    return await response.json();
  }

  // --- Procedure Management ---

  async listProcedure(): Promise<{ files: any[]; folder_id: string }> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/procedure`, {
      method: 'GET',
      headers,
    });
    if (!response.ok) {
      throw new Error(`Errore listing procedure: ${response.status}`);
    }
    return await response.json();
  }

  async uploadProcedure(file: File): Promise<{
    status: string;
    message: string;
    file: { id: string; name: string; url: string };
  }> {
    const headers = await this.getAuthHeaders(true);
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/procedure/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Errore upload procedura: ${response.status}`);
    }
    return await response.json();
  }

  async shareProcedure(fileId: string, userEmail: string, role: 'reader' | 'writer' | 'commenter' = 'reader'): Promise<{
    status: string;
    message: string;
    permission_id: string;
  }> {
    const headers = await this.getAuthHeaders(true);
    const formData = new FormData();
    formData.append('file_id', fileId);
    formData.append('user_email', userEmail);
    formData.append('role', role);

    const response = await fetch(`${CLIENTI_SERVICE_URL}/api/drive/procedure/share`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Errore condivisione procedura: ${response.status}`);
    }
    return await response.json();
  }
}

export const clientiApi = new ClientiApiService();
