// Service Layer per Gradimento
// URL Gradimento Service - Usa API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
const GRADIMENTO_SERVICE_URL = import.meta.env.VITE_GRADIMENTO_SERVICE_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:10000' : window.location.origin);

export interface GradimentoRisposte {
  // Anagrafica
  nome: string;
  cognome: string;
  email: string;
  
  // Sezione 1: Cosa hai fatto questa settimana
  cose_principali: string;
  lasciato_indietro: string;
  soddisfazione_qualita: number;
  organizzazione_produttivita: number;
  
  // Sezione 2: Ostacoli e miglioramenti
  blocchi_rallentamenti: string;
  ostacoli_interni?: string;
  difficolta_esterne?: string;
  
  // Sezione 3: Collaborazione e comunicazione
  allineamento_team: number;
  supporto_chiarezza?: string;
  ringraziamenti?: string;
  
  // Sezione 4: Prossima settimana
  priorita_prossima_settimana: string;
  risorse_necessarie?: string;
  
  // Sezione 5: Stato d'animo
  stato_animo: string;
  pensiero_libero?: string;
}

export interface GradimentoSettimanale {
    id: string;
    data_compilazione: string;
    risposte: GradimentoRisposte;
    created_at: string;
    updated_at: string;
}

class GradimentoApiService {
  private async getAuthHeaders() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      throw new Error('Token di autenticazione non trovato');
    }
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  async salvaGradimento(risposte: GradimentoRisposte): Promise<GradimentoSettimanale> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${GRADIMENTO_SERVICE_URL}/api/gradimento`, {
      method: 'POST',
      headers,
      body: JSON.stringify(risposte),
    });

    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Errore nel salvataggio del gradimento: ${response.status}`;
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

  async getGradimenti(): Promise<GradimentoSettimanale[]> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${GRADIMENTO_SERVICE_URL}/api/gradimento`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `Errore nel caricamento dei gradimenti: ${response.status}`;
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

  async getGradimento(id: string): Promise<GradimentoSettimanale> {
    const headers = await this.getAuthHeaders();
    const response = await fetch(`${GRADIMENTO_SERVICE_URL}/api/gradimento/${id}`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
        const text = await response.text();
        let errorMessage = `Errore nel caricamento del gradimento: ${response.status}`;
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
}

export const gradimentoApi = new GradimentoApiService();
