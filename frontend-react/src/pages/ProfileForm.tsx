import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getServiceUrl } from '../utils/apiConfig';
import './ProfileForm.css';

const ProfileForm: React.FC = () => {
  const { user, token, verifyToken, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [initialLoading, setInitialLoading] = useState(true);
  
  // Usa useRef per tracciare se il form è stato inizializzato (senza triggerare re-render)
  const formInitializedRef = useRef(false);
  
  // Carica i dati iniziali dal localStorage se disponibili (prima che verifyToken completi)
  const initialUserData = useMemo(() => {
    try {
      const savedUser = localStorage.getItem('auth_user');
      if (savedUser) {
        const parsedUser = JSON.parse(savedUser);
        return {
          nome: parsedUser.nome || '',
          cognome: parsedUser.cognome || '',
          email: parsedUser.email || '',
          username: parsedUser.username || ''
        };
      }
    } catch (e) {
      // Ignora errori di parsing
    }
    return {
      nome: '',
      cognome: '',
      email: '',
      username: ''
    };
  }, []); // Solo al mount, non dipende da user

  // Inizializza formData con i dati dal localStorage o user (senza triggerare re-render)
  const [formData, setFormData] = useState(() => {
    // Prova prima con user, poi con localStorage
    if (user) {
      return {
        nome: user.nome || '',
        cognome: user.cognome || '',
        email: user.email || '',
        username: user.username || ''
      };
    }
    return initialUserData;
  });

  // Mostra loader iniziale per 2 secondi per nascondere le ricariche del form
  useEffect(() => {
    const timer = setTimeout(() => {
      setInitialLoading(false);
    }, 2000);
    
    return () => clearTimeout(timer);
  }, []); // Solo al mount
  
  // Aggiorna formData silenziosamente solo se user cambia E formData non è stato modificato
  // Usa useRef per tracciare se l'utente ha modificato manualmente i campi
  const hasUserModified = useRef(false);
  const lastUserDataRef = useRef<string>('');
  
  useEffect(() => {
    // Se l'utente ha già modificato i campi, non sovrascrivere
    if (hasUserModified.current) {
      return;
    }
    
    // Se il form è già stato inizializzato, non aggiornare
    if (formInitializedRef.current) {
      return;
    }
    
    // Se user è disponibile e ha dati, aggiorna silenziosamente
    if (user && (user.nome || user.cognome || user.email || user.username)) {
      // Crea una stringa di confronto per i dati dell'utente
      const newUserData = JSON.stringify({
        nome: user.nome || '',
        cognome: user.cognome || '',
        email: user.email || '',
        username: user.username || ''
      });
      
      // Aggiorna solo se i dati dell'utente sono effettivamente cambiati
      if (lastUserDataRef.current !== newUserData) {
        // Aggiorna silenziosamente senza triggerare re-render se i valori sono identici
        setFormData(prev => {
          const newData = {
            nome: user.nome || '',
            cognome: user.cognome || '',
            email: user.email || '',
            username: user.username || ''
          };
          
          // Solo aggiorna se i dati sono effettivamente diversi
          if (JSON.stringify(prev) !== JSON.stringify(newData)) {
            lastUserDataRef.current = newUserData;
            return newData;
          }
          
          return prev;
        });
        
        formInitializedRef.current = true;
      }
    }
  }, [user]); // Solo quando user cambia, non dipende da formData per evitare loop

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Marca che l'utente ha modificato manualmente i campi
    if (!hasUserModified.current) {
      hasUserModified.current = true;
    }
    
    // Aggiorna i dati del form senza triggerare re-render inutili
    setFormData(prev => {
      // Solo aggiorna se il valore è effettivamente cambiato
      if (prev[name as keyof typeof prev] === value) {
        return prev;
      }
      return {
        ...prev,
        [name]: value
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Verifica che il token sia presente
    if (!token) {
      setError('Token di autenticazione non disponibile. Effettua nuovamente il login.');
      return;
    }
    
    setLoading(true);

    try {
      // Usa API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
      const USER_SERVICE_URL = getServiceUrl('user');
      
      if (!user?.id) {
        throw new Error('ID utente non disponibile');
      }
      
      const response = await fetch(`${USER_SERVICE_URL}/api/users/${user.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          profile_completed: true
        })
      });

      if (!response.ok) {
        let errorMessage = 'Errore nell\'aggiornamento del profilo';
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorData.message || errorMessage;
          } else {
            // Se la risposta non è JSON (potrebbe essere HTML error page)
            const text = await response.text();
            errorMessage = `Errore server (${response.status}): ${text.substring(0, 100)}`;
          }
        } catch (e) {
          errorMessage = `Errore server (${response.status})`;
        }
        throw new Error(errorMessage);
      }

      // Verifica il token per aggiornare i dati utente nel contesto auth
      // Questo ricaricherà i dati utente aggiornati (incluso profile_completed = true)
      if (token) {
        await verifyToken(token);
        
        // Attendi che authLoading diventi false (massimo 3 secondi)
        let attempts = 0;
        const maxAttempts = 30;
        while (attempts < maxAttempts && authLoading) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        
        // Aspetta un momento aggiuntivo per assicurarsi che lo stato sia completamente aggiornato
        await new Promise(resolve => setTimeout(resolve, 300));
        
        console.log('🔍 ProfileForm - Verifica completata:', {
          authLoading,
          user: user?.username,
          profileCompleted: (user as any)?.profile_completed
        });
      }
      
      // Dopo aver completato il profilo, reindirizza sempre alla Dashboard
      // Non usare il path salvato perché l'obiettivo è portare l'utente alla Dashboard
      console.log('🔍 ProfileForm - Profilo completato, redirect alla Dashboard');
      
      // Usa window.location.href per forzare un reload completo e assicurare che
      // ProtectedRoute veda l'utente aggiornato (profile_completed = true)
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Errore nell\'aggiornamento del profilo');
    } finally {
      setLoading(false);
    }
  };

  const isGoogleUser = user?.email && user.email.includes('@');

  // Mostra loader durante il caricamento iniziale
  if (initialLoading || authLoading) {
    return (
      <div className="profile-form-container">
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          color: 'var(--text-primary, #fff)'
        }}>
          <div style={{
            width: '50px',
            height: '50px',
            border: '4px solid rgba(255, 255, 255, 0.1)',
            borderTop: '4px solid var(--primary-color, #667eea)',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '20px'
          }}></div>
          <p style={{ fontSize: '16px', opacity: 0.8 }}>Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-form-container">
      <div className="profile-form-card">
        <div className="profile-form-header">
          <h1>Completa il tuo Profilo</h1>
          <p>Prima di accedere alla piattaforma, completa il tuo profilo con i tuoi dati</p>
        </div>

        <form onSubmit={handleSubmit} className="profile-form" noValidate>
          <div className="form-group">
            <label htmlFor="nome">Nome *</label>
            <input
              type="text"
              id="nome"
              name="nome"
              value={formData.nome}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="Inserisci il tuo nome"
              autoComplete="given-name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="cognome">Cognome *</label>
            <input
              type="text"
              id="cognome"
              name="cognome"
              value={formData.cognome}
              onChange={handleChange}
              required
              disabled={loading}
              placeholder="Inserisci il tuo cognome"
              autoComplete="family-name"
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email {isGoogleUser && '(precompilata da Google)'}</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              disabled={isGoogleUser || loading}
              required
              placeholder="Inserisci la tua email"
              style={{ opacity: isGoogleUser ? 0.7 : 1 }}
              autoComplete="email"
            />
            {isGoogleUser && (
              <small style={{ color: '#666', fontSize: '12px' }}>
                Email non modificabile per utenti Google
              </small>
            )}
          </div>

          <div className="form-group">
            <label htmlFor="username">Nome Utente</label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              disabled={loading}
              required
              placeholder="Scegli un nome utente"
              autoComplete="username"
            />
          </div>

          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="submit-button"
            disabled={loading || !formData.nome || !formData.cognome}
          >
            {loading ? 'Salvataggio...' : 'Completa Profilo'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProfileForm;

