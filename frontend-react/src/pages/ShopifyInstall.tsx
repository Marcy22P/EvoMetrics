import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import './ShopifyInstall.css';

// API Gateway unificato (porta 10000 in sviluppo, window.location.origin in produzione)
const CLIENTI_SERVICE_URL = import.meta.env.VITE_CLIENTI_SERVICE_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:10000' : window.location.origin);
const SHOPIFY_SERVICE_URL = import.meta.env.VITE_SHOPIFY_SERVICE_URL || 
  (window.location.hostname === 'localhost' ? 'http://localhost:10000' : window.location.origin);

interface MagicLinkData {
  valid: boolean;
  cliente_id: string;
  cliente_nome: string;
  expires_at: string | null;
  is_used: boolean;
  is_active: boolean;
}

const ShopifyInstall: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [linkData, setLinkData] = useState<MagicLinkData | null>(null);
  const [shopName, setShopName] = useState('');
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (token) {
      verifyLink();
    }
  }, [token]);

  const verifyLink = async () => {
    if (!token) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`${CLIENTI_SERVICE_URL}/api/shopify-install/${token}/verify`);
      if (!response.ok) {
        throw new Error('Magic link non valido');
      }
      
      const data = await response.json();
      setLinkData(data);
      
      // Controlla errori dalla query string
      const errorParam = searchParams.get('error');
      if (errorParam) {
        switch (errorParam) {
          case 'invalid_token':
            setError('Magic link non valido');
            break;
          case 'expired':
            setError('Magic link scaduto');
            break;
          case 'used':
            setError('Magic link già utilizzato');
            break;
          case 'revoked':
            setError('Magic link revocato');
            break;
          case 'server_error':
            setError('Errore del server');
            break;
          default:
            setError('Errore sconosciuto');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Errore nella verifica del magic link');
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async () => {
    if (!token || !linkData || !shopName.trim()) {
      setError('Inserisci l\'URL completo del tuo shop Shopify');
      return;
    }

    try {
      setInstalling(true);
      setError(null);
      
      // Normalizza shop URL: accetta sia URL completo che solo nome
      let normalizedShop = shopName.trim().toLowerCase();
      
      // Rimuovi protocollo se presente
      normalizedShop = normalizedShop.replace(/^https?:\/\//, '');
      
      // Rimuovi trailing slash
      normalizedShop = normalizedShop.replace(/\/$/, '');
      
      // Se non termina con .myshopify.com, aggiungilo
      if (!normalizedShop.endsWith('.myshopify.com')) {
        normalizedShop = `${normalizedShop}.myshopify.com`;
      }
      
      // Verifica formato valido
      if (!normalizedShop.match(/^[a-z0-9-]+\.myshopify\.com$/)) {
        setError('Formato URL non valido. Inserisci l\'URL completo (es. osmotique-milano.myshopify.com)');
        setInstalling(false);
        return;
      }
      
      // Avvia OAuth Shopify con magic link token
      const oauthUrl = `${SHOPIFY_SERVICE_URL}/api/shopify/oauth/authorize?shop=${encodeURIComponent(normalizedShop)}&cliente_id=${encodeURIComponent(linkData.cliente_id)}&magic_link_token=${encodeURIComponent(token || '')}`;
      window.location.href = oauthUrl;
    } catch (err: any) {
      setError(err.message || 'Errore nell\'avvio dell\'installazione');
      setInstalling(false);
    }
  };

  if (loading) {
    return (
      <div className="shopify-install-container">
        <div className="shopify-install-content">
          <div className="loading">Verifica magic link...</div>
        </div>
      </div>
    );
  }

  if (error && !linkData) {
    return (
      <div className="shopify-install-container">
        <div className="shopify-install-content">
          <div className="error-message">
            <h2>Errore</h2>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!linkData) {
    return (
      <div className="shopify-install-container">
        <div className="shopify-install-content">
          <div className="error-message">
            <h2>Magic link non trovato</h2>
            <p>Il magic link non è valido o è scaduto.</p>
          </div>
        </div>
      </div>
    );
  }

  const isExpired = linkData.expires_at && new Date(linkData.expires_at) < new Date();
  const isValid = linkData.valid && !isExpired && !linkData.is_used && linkData.is_active;

  return (
    <div className="shopify-install-container">
      <div className="shopify-install-content">
        {/* Logo */}
        <div className="shopify-install-logo">
          <img 
            src="/assets/logo-evoluzione-white.png" 
            alt="Evoluzione Imprese" 
            style={{
              height: '60px',
              width: 'auto',
              objectFit: 'contain',
              display: 'block'
            }}
            onError={(e) => {
              // Nascondi l'immagine se non viene caricata
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        {/* Header */}
        <div className="shopify-install-header">
          <h1>Installa EvoMetrics su Shopify</h1>
          <p className="subtitle">Collega il tuo negozio Shopify a Evoluzione Imprese</p>
        </div>

        {/* Cliente Info */}
        <div className="shopify-install-info">
          <div className="info-card">
            <p className="cliente-name">{linkData.cliente_nome}</p>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {/* Status Messages */}
        {!isValid && (
          <div className="status-message">
            {isExpired && (
              <div className="status-error">
                <strong>Magic link scaduto</strong>
                <p>Questo link è scaduto. Contatta il tuo consulente per ottenere un nuovo link.</p>
              </div>
            )}
            {linkData.is_used && (
              <div className="status-error">
                <strong>Magic link già utilizzato</strong>
                <p>Questo link è già stato utilizzato. Contatta il tuo consulente per ottenere un nuovo link.</p>
              </div>
            )}
            {!linkData.is_active && (
              <div className="status-error">
                <strong>Magic link revocato</strong>
                <p>Questo link è stato revocato. Contatta il tuo consulente per ottenere un nuovo link.</p>
              </div>
            )}
          </div>
        )}

        {/* Install Form */}
        {isValid && (
          <div className="shopify-install-form">
            <div className="form-group">
              <label htmlFor="shopName">
                URL completo del tuo shop Shopify
              </label>
              <input
                type="text"
                id="shopName"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Inserisci qui il link"
                disabled={installing}
              />
              <div className="form-instructions">
                <p className="form-hint-title">Dove trovare l'URL del tuo shop:</p>
                <ol className="form-hint-list">
                  <li>Accedi al tuo <strong>Admin Shopify</strong></li>
                  <li>Vai su <strong>Impostazioni dello shop</strong></li>
                  <li>Seleziona <strong>Domini</strong></li>
                  <li>Copia l'URL che termina con <strong>.myshopify.com</strong></li>
                </ol>
                <p className="form-hint-example">
                  Esempio: <code>osmotique-milano.myshopify.com</code>
                </p>
              </div>
            </div>

            <button
              className="btn-install"
              onClick={handleInstall}
              disabled={!shopName.trim() || installing}
            >
              {installing ? 'Installazione in corso...' : 'Installa EvoMetrics'}
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="shopify-install-footer">
          <p>
            Hai bisogno di aiuto?{' '}
            <a href="mailto:info@evoluzioneimprese.com" className="footer-link">
              Contatta il tuo consulente
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ShopifyInstall;

