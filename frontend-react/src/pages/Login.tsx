import React, { useState, useEffect } from 'react';
import { useNavigate, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../services/authApi';
import { getServiceUrl } from '../utils/apiConfig';
import './Login.css';

const Login: React.FC = () => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [nome, setNome] = useState('');
  const [cognome, setCognome] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, login, verifyToken, loading: authLoading } = useAuth();
  
  // Gestisci messaggi e errori dall'URL
  useEffect(() => {
    const urlError = searchParams.get('error');
    const urlMessage = searchParams.get('message');
    const urlToken = searchParams.get('token');
    
    // Pulisci i parametri URL dopo averli letti per evitare ri-processamento
    if (urlError || urlMessage || urlToken) {
      const newSearchParams = new URLSearchParams(window.location.search);
      newSearchParams.delete('error');
      newSearchParams.delete('message');
      newSearchParams.delete('token');
      const newUrl = window.location.pathname + (newSearchParams.toString() ? `?${newSearchParams.toString()}` : '');
      window.history.replaceState({}, '', newUrl);
    }
    
    if (urlError) {
      switch (urlError) {
        case 'pending_approval':
          setMessage('Il tuo account è in attesa di approvazione. Riceverai una email quando sarà approvato.');
          break;
        case 'account_disabled':
          setError('Il tuo account è stato disattivato. Contatta un amministratore.');
          break;
        case 'oauth_cancelled':
          setError('Accesso Google annullato.');
          break;
        default:
          setError(urlError);
      }
    }
    
    if (urlMessage) {
      switch (urlMessage) {
        case 'registration_pending':
          setMessage('✅ Registrazione completata! La tua richiesta è in attesa di approvazione da parte di un amministratore. Riceverai una email quando sarà approvata.');
          break;
        default:
          setMessage(urlMessage);
      }
    }
    
    // Se c'è un token OAuth nell'URL, verificalo
    if (urlToken) {
      handleGoogleCallback(urlToken);
    }
  }, [searchParams]);
  
  const handleGoogleCallback = async (token: string) => {
    setLoading(true);
    setError('');
    setMessage('');
    try {
      // IMPORTANTE: Salva il path PRIMA di verificare il token, perché potrebbe essere perso
      const savedPathBeforeAuth = localStorage.getItem('oauth_redirect_path');
      
      // Salva il token prima di verificarlo
      localStorage.setItem('auth_token', token);
      
      // Verifica il token (questo caricherà anche i permessi)
      await verifyToken(token);
      
      // Attendi che lo stato dell'utente sia completamente aggiornato
      // Aspetta che authLoading diventi false (massimo 2 secondi)
      let attempts = 0;
      while (authLoading && attempts < 40) {
        await new Promise(resolve => setTimeout(resolve, 50));
        attempts++;
      }
      
      // Attendi un momento aggiuntivo per assicurarsi che tutti i re-render siano completati
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Se la verifica ha successo, reindirizza al path originale salvato
      // IMPORTANTE: Ripristina il path se è stato perso durante la verifica
      const oauthPath = localStorage.getItem('oauth_redirect_path') || savedPathBeforeAuth;
      const statePath = location.state?.from?.pathname;
      const from = oauthPath || statePath || '/dashboard';
      
      // Se il path non c'è, ripristinalo dal valore salvato prima
      if (!localStorage.getItem('oauth_redirect_path') && savedPathBeforeAuth && savedPathBeforeAuth !== '/dashboard') {
        localStorage.setItem('oauth_redirect_path', savedPathBeforeAuth);
      }
      
      console.log('🔍 OAuth Callback - Redirect a:', { 
        oauthPath, 
        savedPathBeforeAuth,
        statePath, 
        from, 
        authLoading, 
        user: user?.username,
        finalPath: localStorage.getItem('oauth_redirect_path')
      });
      
      // NON pulire il path salvato ancora - verrà pulito solo quando l'utente arriva effettivamente
      // alla destinazione finale (in ProtectedRoute o ProfileForm quando il redirect è completato)
      
      // Usa setTimeout con delay per assicurarsi che tutti i componenti siano stati renderizzati
      setTimeout(() => {
        console.log('🔍 OAuth Callback - Eseguendo navigate a:', from);
        navigate(from, { replace: true });
      }, 100);
    } catch (err: any) {
      setError(err.message || 'Errore nella verifica del token');
      setMessage('');
      localStorage.removeItem('auth_token');
      // NON pulire il path in caso di errore - l'utente potrebbe riprovare
    } finally {
      setLoading(false);
    }
  };
  
  const handleGoogleLogin = () => {
    // Leggi il path originale già salvato in localStorage (da ProtectedRoute)
    // oppure salvalo da location.state o location.pathname
    const savedPath = localStorage.getItem('oauth_redirect_path');
    const statePath = location.state?.from?.pathname;
    const currentPath = location.pathname !== '/login' ? location.pathname : null;
    const from = savedPath || statePath || currentPath || '/dashboard';
    
    // Se non c'è già un path salvato, salvalo ora
    if (!savedPath && from !== '/dashboard') {
      localStorage.setItem('oauth_redirect_path', from);
    }
    
    console.log('🔍 OAuth Start - Salvando path:', { savedPath, statePath, currentPath, from });
    
    // Usa Auth Service invece del monolite
    window.location.href = authApi.getGoogleOAuthUrl();
  };

  // Determina dove reindirizzare dopo il login
  // Preferisci il path dallo state, altrimenti usa il pathname corrente se diverso da /login
  // o la dashboard come fallback
  const from = location.state?.from?.pathname || 
               (location.pathname !== '/login' ? location.pathname : '/dashboard');

  // Se già autenticato, redirect alla route originale o dashboard
  // Controlla anche il localStorage per il path salvato
  if (user) {
    const savedPath = localStorage.getItem('oauth_redirect_path');
    const finalPath = savedPath || from;
    
    // NON pulire il path salvato - verrà pulito solo quando l'utente arriva
    // effettivamente alla destinazione finale
    
    console.log('🔍 Login già autenticato - Redirect:', { savedPath, from, finalPath });
    return <Navigate to={finalPath} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (isRegistering) {
      // Registrazione
      try {
        // Validazione
        if (password !== confirmPassword) {
          setError('Le password non corrispondono');
          setLoading(false);
          return;
        }

        if (password.length < 6) {
          setError('La password deve essere di almeno 6 caratteri');
          setLoading(false);
          return;
        }

        // Usa API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
        const AUTH_SERVICE_URL = getServiceUrl('auth');

        const response = await fetch(`${AUTH_SERVICE_URL}/api/auth/register-public`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            username,
            password,
            email,
            nome,
            cognome,
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.detail || 'Errore durante la registrazione');
        }

        // Successo - mostra messaggio identico a Google OAuth
        setMessage('✅ Registrazione completata! La tua richiesta è in attesa di approvazione da parte di un amministratore. Riceverai una email quando sarà approvata.');
        setIsRegistering(false);
        // Reset form
        setUsername('');
        setPassword('');
        setConfirmPassword('');
        setEmail('');
        setNome('');
        setCognome('');
      } catch (err: any) {
        setError(err.message || 'Errore durante la registrazione');
      } finally {
        setLoading(false);
      }
    } else {
      // Login
    try {
      await login(username, password);
        
        // Dopo il login standard, controlla anche il localStorage per il path salvato
        const savedPath = localStorage.getItem('oauth_redirect_path');
        const finalPath = savedPath || from;
        
        console.log('🔍 Login Standard Redirect:', { savedPath, from, finalPath });
        
        // NON pulire il path salvato ancora - verrà pulito solo quando l'utente arriva
        // effettivamente alla destinazione finale (in ProtectedRoute o ProfileForm)
        
        navigate(finalPath, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Errore di autenticazione');
    } finally {
      setLoading(false);
      }
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img 
            src="./assets/logo-evoluzione-imprese.jpg" 
            alt="Evoluzione Imprese" 
            className="login-logo"
          />
          <h1>{isRegistering ? 'Registrazione' : 'Area Riservata'}</h1>
          <p>{isRegistering ? 'Crea un nuovo account' : 'Piattaforma Evoluzione Imprese - Gestione digitale'}</p>
        </div>

        {message && (
          <div className="info-message">
            {message === 'registration_pending' 
              ? '✅ Registrazione completata! La tua richiesta è in attesa di approvazione da parte di un amministratore. Riceverai una email quando sarà approvata.'
              : message
            }
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          {isRegistering && (
            <>
              <div className="form-group">
                <label htmlFor="nome">Nome</label>
                <input
                  type="text"
                  id="nome"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="Inserisci il tuo nome"
                  autoComplete="given-name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="cognome">Cognome</label>
                <input
                  type="text"
                  id="cognome"
                  value={cognome}
                  onChange={(e) => setCognome(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="Inserisci il tuo cognome"
                  autoComplete="family-name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  placeholder="Inserisci la tua email"
                  autoComplete="email"
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="username">Nome Utente</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              disabled={loading}
              placeholder="Inserisci il tuo nome utente"
              autoComplete="username"
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              placeholder={isRegistering ? "Crea una password (min. 6 caratteri)" : "Inserisci la tua password"}
              autoComplete={isRegistering ? "new-password" : "current-password"}
            />
          </div>

          {isRegistering && (
            <div className="form-group">
              <label htmlFor="confirmPassword">Conferma Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                placeholder="Conferma la password"
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
          >
            {loading 
              ? (isRegistering ? 'Registrazione in corso...' : 'Accesso in corso...') 
              : (isRegistering ? 'Registrati' : 'Accedi al Sistema')
            }
          </button>
        </form>

        <div className="login-toggle">
          {isRegistering ? (
            <p>
              Hai già un account?{' '}
              <button 
                type="button"
                className="toggle-link"
                onClick={() => {
                  setIsRegistering(false);
                  setError('');
                  setMessage('');
                }}
                disabled={loading}
              >
                Accedi
              </button>
            </p>
          ) : (
            <p>
              Non hai un account?{' '}
              <button 
                type="button"
                className="toggle-link"
                onClick={() => {
                  setIsRegistering(true);
                  setError('');
                  setMessage('');
                }}
                disabled={loading}
              >
                Registrati
              </button>
            </p>
          )}
        </div>
        
        {!error && !isRegistering && (
          <>
            <div className="login-divider">
              <span>oppure</span>
            </div>
            
            <button 
              type="button"
              className="google-login-button"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" style={{ marginRight: '10px' }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Accedi con Google
            </button>
          </>
        )}

        <div className="login-footer">
          <p>Evoluzione Imprese</p>
          <small>Piattaforma di consulenza digitale - Accesso riservato al personale autorizzato</small>
        </div>
      </div>
    </div>
  );
};

export default Login;
