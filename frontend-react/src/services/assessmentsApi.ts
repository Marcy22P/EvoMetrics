import type { AssessmentResponse } from '../types/assessment';

// URL Assessments Service - Usa API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
const ASSESSMENTS_SERVICE_URL = import.meta.env.VITE_ASSESSMENTS_SERVICE_URL ||
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

// API per gli assessment
export const assessmentsApi = {
  // Ottieni tutti gli assessment
  async getAssessments(): Promise<AssessmentResponse[]> {
    try {
      const response = await authenticatedFetch(`${ASSESSMENTS_SERVICE_URL}/api/assessments`);
      // Il backend restituisce {"assessments": [...]}
      if (response && typeof response === 'object') {
        if (Array.isArray(response)) {
          return response;
        }
        if (response.assessments && Array.isArray(response.assessments)) {
          return response.assessments;
        }
      }
      return [];
    } catch (error) {
      console.error('Errore nel caricamento degli assessment:', error);
      throw error;
    }
  },

  // Ottieni un assessment specifico
  async getAssessment(assessmentId: string): Promise<AssessmentResponse> {
    try {
      const response = await authenticatedFetch(`${ASSESSMENTS_SERVICE_URL}/api/assessments/${assessmentId}`);
      return response;
    } catch (error) {
      console.error('Errore nel caricamento dell\'assessment:', error);
      throw error;
    }
  },

  // Elimina un assessment
  async deleteAssessment(assessmentId: string): Promise<{ message: string }> {
    try {
      const response = await authenticatedFetch(`${ASSESSMENTS_SERVICE_URL}/api/assessments/${assessmentId}`, {
        method: 'DELETE',
      });
      return response;
    } catch (error) {
      console.error('Errore nell\'eliminazione dell\'assessment:', error);
      throw error;
    }
  },

  // Invia assessment tramite webhook (pubblico, senza autenticazione)
  async submitAssessment(formData: Record<string, any>): Promise<{ status: string; message: string; id?: string }> {
    try {
      const response = await fetch(`${ASSESSMENTS_SERVICE_URL}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nell\'invio dell\'assessment:', error);
      throw error;
    }
  },
};

export default assessmentsApi;


