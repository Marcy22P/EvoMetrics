import type { ContrattoData } from '../types/contratto';

// URL Contratti Service - Usa API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
const CONTRATTI_SERVICE_URL = import.meta.env.VITE_CONTRATTI_SERVICE_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:10000'
    : window.location.origin);

// Funzione per ottenere il token di autenticazione
const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

// Funzione per gestire errori di autenticazione
const handleAuthError = (response: Response) => {
  if (response.status === 401) {
    // Token scaduto o non valido
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
    return;
  }
};

// Funzione per fare richieste autenticate
const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
  const token = getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    handleAuthError(response);
    let errorData: { detail?: string } = {};
    try {
      const text = await response.text();
      if (text) {
        errorData = JSON.parse(text);
      }
    } catch (parseError) {
      // Se non è JSON valido, usa il testo come messaggio
      errorData = { detail: `HTTP error! status: ${response.status}` };
    }
    throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
  }

  // Gestisci il parsing JSON in modo sicuro
  try {
    const text = await response.text();
    if (!text || text.trim() === '') {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (jsonError) {
      // Se il parsing JSON fallisce, potrebbe essere un errore HTML o altro
      console.error('Errore nel parsing JSON della risposta:', jsonError);
      console.error('Testo della risposta:', text.substring(0, 200));
      throw new Error(`Risposta non valida dal server: ${text.substring(0, 100)}`);
    }
  } catch (error) {
    // Se anche il text() fallisce, rilancia l'errore originale
    throw error;
  }
};

// API per i contratti
export const contrattiApi = {
  // Ottieni tutti i contratti
  async getContratti(): Promise<ContrattoData[]> {
    try {
      const response = await authenticatedFetch(`${CONTRATTI_SERVICE_URL}/api/contratti`);
      // Il backend restituisce {"contratti": [...]}
      if (response && typeof response === 'object') {
        if (Array.isArray(response)) {
          return response;
        }
        if (response.contratti && Array.isArray(response.contratti)) {
          return response.contratti;
        }
      }
      return [];
    } catch (error) {
      console.error('Errore nel caricamento dei contratti:', error);
      throw error;
    }
  },

  // Crea un nuovo contratto
  async createContratto(contratto: ContrattoData): Promise<ContrattoData> {
    try {
      const response = await authenticatedFetch(`${CONTRATTI_SERVICE_URL}/api/contratti`, {
        method: 'POST',
        body: JSON.stringify(contratto),
      });
      return response;
    } catch (error) {
      console.error('Errore nella creazione del contratto:', error);
      throw error;
    }
  },

  // Aggiorna un contratto esistente
  async updateContratto(contrattoId: string, contratto: ContrattoData): Promise<ContrattoData> {
    try {
      const response = await authenticatedFetch(`${CONTRATTI_SERVICE_URL}/api/contratti/${contrattoId}`, {
        method: 'PUT',
        body: JSON.stringify(contratto),
      });
      return response;
    } catch (error) {
      console.error('Errore nell\'aggiornamento del contratto:', error);
      throw error;
    }
  },

  // Aggiorna solo lo status di un contratto
  async updateContrattoStatus(contrattoId: string, status: string): Promise<{ message: string; contratto_id: string; old_status: string; new_status: string }> {
    try {
      const response = await authenticatedFetch(`${CONTRATTI_SERVICE_URL}/api/contratti/${contrattoId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      return response;
    } catch (error) {
      console.error('Errore nell\'aggiornamento dello status del contratto:', error);
      throw error;
    }
  },

  // Elimina un contratto
  async deleteContratto(contrattoId: string): Promise<{ status: string; message: string; deleted_id: string; numero: string }> {
    try {
      const response = await authenticatedFetch(`${CONTRATTI_SERVICE_URL}/api/contratti/${contrattoId}`, {
        method: 'DELETE',
      });
      return response;
    } catch (error) {
      console.error('Errore nell\'eliminazione del contratto:', error);
      throw error;
    }
  },
};

export default contrattiApi;
