import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../services/authApi';

interface User {
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

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
  permissions: Record<string, boolean>;
  hasPermission: (key: string) => boolean;
  verifyToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  const loadPermissions = useCallback(async (tok: string, userId: number) => {
    try {
      // Usa User Service per i permessi - API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
      const USER_SERVICE_URL =
        import.meta.env.VITE_USER_SERVICE_URL ||
        (window.location.hostname === 'localhost'
          ? 'http://localhost:10000'
          : window.location.origin);
      
      const resp = await fetch(`${USER_SERVICE_URL}/api/users/${userId}/permissions`, {
        headers: { 
          'Authorization': `Bearer ${tok}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!resp.ok) {
        // Se fallisce, usa permessi vuoti (non bloccare il flusso)
        console.warn('⚠️ [useAuth] Impossibile caricare permessi, uso permessi vuoti');
        setPermissions({});
        return;
      }
      
      const data = await resp.json();
      // Il User Service ritorna { user_id, role, permissions, has_all_access }
      const perms = (data && data.permissions) || {};
      setPermissions(perms);
    } catch (e) {
      // In caso di errore, usa permessi vuoti (non bloccare il flusso)
      console.error('❌ [useAuth] Errore nel caricamento permessi:', e);
      setPermissions({});
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    setPermissions({});
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }, []);

  const verifyToken = useCallback(async (tokenToVerify: string) => {
    try {
      // Assicurati che il token sia impostato nello stato
      setToken(tokenToVerify);
      
      // Usa Auth Service invece del monolite
      const userData = await authApi.getCurrentUser(tokenToVerify);
      
      if (userData && userData.id !== undefined && userData.id !== null) {
        // Validazione flessibile per id
        const userId = typeof userData.id === 'number' ? userData.id : parseInt(String(userData.id), 10);
        if (isNaN(userId)) {
          setLoading(false);
          logout();
          return;
        }
        
        const validUser = {
          ...userData,
          id: userId
        };
        
        setUser(validUser);
        localStorage.setItem('auth_user', JSON.stringify(validUser));
        // carica permessi (non bloccare se fallisce)
        await loadPermissions(tokenToVerify, userId);
        setLoading(false);
      } else {
        setLoading(false);
        logout();
      }
    } catch (error) {
      console.error('Errore nella verifica del token:', error);
      setLoading(false);
      logout();
    }
  }, [logout, loadPermissions]);

  const login = useCallback(async (username: string, password: string): Promise<void> => {
    try {
      // Usa Auth Service invece del monolite
      const data = await authApi.login(username, password);
      
      if (!data || !data.user) {
        throw new Error('Dati utente non validi: user mancante');
      }
      
      // Validazione flessibile per id
      const userId: any = data.user.id;
      if (userId === undefined || userId === null || (typeof userId === 'string' && userId === '')) {
        throw new Error('ID utente non valido');
      }
      
      // Assicurati che l'id sia un numero (converti se necessario)
      let numericId: number;
      if (typeof userId === 'number') {
        numericId = userId;
      } else if (typeof userId === 'string') {
        numericId = parseInt(userId, 10);
      } else {
        numericId = Number(userId);
      }
      
      if (isNaN(numericId) || !isFinite(numericId)) {
        throw new Error(`ID utente non valido: ${userId}`);
      }
      
      const validUser = {
        ...data.user,
        id: numericId
      };
      
      setToken(data.access_token);
      setUser(validUser);
      
      // Salva nei localStorage
      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('auth_user', JSON.stringify(validUser));
      
      // carica permessi (non bloccare se fallisce)
      await loadPermissions(data.access_token, validUser.id);
      
    } catch (error) {
      console.error('Errore nel login:', error);
      throw error;
    }
  }, [loadPermissions]);

  const hasPermission = useCallback((key: string) => {
    // Il Superadmin ha sempre accesso a tutto
    if (user?.role === 'superadmin') return true;
    
    // Se l'utente ha il permesso "wildcard" globale
    if (permissions['__all__']) return true;
    
    // Admin ha permessi impliciti su molte cose se non specificato diversamente, 
    // ma per sicurezza controlliamo la mappa permessi. 
    // Nel tuo caso specifico, sembra che l'Admin debba poter fare tutto nel Task Manager.
    if (user?.role === 'admin') return true;

    return !!permissions[key];
  }, [user, permissions]);

  // Verifica token salvato al caricamento (solo una volta al mount)
  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    
    if (savedToken) {
      // Imposta immediatamente il token nello stato (prima della verifica)
      // Questo assicura che il token sia disponibile per le richieste API
      setToken(savedToken);
      
      // Verifica sempre il token per ottenere dati utente aggiornati dal server
      // Questo assicura che profile_completed sia sempre aggiornato
      // IMPORTANTE: Chiama verifyToken direttamente senza includerlo nelle dipendenze
      // per evitare loop infiniti. verifyToken è già stabile grazie a useCallback.
      verifyToken(savedToken).catch(err => {
        console.error('Errore nella verifica iniziale del token:', err);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Solo al mount, non dipendere da verifyToken per evitare loop

  const value = {
    user,
    token,
    login,
    logout,
    loading,
    permissions,
    hasPermission,
    verifyToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
