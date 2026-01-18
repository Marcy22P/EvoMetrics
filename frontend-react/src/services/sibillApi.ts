// URL Sibill Service - Usa API Gateway unificato
import { getServiceUrl } from '../utils/apiConfig';

const SIBILL_SERVICE_URL = getServiceUrl('sibill');

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

export interface ContoSummary {
  total_balance: number;
  monthly_in: number;
  monthly_out: number;
  iva_credit: number;
  iva_debit: number;
  last_sync: string | null;
}

export interface SibillTransaction {
  id: string;
  account_id: string;
  date: string;
  amount: number;
  description: string | null;
  category: string | null;
  direction: 'in' | 'out';
  account_name?: string;
}

export const sibillApi = {
  /**
   * Recupera i KPI aggregati (Saldo, Entrate, Uscite, IVA)
   */
  async getSummary(): Promise<ContoSummary> {
    try {
      const response = await fetch(`${SIBILL_SERVICE_URL}/api/sibill/summary`, {
        method: 'GET',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        handleAuthError(response.status);
        throw new Error(`Errore nel recupero del summary: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nel recupero del summary:', error);
      throw error;
    }
  },

  /**
   * Avvia la sincronizzazione con Sibill
   */
  async triggerSync(force: boolean = false): Promise<{ status: string; message: string }> {
    try {
      const response = await fetch(`${SIBILL_SERVICE_URL}/api/sibill/sync`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ force })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        handleAuthError(response.status);
        throw new Error(errorData.detail || `Errore nella sync: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nella sync:', error);
      throw error;
    }
  },

  /**
   * Recupera le ultime transazioni
   */
  async getTransactions(limit: number = 50, offset: number = 0): Promise<SibillTransaction[]> {
    try {
      const response = await fetch(
        `${SIBILL_SERVICE_URL}/api/sibill/transactions?limit=${limit}&offset=${offset}`,
        {
          method: 'GET',
          headers: getAuthHeaders()
        }
      );

      if (!response.ok) {
        handleAuthError(response.status);
        throw new Error(`Errore nel recupero delle transazioni: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nel recupero delle transazioni:', error);
      throw error;
    }
  }
};

export default sibillApi;

