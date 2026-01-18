import type { PagamentoSalvato, MarcaPagatoRequest } from '../types/pagamento';
import { getServiceUrl } from '../utils/apiConfig';

// URL Pagamenti Service - Usa API Gateway unificato
const PAGAMENTI_SERVICE_URL = getServiceUrl('pagamenti');

// Helper per ottenere il token di autenticazione
const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

// Helper per creare headers con autenticazione
const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

// Helper per gestire errori di autenticazione
const handleAuthError = (status: number) => {
  if (status === 401 || status === 403) {
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
  }
};

export const pagamentiApi = {
  /**
   * Recupera la lista unica dei clienti dai pagamenti
   */
  async getClientiUnici(): Promise<string[]> {
    try {
      const response = await fetch(`${PAGAMENTI_SERVICE_URL}/api/pagamenti/clienti`, {
        method: 'GET',
        headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Errore recupero clienti');
      return await response.json();
    } catch (error) {
      console.error('Errore getClientiUnici:', error);
      return [];
    }
  },

  /**
   * Recupera tutti i pagamenti con filtri opzionali
   */
  async getAllPagamenti(filters?: {
      status?: string;
      search?: string;
      limit?: number;
      offset?: number;
      cliente?: string;
      date_from?: string;
      date_to?: string;
  }): Promise<PagamentoSalvato[]> {
    try {
      const queryParams = new URLSearchParams();
      if (filters?.status) queryParams.append('status', filters.status);
      if (filters?.search) queryParams.append('search', filters.search);
      if (filters?.limit) queryParams.append('limit', filters.limit.toString());
      if (filters?.offset) queryParams.append('offset', filters.offset.toString());
      if (filters?.cliente) queryParams.append('cliente', filters.cliente);
      if (filters?.date_from) queryParams.append('date_from', filters.date_from);
      if (filters?.date_to) queryParams.append('date_to', filters.date_to);

      const response = await fetch(`${PAGAMENTI_SERVICE_URL}/api/pagamenti?${queryParams.toString()}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        handleAuthError(response.status);
        throw new Error(`Errore nel recupero dei pagamenti: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Errore nel recupero dei pagamenti:', error);
      throw error;
    }
  },

  /**
   * Recupera i pagamenti di un contratto specifico
   */
  async getPagamentiByContratto(contrattoId: string): Promise<PagamentoSalvato[]> {
    try {
      const response = await fetch(`${PAGAMENTI_SERVICE_URL}/api/pagamenti/contratto/${contrattoId}`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        handleAuthError(response.status);
        throw new Error(`Errore nel recupero dei pagamenti del contratto: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Errore nel recupero dei pagamenti del contratto:', error);
      throw error;
    }
  },

  /**
   * Genera automaticamente i pagamenti da un contratto
   */
  async generaPagamentiDaContratto(contrattoId: string): Promise<{ pagamenti_creati: string[] }> {
    try {
      const response = await fetch(`${PAGAMENTI_SERVICE_URL}/api/pagamenti/genera/${contrattoId}`, {
        method: 'POST',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        handleAuthError(response.status);
        throw new Error(`Errore nella generazione dei pagamenti: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Errore nella generazione dei pagamenti:', error);
      throw error;
    }
  },

  /**
   * Marca un pagamento come pagato
   */
  async marcaPagato(
    pagamentoId: string, 
    request: MarcaPagatoRequest
  ): Promise<{ status: string; message: string }> {
    try {
      const response = await fetch(`${PAGAMENTI_SERVICE_URL}/api/pagamenti/${pagamentoId}/marca-pagato`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        handleAuthError(response.status);
        throw new Error(`Errore nell'aggiornamento del pagamento: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Errore nell\'aggiornamento del pagamento:', error);
      throw error;
    }
  },

  /**
   * Annulla un pagamento già marcato come pagato
   */
  async annullaPagamento(pagamentoId: string): Promise<{ status: string; message: string }> {
    try {
      const response = await fetch(`${PAGAMENTI_SERVICE_URL}/api/pagamenti/${pagamentoId}/annulla-pagamento`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        handleAuthError(response.status);
        throw new Error(`Errore nell'annullamento del pagamento: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Errore nell\'annullamento del pagamento:', error);
      throw error;
    }
  },

  /**
   * Elimina tutti i pagamenti di un contratto
   */
  async deletePagamentiContratto(contrattoId: string): Promise<{ status: string; message: string; deleted_count: number }> {
    try {
      const response = await fetch(`${PAGAMENTI_SERVICE_URL}/api/pagamenti/contratto/${contrattoId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        handleAuthError(response.status);
        throw new Error(`Errore nell'eliminazione dei pagamenti del contratto: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Errore nell\'eliminazione dei pagamenti del contratto:', error);
      throw error;
    }
  },

  /**
   * Elimina un pagamento
   */
  async deletePagamento(pagamentoId: string): Promise<void> {
    try {
      const response = await fetch(`${PAGAMENTI_SERVICE_URL}/api/pagamenti/${pagamentoId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        handleAuthError(response.status);
        throw new Error(`Errore nell'eliminazione del pagamento: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Errore nell\'eliminazione del pagamento:', error);
      throw error;
    }
  },

  /**
   * Gestisce i pagamenti quando un contratto viene rescisso
   * Elimina solo i pagamenti non pagati, preserva quelli pagati
   */
  async gestisciPagamentiRescisso(contrattoId: string): Promise<{
    status: string;
    message: string;
    deleted_count: number;
    preserved_count: number;
    contratto_numero: string;
  }> {
    try {
      const response = await fetch(`${PAGAMENTI_SERVICE_URL}/api/pagamenti/contratto/${contrattoId}/rescisso`, {
        method: 'PUT',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        handleAuthError(response.status);
        throw new Error(`Errore nella gestione pagamenti rescisso: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Errore nella gestione pagamenti rescisso:', error);
      throw error;
    }
  }
};

export default pagamentiApi;

