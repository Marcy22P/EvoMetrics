// URL User Service - Usa API Gateway unificato
import { getServiceUrl } from '../utils/apiConfig';

const USER_SERVICE_URL = getServiceUrl('user');

// URL monolite per operazioni che richiedono password hashing (temporaneo, da spostare in Auth Service)
// const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'; // Non più utilizzato

const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

const getAuthHeaders = (): HeadersInit => {
  const token = getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

const handleAuthError = (response: Response) => {
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
  }
};

export interface User {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  nome?: string | null;
  cognome?: string | null;
  google_id?: string | null;
  google_email?: string | null;
  pending_approval?: boolean;
  rejection_reason?: string | null;
  job_title?: string | null;
  is_google_calendar_connected?: boolean;
  google_calendar_email?: string | null;
}

interface UserPermissions {
  permissions: Record<string, boolean>;
}

interface CreateUserData {
  username: string;
  password?: string;  // Password opzionale
  role: string;
}

export const usersApi = {
  // Ottieni lista utenti (richiede admin)
  async getUsers(): Promise<User[]> {
    try {
      console.log('🔍 [usersApi] Chiamata GET a:', `${USER_SERVICE_URL}/api/users`);
      const response = await fetch(`${USER_SERVICE_URL}/api/users`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      console.log('🔍 [usersApi] Risposta status:', response.status);
      handleAuthError(response);

      if (!response.ok) {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          console.error('❌ [usersApi] Errore:', errorData);
          throw new Error(errorData.detail || 'Errore nel caricamento utenti');
        } else {
          const text = await response.text();
          console.error('❌ [usersApi] Risposta non JSON:', text.substring(0, 200));
          throw new Error(`Errore HTTP ${response.status}: ${response.statusText}`);
        }
      }

      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        console.log('✅ [usersApi] Utenti ricevuti:', data.length);
        
        // Filtra account di sistema (superadmin, backup) come richiesto
        const filteredData = data.filter((u: User) => {
            const lowerName = u.username.toLowerCase();
            return !lowerName.includes('superadmin') && !lowerName.includes('backup');
        });

        return filteredData;
      } else {
        const text = await response.text();
        console.error('❌ [usersApi] Risposta non JSON:', text.substring(0, 200));
        throw new Error('Risposta del server non valida (non JSON)');
      }
    } catch (error) {
      console.error('❌ [usersApi] Errore nel caricamento utenti:', error);
      throw error;
    }
  },

  // Crea nuovo utente
  async createUser(userData: CreateUserData): Promise<User> {
    try {
      const response = await fetch(`${USER_SERVICE_URL}/api/users`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(userData),
      });

      handleAuthError(response);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Errore nella creazione utente');
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nella creazione utente:', error);
      throw error;
    }
  },

  // Aggiorna dettagli utente (inclusi ruolo specifico e stato)
  async updateUser(userId: number, data: { role?: string; is_active?: boolean; job_title?: string }): Promise<User> {
    try {
      const response = await fetch(`${USER_SERVICE_URL}/api/users/${userId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });

      handleAuthError(response);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Errore nell\'aggiornamento utente');
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nell\'aggiornamento utente:', error);
      throw error;
    }
  },

  // Ottieni permessi utente
  async getUserPermissions(userId: number): Promise<UserPermissions> {
    try {
      const response = await fetch(`${USER_SERVICE_URL}/api/users/${userId}/permissions`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      handleAuthError(response);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Errore nel caricamento permessi');
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nel caricamento permessi:', error);
      throw error;
    }
  },

  // Aggiorna permessi utente
  async updateUserPermissions(userId: number, permissions: Record<string, boolean>): Promise<UserPermissions> {
    try {
      const response = await fetch(`${USER_SERVICE_URL}/api/users/${userId}/permissions`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ permissions }),
      });

      handleAuthError(response);

      if (!response.ok) {
        let errorMessage = 'Errore nell\'aggiornamento permessi';
        try {
          const errorData = await response.json();
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch (e) {
          // Se la risposta non è JSON, usa il testo della risposta
          errorMessage = await response.text() || errorMessage;
        }
        throw new Error(errorMessage);
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nell\'aggiornamento permessi:', error);
      throw error;
    }
  },

  // Elimina utente
  async deleteUser(userId: number): Promise<{ status: string; message: string; user_id: number }> {
    try {
      const response = await fetch(`${USER_SERVICE_URL}/api/users/${userId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });

      handleAuthError(response);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Errore nell\'eliminazione utente');
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nell\'eliminazione utente:', error);
      throw error;
    }
  },

  // Approva utente
  async approveUser(userId: number): Promise<{ status: string; message: string; user_id: number }> {
    try {
      const response = await fetch(`${USER_SERVICE_URL}/api/users/${userId}/approve`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });

      handleAuthError(response);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Errore nell\'approvazione utente');
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nell\'approvazione utente:', error);
      throw error;
    }
  },

  // Rifiuta utente
  async rejectUser(userId: number, reason?: string): Promise<{ status: string; message: string; user_id: number }> {
    try {
      const response = await fetch(`${USER_SERVICE_URL}/api/users/${userId}/reject`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: reason || null }),
      });

      handleAuthError(response);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Errore nel rifiuto utente');
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nel rifiuto utente:', error);
      throw error;
    }
  },

  // Aggiorna password utente
  async updateUserPassword(userId: number, password: string): Promise<{ status: string; message: string; user_id: number }> {
    try {
      const response = await fetch(`${USER_SERVICE_URL}/api/users/${userId}/password`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ password }),
      });

      handleAuthError(response);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Errore nell\'aggiornamento password');
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nell\'aggiornamento password:', error);
      throw error;
    }
  },

  // Google Calendar Auth
  async getGoogleCalendarAuthUrl(redirectUri: string): Promise<string> {
    const params = new URLSearchParams({ redirect_uri: redirectUri });
    const response = await fetch(`${USER_SERVICE_URL}/api/auth/google/calendar/url?${params}`, {
        headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to get auth URL');
    const data = await response.json();
    return data.authorization_url;
  },

  async connectGoogleCalendar(code: string, redirectUri: string): Promise<{status: string, connected_email: string}> {
      const response = await fetch(`${USER_SERVICE_URL}/api/auth/google/calendar/connect`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ code, redirect_uri: redirectUri })
      });
      if (!response.ok) throw new Error('Failed to connect Google Calendar');
      return await response.json();
  },

  async disconnectGoogleCalendar(): Promise<void> {
      const response = await fetch(`${USER_SERVICE_URL}/api/auth/google/calendar/disconnect`, {
          method: 'POST',
          headers: getAuthHeaders()
      });
      if (!response.ok) throw new Error('Failed to disconnect Google Calendar');
  },

  async getCalendarEvents(start: Date, end: Date, userId?: number): Promise<any[]> {
    const params = new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString()
    });
    if (userId) params.append('user_id', userId.toString());
    
    const response = await fetch(`${USER_SERVICE_URL}/api/calendar/events?${params}`, {
        headers: getAuthHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch events');
    return await response.json();
  }
};

export default usersApi;

