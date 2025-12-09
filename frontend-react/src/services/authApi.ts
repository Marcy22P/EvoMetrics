/**
 * Auth Service API Client
 * Client per comunicare con il microservizio Auth Service
 */

// URL Auth Service - Usa API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
const AUTH_SERVICE_URL =
  import.meta.env.VITE_AUTH_SERVICE_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:10000'
    : window.location.origin);

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: {
    id: number;
    username: string;
    role: string;
    is_active: boolean;
    created_at: string;
    nome?: string;
    cognome?: string;
    email?: string;
    profile_completed?: boolean;
  };
  createdAt: string;
  updatedAt: string;
  source: string;
}

export interface UserInfo {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
  nome?: string;
  cognome?: string;
  email?: string;
  profile_completed?: boolean;
}

export interface ValidateTokenResponse {
  user_id: number;
  username: string;
  role: string;
  is_active: boolean;
  auth_type: string;
}

class AuthApiService {
  private baseUrl = AUTH_SERVICE_URL;

  /**
   * Login con username e password
   */
  async login(username: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Errore di autenticazione');
    }

    return await response.json();
  }

  /**
   * Ottieni informazioni utente corrente dal token
   */
  async getCurrentUser(token: string): Promise<UserInfo> {
    const response = await fetch(`${this.baseUrl}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Token non valido o scaduto');
      }
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Errore nel recupero dati utente');
    }

    return await response.json();
  }

  /**
   * Valida un token JWT
   */
  async validateToken(token: string): Promise<ValidateTokenResponse> {
    const response = await fetch(`${this.baseUrl}/api/auth/validate-token?token=${encodeURIComponent(token)}`);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Token non valido o scaduto');
      }
      const errorData = await response.json();
      throw new Error(errorData.detail || 'Errore nella validazione del token');
    }

    return await response.json();
  }

  /**
   * Ottieni URL per OAuth Google
   */
  getGoogleOAuthUrl(): string {
    return `${this.baseUrl}/api/auth/google`;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{ status: string; service: string }> {
    const response = await fetch(`${this.baseUrl}/health`);
    if (!response.ok) {
      throw new Error('Auth Service non disponibile');
    }
    return await response.json();
  }
}

export const authApi = new AuthApiService();

