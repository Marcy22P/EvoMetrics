// URL User Service - Usa API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
const USER_SERVICE_URL =
  import.meta.env.VITE_USER_SERVICE_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:10000'
    : window.location.origin);

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
  google_id?: string | null;
  google_email?: string | null;
  pending_approval?: boolean;
  rejection_reason?: string | null;
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
        return data;
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

  // Aggiorna ruolo utente
  async updateUserRole(userId: number, role: string): Promise<{ status: string; user_id: number; role: string }> {
    try {
      const response = await fetch(`${USER_SERVICE_URL}/api/users/${userId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ role }),
      });

      handleAuthError(response);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Errore nell\'aggiornamento ruolo');
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nell\'aggiornamento ruolo:', error);
      throw error;
    }
  },

  // Aggiorna stato utente (attivo/non attivo)
  async updateUserStatus(userId: number, isActive: boolean): Promise<{ status: string; user_id: number; is_active: boolean }> {
    try {
      const response = await fetch(`${USER_SERVICE_URL}/api/users/${userId}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ is_active: isActive }),
      });

      handleAuthError(response);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Errore nell\'aggiornamento stato');
      }

      return await response.json();
    } catch (error) {
      console.error('Errore nell\'aggiornamento stato:', error);
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
};

export default usersApi;

