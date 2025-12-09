import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import './ShopifyThankYou.css';

const ShopifyThankYou: React.FC = () => {
  const [searchParams] = useSearchParams();
  const shopName = searchParams.get('shop');
  const clienteName = searchParams.get('cliente');

  useEffect(() => {
    // Rimuovi i parametri dall'URL dopo il caricamento
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  return (
    <div className="shopify-thankyou-container">
      <div className="shopify-thankyou-content">
        {/* Logo */}
        <div className="shopify-thankyou-logo">
          <img 
            src="./assets/logo-evoluzione-white.png" 
            alt="Evoluzione Imprese" 
            style={{
              height: '60px',
              width: 'auto',
              objectFit: 'contain',
              display: 'block'
            }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>

        {/* Success Icon */}
        <div className="success-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
            <path d="M8 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Header */}
        <div className="shopify-thankyou-header">
          <h1>Installazione Completata!</h1>
          <p className="subtitle">EvoMetrics è stato installato con successo sul tuo negozio Shopify</p>
        </div>

        {/* Info Card */}
        <div className="shopify-thankyou-info">
          <div className="info-card">
            {shopName && (
              <div className="info-item">
                <label>Shop Shopify</label>
                <p className="info-value">{shopName}</p>
              </div>
            )}
            {clienteName && (
              <div className="info-item">
                <label>Cliente</label>
                <p className="info-value">{clienteName}</p>
              </div>
            )}
          </div>
        </div>

        {/* Message */}
        <div className="shopify-thankyou-message">
          <p>
            L'integrazione è stata configurata correttamente. Ora puoi monitorare le metriche del tuo negozio Shopify direttamente dalla piattaforma Evoluzione Imprese.
          </p>
        </div>

        {/* Footer */}
        <div className="shopify-thankyou-footer">
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

export default ShopifyThankYou;

